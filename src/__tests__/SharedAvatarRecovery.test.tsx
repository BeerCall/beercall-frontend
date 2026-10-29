import React, {createContext, useContext, useState} from 'react';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene} from 'three';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import SharedAvatar from '../components/3D/SharedAvatar';
import SharedAvatarRenderer from '../components/3D/SharedAvatarRenderer';
import {AvatarViewportContext, createAvatarViewportSession, type AvatarViewportSession} from '../lib/avatarViewportContext';

function createRenderer() {
    const gl = {domElement: document.createElement('canvas'), lost: false, dispose: vi.fn(),
        getContext: () => ({isContextLost: () => gl.lost, getExtension: () => ({})}),
        forceContextLoss: vi.fn(() => { gl.lost = true; gl.domElement.dispatchEvent(new Event('webglcontextlost', {cancelable: true})); })};
    return gl;
}
const fiberContext = createContext<{gl: ReturnType<typeof createRenderer>} | null>(null);
const renderers: ReturnType<typeof createRenderer>[] = [];
vi.mock('@react-three/fiber', () => ({
    Canvas: function SourceDouble({children}: React.PropsWithChildren) {
        const [gl] = useState(() => { const renderer = createRenderer(); renderers.push(renderer); return renderer; });
        React.useEffect(() => () => { gl.lost = true; }, [gl]);
        return <fiberContext.Provider value={{gl}}><div data-testid="one-source">{children}</div></fiberContext.Provider>;
    },
    useThree: (selector: (state: {gl: ReturnType<typeof createRenderer>}) => unknown) => selector(useContext(fiberContext)!),
    useFrame: () => {}, createPortal: (children: React.ReactNode) => children,
}));

function host(session: AvatarViewportSession) {
    return <QueryClientProvider client={new QueryClient()}><AvatarViewportContext.Provider value={session}>
        <SharedAvatar config={{head: 'fixture-a'}} mode="head"/><SharedAvatar config={{head: 'fixture-b'}} mode="head"/>
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
});
