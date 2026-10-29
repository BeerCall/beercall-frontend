import React, {useLayoutEffect, useSyncExternalStore} from 'react';
import {act, render, screen, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {BrowserRouter} from 'react-router-dom';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene} from 'three';
import Connections from '../pages/Connections';
import AvatarViewportProvider from '../components/3D/AvatarViewportProvider';
import type {AvatarViewportSession} from '../lib/avatarViewportContext';

let session: AvatarViewportSession;
const observations: {root: Element | Document | null; target: Element; callback: IntersectionObserverCallback}[] = [];
const people = Array.from({length: 4}, (_, index) => ({id: String(index), username: `Synthetic ${index}`, caps: 0, score: 0, title: 'Fixture',
    avatar: {head: `head-${index}`, gender: 'Men'}}));
vi.mock('../components/3D/SharedAvatarRenderer', () => ({default: function CopyBackend({session: current}: {session: AvatarViewportSession}) {
    session = current;
    const snapshot = useSyncExternalStore(current.registry.subscribe, current.registry.getSnapshot);
    useLayoutEffect(() => {
        for (const job of snapshot.jobs) if (!job.ready) {
            const token = current.registry.jobToken(job);
            const group = new Group(); group.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
            current.registry.attachScene(token, new Scene(), new PerspectiveCamera());
            current.registry.setSceneStatus(token, {signature: job.signature, ready: true, group, expectedParts: ['head'], framing: null, frameSubmitted: false});
        }
        for (const view of snapshot.views) if (view.visible && view.frame?.signature !== view.signature) {
            view.target.getContext('2d')!.drawImage(document.createElement('canvas'), 0, 0);
            current.registry.confirmCopy(current.registry.copyToken(view), {copied: true, meshCount: 1, drawCalls: 1, timestamp: performance.now()});
        }
    }, [current, snapshot]);
    return <canvas data-testid="single-source"/>;
}}));

function mount() {
    const client = new QueryClient({defaultOptions: {queries: {staleTime: Infinity}}});
    client.setQueryData(['connections'], people);
    const content = (active: boolean) => <QueryClientProvider client={client}><BrowserRouter><AvatarViewportProvider>
        <Connections active={active}/>
    </AvatarViewportProvider></BrowserRouter></QueryClientProvider>;
    return {...render(content(true)), client, content};
}

describe('all intersecting connections, real provider/registry and deterministic copy backend', () => {
    beforeEach(() => {
        observations.length = 0;
        vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 128, 160));
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({drawImage: vi.fn(), clearRect: vi.fn()}) as unknown as CanvasRenderingContext2D);
        class Observer {
            constructor(private callback: IntersectionObserverCallback, private options?: IntersectionObserverInit) {}
            observe(target: Element) { observations.push({root: this.options?.root ?? null, target, callback: this.callback}); }
            disconnect() {}
            unobserve() {}
        }
        vi.stubGlobal('IntersectionObserver', Observer);
        vi.stubGlobal('ResizeObserver', class {observe() {} disconnect() {}});
    });
    it('paints all four including the first, uses the actual scrollport, retains scroll/images and pauses off route', async () => {
        const view = mount();
        await waitFor(() => expect(view.container.querySelectorAll('[data-avatar-state="frame-ready"]')).toHaveLength(4));
        const port = screen.getByTestId('connections-scrollport');
        expect(observations.filter(observer => observer.root === port)).toHaveLength(4);
        expect(port.scrollTop).toBe(0);
        expect(session.registry.getSnapshot().views.every(view => view.visible && !!view.frame)).toBe(true);
        expect(screen.getAllByTestId('single-source')).toHaveLength(1);
        const frames = session.registry.getSnapshot().views.map(view => view.frame);
        const canvases = [...view.container.querySelectorAll('[data-avatar-cell]')];
        port.scrollTop = 321;
        view.rerender(view.content(false));
        expect(session.registry.getSnapshot().views.every(view => !view.visible)).toBe(true);
        expect(session.registry.getSnapshot().views.map(view => view.frame)).toEqual(frames);
        view.rerender(view.content(true));
        expect(port.scrollTop).toBe(321);
        expect([...view.container.querySelectorAll('[data-avatar-cell]')]).toEqual(canvases);
        expect(session.registry.getSnapshot().views[0].visible).toBe(true);
    });
    it('a new outfit changes only its own certificate, while clipping pauses a cell without deleting its image', async () => {
        const view = mount();
        await waitFor(() => expect(session.registry.getSnapshot().views.filter(view => view.frame)).toHaveLength(4));
        const before = session.registry.getSnapshot().views.map(view => ({id: view.id, frame: view.frame}));
        act(() => view.client.setQueryData(['connections'], people.map((person, i) => i === 0 ? {...person, avatar: {head: 'new-head', gender: 'Men'}} : person)));
        await waitFor(() => expect(session.registry.getSnapshot().views[0].frame?.signature).toContain('new-head'));
        for (let i = 1; i < 4; i++) expect(session.registry.getSnapshot().views[i].frame).toBe(before[i].frame);
        const first = screen.getByTestId('avatar-thumb-0');
        const observer = observations.find(observer => observer.target === first)!;
        act(() => observer.callback([{target: first, isIntersecting: false} as IntersectionObserverEntry], {} as IntersectionObserver));
        expect(session.registry.getSnapshot().views[0].visible).toBe(false);
        expect(first.querySelector('[data-avatar-state="frame-ready"]')).toBeInTheDocument();
    });
});
