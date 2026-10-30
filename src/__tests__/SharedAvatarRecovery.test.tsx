import React, {createContext, useContext, useState} from 'react';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene} from 'three';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import SharedAvatar from '../components/3D/SharedAvatar';
import SharedAvatarRenderer, {SharedAvatarJob} from '../components/3D/SharedAvatarRenderer';
import {AvatarViewportContext, createAvatarViewportSession, type AvatarViewportSession} from '../lib/avatarViewportContext';

function createRenderer() {
    const gl = {domElement: document.createElement('canvas'), lost: false, dispose: vi.fn(),
        getContext: () => ({isContextLost: () => gl.lost, getExtension: () => ({})}),
        forceContextLoss: vi.fn(() => { gl.lost = true; gl.domElement.dispatchEvent(new Event('webglcontextlost', {cancelable: true})); })};
    return gl;
}
const fiberContext = createContext<{gl: ReturnType<typeof createRenderer>} | null>(null);
const renderers: ReturnType<typeof createRenderer>[] = [];
let sceneRenders = 0;
vi.mock('../components/3D/AvatarScene', () => ({default: function SceneDouble() { sceneRenders++; return null; }}));
vi.mock('@react-three/fiber', () => ({
    Canvas: function SourceDouble({children}: React.PropsWithChildren) {
        const [gl] = useState(() => { const renderer = createRenderer(); renderers.push(renderer); return renderer; });
        React.useEffect(() => () => { gl.lost = true; }, [gl]);
        return <fiberContext.Provider value={{gl}}><div data-testid="one-source">{children}</div></fiberContext.Provider>;
    },
    useThree: (selector: (state: {gl: ReturnType<typeof createRenderer>}) => unknown) => selector(useContext(fiberContext)!),
    useFrame: () => {}, createPortal: (children: React.ReactNode) => children,
}));

function host(session: AvatarViewportSession, active = true, head = 'fixture-a') {
    return <QueryClientProvider client={new QueryClient()}><AvatarViewportContext.Provider value={session}>
        <SharedAvatar config={{head}} active={active} mode="head"/><SharedAvatar config={{head: 'fixture-b'}} mode="head"/>
        <SharedAvatarRenderer session={session}/>
    </AvatarViewportContext.Provider></QueryClientProvider>;
}
function paint(session: AvatarViewportSession, index: number) {
    const view = session.registry.getSnapshot().views[index];
    const job = session.registry.getJob(view.jobId)!;
    const token = session.registry.jobToken(job);
    const group = new Group(); group.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
    session.registry.attachScene(token, new Scene(), new PerspectiveCamera());
    session.registry.setSceneStatus(token, {signature: job.signature, ready: true, group, expectedParts: ['head'], frameSubmitted: false, framing: null});
    view.target.getContext('2d')!.drawImage(document.createElement('canvas'), 0, 0);
    return session.registry.confirmCopy(session.registry.copyToken(view), {copied: true, drawCalls: 1, meshCount: 1, timestamp: performance.now()});
}
function lose(gl: ReturnType<typeof createRenderer>) {
    gl.lost = true;
    gl.domElement.dispatchEvent(new Event('webglcontextlost', {cancelable: true}));
}
function restore(gl: ReturnType<typeof createRenderer>) {
    gl.lost = false;
    gl.domElement.dispatchEvent(new Event('webglcontextrestored'));
}
describe('shared recovery lifecycle (DOM simulation, not native Safari qualification)', () => {
    beforeEach(() => {
        renderers.length = 0;
        sceneRenders = 0;
        vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 36, 36));
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({drawImage: vi.fn(), clearRect: vi.fn()}) as unknown as CanvasRenderingContext2D);
    });
    it('retains every painted cell on loss and recertifies each independently after native restoration', () => {
        const session = createAvatarViewportSession(); const view = render(host(session));
        act(() => { paint(session, 0); paint(session, 1); });
        const targets = [...view.container.querySelectorAll('[data-avatar-cell]')];
        const first = session.registry.getSnapshot().views[0];
        const stale = session.registry.copyToken(first); const frame = first.frame;
        const gl = renderers[0];
        act(() => lose(gl));
        expect(session.registry.getSnapshot().views[0].frame).toBe(frame);
        expect([...view.container.querySelectorAll('[data-avatar-cell]')]).toEqual(targets);
        expect(screen.getAllByRole('status', {name: 'Contexte WebGL perdu'})).toHaveLength(2);
        expect(session.registry.confirmCopy(stale, {copied: true, drawCalls: 99, meshCount: 1, timestamp: 10})).toBe(false);
        act(() => restore(gl));
        expect(session.registry.contextStatus).toBe('restoring');
        act(() => { paint(session, 0); });
        expect(view.container.querySelectorAll('[data-avatar-state="frame-ready"]')).toHaveLength(1);
        expect(screen.getAllByRole('status', {name: 'Restauration de l’affichage'})).toHaveLength(1);
        act(() => { paint(session, 1); });
        expect(session.registry.contextStatus).toBe('ready');
        expect(view.container.querySelectorAll('[data-avatar-state="frame-ready"]')).toHaveLength(2);
        expect(renderers).toHaveLength(1);
    });
    it('deduplicates loss/restoration events rather than advancing generations on every callback', () => {
        const session = createAvatarViewportSession(); render(host(session));
        act(() => lose(renderers[0])); const generation = session.registry.generation;
        act(() => lose(renderers[0])); expect(session.registry.generation).toBe(generation);
        act(() => { restore(renderers[0]); restore(renderers[0]); });
        expect(session.registry.generation).toBe(generation);
        expect(session.registry.contextStatus).toBe('restoring');
    });
    it('two retry buttons destroy the previous source before one replacement, rejecting its late events', () => {
        const session = createAvatarViewportSession(); const view = render(host(session));
        act(() => { paint(session, 0); paint(session, 1); lose(renderers[0]); });
        const old = renderers[0]; const buttons = screen.getAllByRole('button', {name: 'Réessayer l’affichage'});
        act(() => { fireEvent.click(buttons[0]); fireEvent.click(buttons[1]); });
        expect(old.dispose).toHaveBeenCalledTimes(1);
        expect(old.lost).toBe(true);
        expect(renderers).toHaveLength(2);
        expect(renderers.filter(renderer => !renderer.lost)).toHaveLength(1);
        expect(screen.getAllByTestId('one-source')).toHaveLength(1);
        const epoch = session.registry.sourceEpoch; const generation = session.registry.generation;
        act(() => restore(old));
        expect(session.registry.sourceEpoch).toBe(epoch); expect(session.registry.generation).toBe(generation);
        act(() => { paint(session, 0); paint(session, 1); });
        expect(view.container.querySelectorAll('[data-avatar-state="frame-ready"]')).toHaveLength(2);
    });
    it('logout during restoration drops commands/listeners and cannot repaint the ended account', () => {
        const session = createAvatarViewportSession(); const view = render(host(session));
        act(() => { paint(session, 0); lose(renderers[0]); restore(renderers[0]); });
        const token = session.registry.copyToken(session.registry.getSnapshot().views[0]);
        const removed = vi.spyOn(renderers[0].domElement, 'removeEventListener');
        act(() => session.dispose()); view.unmount();
        act(() => restore(renderers[0]));
        expect(session.registry.retrySource()).toBe(false);
        expect(session.registry.getSnapshot().views).toHaveLength(0);
        expect(session.registry.confirmCopy(token, {copied: true, drawCalls: 1, meshCount: 1, timestamp: 1})).toBe(false);
        expect(removed).toHaveBeenCalledWith('webglcontextlost', expect.any(Function));
        expect(removed).toHaveBeenCalledWith('webglcontextrestored', expect.any(Function));
    });

    it('coalesces observer geometry changes outside delivery, skips identical sizes and cancels on unmount', async () => {
        const callbacks: ResizeObserverCallback[] = [];
        vi.stubGlobal('ResizeObserver', class {
            constructor(callback: ResizeObserverCallback) { callbacks.push(callback); }
            observe() {} disconnect() {}
        });
        const session = createAvatarViewportSession(); const view = render(host(session));
        const version = session.registry.getSnapshot().version;
        vi.mocked(HTMLDivElement.prototype.getBoundingClientRect).mockReturnValue(new DOMRect(0, 0, 48, 64));
        act(() => { callbacks[0]([], {} as ResizeObserver); callbacks[0]([], {} as ResizeObserver); });
        expect(session.registry.getSnapshot().version).toBe(version);
        expect(session.registry.getSnapshot().views[0].width).toBe(36);
        await act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); });
        expect(session.registry.getSnapshot().views[0].width).toBe(48);
        expect(session.registry.getSnapshot().views[1].width).toBe(36);
        const resized = session.registry.getSnapshot().version;
        act(() => callbacks[0]([], {} as ResizeObserver));
        await act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); });
        expect(session.registry.getSnapshot().version).toBe(resized);
        act(() => callbacks[0]([], {} as ResizeObserver));
        view.unmount();
        await act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); });
        expect(session.registry.getSnapshot().views).toHaveLength(0);
        session.dispose();
    });

    it('recovery buttons do not trigger the surrounding profile card or map player action', async () => {
        const session = createAvatarViewportSession();
        const surroundingClick = vi.fn(); const surroundingKey = vi.fn();
        render(<div onClick={surroundingClick} onKeyDown={surroundingKey}>{host(session)}</div>);
        const job = session.registry.getSnapshot().jobs[0];
        const token = session.registry.jobToken(job);
        const modelRetry = vi.fn(); const animationRetry = vi.fn().mockResolvedValue(undefined);
        act(() => { session.registry.setModelError(token, modelRetry); });
        const model = screen.getByRole('button', {name: 'Réessayer le modèle'});
        fireEvent.keyDown(model, {key: 'Enter'}); fireEvent.click(model);
        expect(modelRetry).toHaveBeenCalledTimes(1);
        expect(surroundingClick).not.toHaveBeenCalled(); expect(surroundingKey).not.toHaveBeenCalled();
        act(() => {
            session.registry.setModelError(token);
            session.registry.setPresentation(token, {phase: 'critical-error', active: true, retryAnimations: animationRetry, notifyFrameCopied: vi.fn()});
        });
        const animation = screen.getByRole('button', {name: 'Réessayer les animations'});
        await act(async () => { fireEvent.keyDown(animation, {key: ' '}); fireEvent.click(animation); });
        expect(animationRetry).toHaveBeenCalledTimes(1);
        expect(surroundingClick).not.toHaveBeenCalled(); expect(surroundingKey).not.toHaveBeenCalled();
        act(() => lose(renderers[0]));
        const source = screen.getAllByRole('button', {name: 'Réessayer l’affichage'})[0];
        fireEvent.keyDown(source, {key: 'Enter'}); fireEvent.click(source);
        expect(renderers[0].dispose).toHaveBeenCalledTimes(1);
        expect(surroundingClick).not.toHaveBeenCalled(); expect(surroundingKey).not.toHaveBeenCalled();
    });

    it('retains a cached scene across unrelated registry updates, but updates activity and GPU generation', () => {
        const session = createAvatarViewportSession();
        const handle = session.registry.register({id: 'cached-scene', config: {head: 'fixture'}, mode: 'profile', revision: 'fixture',
            width: 128, height: 160, dpr: 1, target: document.createElement('canvas'), visible: false});
        const job = session.registry.getJob(session.registry.getView(handle)!.jobId)!;
        const view = render(<SharedAvatarJob session={session} job={job} active={false} generation={1}/>);
        expect(sceneRenders).toBe(1);
        view.rerender(<SharedAvatarJob session={session} job={job} active={false} generation={1}/>);
        expect(sceneRenders).toBe(1);
        view.rerender(<SharedAvatarJob session={session} job={job} active generation={1}/>);
        expect(sceneRenders).toBe(2);
        view.rerender(<SharedAvatarJob session={session} job={job} active generation={2}/>);
        expect(sceneRenders).toBe(3);
    });

    it('offers one viewport recovery action outside the offscreen source and potentially occluded cells', () => {
        const session = createAvatarViewportSession(); render(host(session));
        act(() => { paint(session, 0); paint(session, 1); lose(renderers[0]); });
        const action = screen.getByRole('button', {name: 'Réessayer les avatars'});
        expect(action.closest('[data-avatar-source]')).toBeNull();
        expect(action.closest('[aria-hidden="true"]')).toBeNull();
        expect(screen.getByTestId('avatar-source-recovery')).toHaveClass('fixed');
        fireEvent.click(action);
        expect(renderers[0].dispose).toHaveBeenCalledTimes(1);
        expect(renderers).toHaveLength(2);
        expect(screen.queryByTestId('avatar-source-recovery')).toBeNull();
    });

    it('allocates enough backing pixels for rounded copies at fractional DPR and odd CSS dimensions', () => {
        const session = createAvatarViewportSession();
        session.registry.register({id: 'odd-size', config: {head: 'fixture'}, mode: 'profile', revision: 'fixture',
            width: 63, height: 63, dpr: 1.5, target: document.createElement('canvas'), visible: true});
        const view = render(<SharedAvatarRenderer session={session}/>);
        const source = view.container.querySelector('[data-avatar-source]') as HTMLElement;
        // Three floors its backing buffer. The copy path rounds its rectangles.
        // The source must not shrink to 94px while its target needs 95px.
        expect(Math.floor(Number.parseFloat(source.style.width) * 1.5)).toBeGreaterThanOrEqual(Math.round(63 * 1.5));
        expect(Math.floor(Number.parseFloat(source.style.height) * 1.5)).toBeGreaterThanOrEqual(Math.round(63 * 1.5));
        view.unmount(); session.dispose();
    });

    it('rejects observers already disconnected after an activity/config change, including callbacks delivered late', async () => {
        const intersections: IntersectionObserverCallback[] = []; const resizes: ResizeObserverCallback[] = [];
        vi.stubGlobal('IntersectionObserver', class {
            constructor(callback: IntersectionObserverCallback) { intersections.push(callback); }
            observe() {} disconnect() {}
        });
        vi.stubGlobal('ResizeObserver', class {
            constructor(callback: ResizeObserverCallback) { resizes.push(callback); }
            observe() {} disconnect() {}
        });
        const session = createAvatarViewportSession(); const view = render(host(session, false, 'old-head'));
        const target = view.container.querySelector('[data-avatar-view]')!;
        view.rerender(host(session, true, 'new-head'));
        const current = session.registry.getSnapshot().views[0];
        expect(current.visible).toBe(true); expect(current.config.head).toBe('new-head');
        const version = session.registry.getSnapshot().version;
        act(() => {
            intersections[0]([{target, isIntersecting: true} as IntersectionObserverEntry], {} as IntersectionObserver);
            resizes[0]([], {} as ResizeObserver);
        });
        await act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); });
        expect(session.registry.getSnapshot().version).toBe(version);
        expect(session.registry.getSnapshot().views[0].visible).toBe(true);
        expect(session.registry.getSnapshot().views[0].config.head).toBe('new-head');
    });
});
