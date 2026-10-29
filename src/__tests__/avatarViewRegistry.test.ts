import {describe, expect, it, vi} from 'vitest';
import {Group, Mesh, BoxGeometry, MeshBasicMaterial, PerspectiveCamera, Scene} from 'three';
import {AvatarViewRegistry, avatarViewSignature, type AvatarViewHandle, type AvatarViewRequest} from '../lib/avatarViewRegistry';

function request(id: string, overrides: Partial<AvatarViewRequest> = {}): AvatarViewRequest {
    const target = {width: 128, height: 160, getContext: vi.fn(() => ({clearRect: vi.fn()}))} as unknown as HTMLCanvasElement;
    return {id, config: {head: 'synthetic-head', body: 'synthetic-body'}, mode: 'thumbnail', revision: 'test-revision',
        width: 128, height: 160, dpr: 1, target, visible: true, ...overrides};
}

function attach(registry: AvatarViewRegistry, handle: AvatarViewHandle) {
    const view = registry.getView(handle)!;
    const job = registry.getJob(view.jobId)!;
    const token = registry.jobToken(job);
    const group = new Group();
    group.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
    registry.attachScene(token, new Scene(), new PerspectiveCamera());
    registry.setSceneStatus(token, {ready: true, signature: job.signature, group, framing: null,
        expectedParts: ['head'], frameSubmitted: false});
    return {job, view, token, copy: registry.copyToken(view)};
}
const evidence = {drawCalls: 2, meshCount: 1, copied: true, timestamp: 123};

describe('session avatar view registry', () => {
    it('pins every visible view with independent body/profile scenes, never a two-slot budget', () => {
        const registry = new AvatarViewRegistry();
        const handles = ['a', 'b', 'c', 'd'].map(id => registry.register(request(id)));
        const jobs = handles.map(handle => attach(registry, handle).job);
        expect(registry.getSnapshot().views).toHaveLength(4);
        expect(jobs.every(job => registry.isActive(job))).toBe(true);
        expect(new Set(jobs.map(job => job.group)).size).toBe(4);
        const profile = registry.register(request('profile', {mode: 'profile'}));
        expect(attach(registry, profile).job.group).not.toBe(jobs[0].group);
    });

    it('normalizes none/empty/config order and includes animation revision, dimensions and clamped DPR', () => {
        const base = request('a', {mode: 'head', config: {head: 'x', body: 'ignored', accessory: 'none'}});
        expect(avatarViewSignature(base)).toBe(avatarViewSignature({...base, config: {body: 'other', head: 'x', animation: 'Dance'}}));
        expect(avatarViewSignature({...base, dpr: 3})).toBe(avatarViewSignature({...base, dpr: 1.5}));
        for (const override of [{revision: 'new'}, {width: 36}, {mode: 'profile' as const}, {config: {head: 'y'}}]) {
            expect(avatarViewSignature({...base, ...override})).not.toBe(avatarViewSignature(base));
        }
    });

    it('deduplicates head jobs for all subscribers and retains one referenced portrait on detach', () => {
        const registry = new AvatarViewRegistry();
        const a = registry.register(request('a', {mode: 'head'}));
        const b = registry.register(request('b', {mode: 'head'}));
        expect(registry.getView(a)!.jobId).toBe(registry.getView(b)!.jobId);
        expect(registry.getSnapshot().jobs).toHaveLength(1);
        registry.unregister(a);
        const job = registry.getJob(registry.getView(b)!.jobId)!;
        expect(job.subscribers.size).toBe(1);
        expect(registry.isActive(job)).toBe(true);
        registry.unregister(b);
        expect(registry.isActive(job)).toBe(false);
        const next = registry.register(request('c', {mode: 'head'}));
        expect(registry.getView(next)!.jobId).toBe(job.id);
    });

    it('certifies only a successful copy of this ready job/signature/lease/generation', () => {
        const registry = new AvatarViewRegistry();
        const callback = vi.fn();
        const handle = registry.register(request('a', {onFrameCopied: callback}));
        const {copy} = attach(registry, handle);
        for (const invalid of [{drawCalls: 0}, {meshCount: 0}, {copied: false}]) {
            expect(registry.confirmCopy(copy, {...evidence, ...invalid})).toBe(false);
        }
        expect(registry.confirmCopy({...copy, generation: 0}, evidence)).toBe(false);
        expect(registry.confirmCopy({...copy, lease: -1}, evidence)).toBe(false);
        expect(registry.confirmCopy(copy, evidence)).toBe(true);
        expect(callback).toHaveBeenCalledTimes(1);
        const previous = registry.getView(handle)!.frame;
        registry.update(handle, request('a', {config: {head: 'new-outfit'}}));
        expect(registry.getView(handle)!.frame).toBe(previous);
        expect(registry.confirmCopy(copy, evidence)).toBe(false);
        registry.unregister(handle);
        const replacement = registry.register(request('a'));
        expect(registry.confirmCopy(copy, evidence)).toBe(false);
        expect(registry.getView(replacement)!.frame).toBeUndefined();
    });

    it('evicts only hidden LRU assemblies, preserves painted cells and reacquires hidden subscribers', () => {
        const registry = new AvatarViewRegistry();
        const firstRequest = request('visible');
        const visible = registry.register(firstRequest);
        const visibleJob = attach(registry, visible).job;
        const hiddenRequest = request('hidden', {visible: false, prepare: true});
        const hidden = registry.register(hiddenRequest);
        const cached = attach(registry, hidden);
        registry.confirmCopy(cached.copy, evidence);
        registry.update(hidden, {...hiddenRequest, prepare: false});
        const frame = registry.getView(hidden)!.frame;
        for (let i = 0; i < 20; i++) {
            registry.register(request(`offscreen-${i}`, {visible: false, config: {head: `head-${i}`}}));
        }
        expect(registry.getSnapshot().jobs.filter(job => !registry.isActive(job))).toHaveLength(16);
        expect(registry.getJob(visibleJob.id)).toBe(visibleJob);
        expect(registry.getView(hidden)!.jobId).toBe('');
        expect(registry.getView(hidden)!.frame).toBe(frame);
        expect(hiddenRequest.target.getContext).not.toHaveBeenCalled();
        expect(registry.setPresentation(cached.token, null)).toBe(false);
        registry.update(hidden, {...hiddenRequest, prepare: false, visible: true});
        expect(registry.getView(hidden)!.jobId).not.toBe('');
        expect(registry.isActive(registry.getJob(registry.getView(hidden)!.jobId)!)).toBe(true);
    });

    it('keeps job presentation commands for the right subscribers, never an unrelated frame', () => {
        const registry = new AvatarViewRegistry();
        const a = registry.register(request('a'));
        const b = registry.register(request('b'));
        const aa = attach(registry, a);
        const bb = attach(registry, b);
        const notify = vi.fn();
        const retry = vi.fn().mockResolvedValue(undefined);
        registry.setPresentation(aa.token, {phase: 'deferred-error', active: true, retryAnimations: retry, notifyFrameCopied: notify});
        registry.confirmCopy(bb.copy, evidence);
        expect(notify).not.toHaveBeenCalled();
        registry.confirmCopy(aa.copy, evidence);
        expect(notify).toHaveBeenCalledTimes(1);
        expect(registry.getJob(aa.job.id)!.presentation!.retryAnimations).toBe(retry);
    });

    it('clears account references, frames and listeners and rejects all late callbacks', () => {
        const registry = new AvatarViewRegistry();
        const listener = vi.fn();
        const unsubscribe = registry.subscribe(listener);
        const req = request('private');
        const handle = registry.register(req);
        const {job, copy, token} = attach(registry, handle);
        registry.confirmCopy(copy, evidence);
        const snapshot = registry.getSnapshot();
        expect(registry.getSnapshot()).toBe(snapshot);
        registry.clearSession();
        const count = listener.mock.calls.length;
        expect(registry.getSnapshot().jobs).toEqual([]);
        expect(registry.getSnapshot().views).toEqual([]);
        expect(job.group).toBeUndefined();
        expect(job.presentation).toBeNull();
        expect(job.subscribers.size).toBe(0);
        expect(registry.confirmCopy(copy, evidence)).toBe(false);
        expect(registry.setPresentation(token, null)).toBe(false);
        registry.unregister(handle);
        registry.clearSession();
        unsubscribe();
        expect(listener).toHaveBeenCalledTimes(count);
        expect(() => registry.register(request('new'))).toThrow('session has ended');
    });
});
