import {beforeEach, describe, expect, it, vi} from 'vitest';
import {BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, type WebGLRenderer} from 'three';
import {captureSharedAvatarFrame, presentSharedAvatarFrame, renderSharedAvatarCycle, sharedAvatarSourceSize} from '../lib/sharedAvatarFrames';
import {AvatarViewRegistry, type AvatarViewRequest} from '../lib/avatarViewRegistry';
import {AvatarPreparationQueue} from '../lib/avatarPreparationQueue';
import type {AvatarViewportSession} from '../lib/avatarViewportContext';

const contexts = new WeakMap<HTMLCanvasElement, ReturnType<typeof context2d>>();
function context2d() { return {drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), clearRect: vi.fn(), globalCompositeOperation: 'source-over'}; }
function canvas(width = 128, height = 160) {
    const element = document.createElement('canvas');
    element.width = width; element.height = height;
    return element;
}
function request(id: string, overrides: Partial<AvatarViewRequest> = {}): AvatarViewRequest {
    return {id, config: {head: 'synthetic'}, mode: 'thumbnail', revision: 'synthetic-rev', width: 128, height: 160,
        dpr: 1, target: canvas(), visible: true, ...overrides};
}
function session(): AvatarViewportSession {
    return {registry: new AvatarViewRegistry(), preparation: new AvatarPreparationQueue(), emitMetric: vi.fn(),
        subscribeMetrics: () => () => {}, dispose: vi.fn()};
}
function ready(s: AvatarViewportSession, req: AvatarViewRequest, calls = 1) {
    const handle = s.registry.register(req);
    const job = s.registry.getJob(s.registry.getView(handle)!.jobId)!;
    const token = s.registry.jobToken(job);
    const scene = new Scene();
    scene.userData.calls = calls;
    const group = new Group();
    group.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
    s.registry.attachScene(token, scene, new PerspectiveCamera());
    s.registry.setSceneStatus(token, {signature: job.signature, group, ready: true, frameSubmitted: false, framing: null, expectedParts: ['head']});
    return {handle, job};
}
function renderer() {
    const gl = {domElement: canvas(600, 700), info: {autoReset: true, render: {calls: 200}},
        getContext: () => ({isContextLost: () => false}), getPixelRatio: () => 1.5,
        setViewport: vi.fn(), setScissor: vi.fn(), setScissorTest: vi.fn(), clear: vi.fn(),
        render: vi.fn((scene: Scene) => { gl.info.render.calls += Number(scene.userData.calls); })};
    return gl;
}
describe('shared avatar frame passes (deterministic backend, no pixel claim)', () => {
    beforeEach(() => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function(this: HTMLCanvasElement) {
            let context = contexts.get(this);
            if (!context) { context = context2d(); contexts.set(this, context); }
            return context as unknown as CanvasRenderingContext2D;
        });
    });

    it('copies the bottom-left WebGL rectangle immediately with explicit top-left crop/alpha replacement', () => {
        const source = canvas(400, 500);
        const buffer = canvas();
        const target = canvas();
        expect(captureSharedAvatarFrame(source, buffer, 96, 128)).toBe(true);
        expect(contexts.get(buffer)!.drawImage).toHaveBeenCalledWith(source, 0, 372, 96, 128, 0, 0, 96, 128);
        expect(presentSharedAvatarFrame(buffer, target)).toBe(true);
        expect(contexts.get(target)!.drawImage).toHaveBeenCalledWith(buffer, 0, 0, 96, 128);
        expect(contexts.get(target)!.globalCompositeOperation).toBe('copy');
        expect(contexts.get(target)!.clearRect).not.toHaveBeenCalled();
        expect([target.width, target.height]).toEqual([96, 128]);
    });

    it('preserves a target when capture fails, never substitutes 2D primitives or a timer', () => {
        const source = canvas(); const buffer = canvas(); const target = canvas();
        buffer.getContext('2d');
        contexts.get(buffer)!.drawImage.mockImplementation(() => { throw new Error('copy failed'); });
        expect(captureSharedAvatarFrame(source, buffer, 128, 160)).toBe(false);
        expect(contexts.has(target)).toBe(false);
        expect(captureSharedAvatarFrame(source, buffer, 0, 0)).toBe(false);
        expect(captureSharedAvatarFrame(source, buffer, 999, 160)).toBe(false);
    });

    it('renders all four visible body cells fairly, with one backend and per-scene draw-call evidence', () => {
        const s = session(); const gl = renderer();
        const jobs = ['first', 'second', 'third', 'fourth'].map(id => ready(s, request(id)));
        renderSharedAvatarCycle(gl as unknown as WebGLRenderer, s, new WeakMap());
        expect(gl.render).toHaveBeenCalledTimes(4);
        for (const {handle} of jobs) expect(s.registry.getView(handle)!.frame).toMatchObject({drawCalls: 1, copies: 1});
        expect(gl.info.autoReset).toBe(true);
        expect(s.emitMetric).toHaveBeenCalledWith(expect.objectContaining({kind: 'cycle', durationMs: expect.any(Number)}));
    });

    it('shares one portrait render and one WebGL capture among identical heads', () => {
        const s = session(); const gl = renderer();
        const a = ready(s, request('a', {mode: 'head', width: 36, height: 36}));
        const b = s.registry.register(request('b', {mode: 'head', width: 36, height: 36}));
        const body = ready(s, request('body'));
        renderSharedAvatarCycle(gl as unknown as WebGLRenderer, s, new WeakMap());
        expect(gl.render).toHaveBeenCalledTimes(2);
        expect(contexts.get(a.job.lastFrame!)!.drawImage).toHaveBeenCalledTimes(1);
        expect(s.registry.getView(b)!.frame?.copies).toBe(1);
        expect(s.registry.getView(body.handle)!.frame?.copies).toBe(1);
    });

    it('does not use a neighbours draw calls, update invisible cells or certify a lost context', () => {
        const s = session(); const gl = renderer();
        const empty = ready(s, request('empty'), 0);
        const valid = ready(s, request('valid'));
        const hidden = ready(s, request('hidden', {visible: false}));
        renderSharedAvatarCycle(gl as unknown as WebGLRenderer, s, new WeakMap());
        expect(s.registry.getView(empty.handle)!.frame).toBeUndefined();
        expect(s.registry.getView(hidden.handle)!.frame).toBeUndefined();
        expect(s.registry.getView(valid.handle)!.frame).toBeDefined();
        gl.getContext = () => ({isContextLost: () => true});
        renderSharedAvatarCycle(gl as unknown as WebGLRenderer, s, new WeakMap());
        expect(s.registry.getView(valid.handle)!.frame?.copies).toBe(1);
    });

    it('sizes the source once to the maximum active need, clamps DPR1/3, applies viewport/scissor at root DPR', () => {
        const s = session(); const gl = renderer();
        ready(s, request('small', {dpr: 1}));
        const large = ready(s, request('large', {dpr: 3, width: 390, height: 422}));
        expect(sharedAvatarSourceSize(s.registry.getSnapshot().jobs, s)).toEqual({width: 390, height: 422, dpr: 1.5});
        renderSharedAvatarCycle(gl as unknown as WebGLRenderer, s, new WeakMap());
        expect(gl.setViewport).toHaveBeenCalledWith(0, 0, 390, 422);
        expect(gl.setScissor).toHaveBeenCalledWith(0, 0, 390, 422);
        expect(s.registry.getView(large.handle)!.target.width).toBe(585);
        expect(s.registry.getView(large.handle)!.target.height).toBe(633);
    });
});
