import React from 'react';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene} from 'three';
import AvatarResourcePreparation from '../components/AvatarResourcePreparation';
import AvatarWarmup from '../components/AvatarWarmup';
import {AvatarViewportContext, createAvatarViewportSession, type AvatarViewportSession} from '../lib/avatarViewportContext';
import {useModel} from '../hooks/useModel';
import {connectionsQueryOptions} from '../hooks/useConnections';
import {api} from '../lib/api';

const fixtures = vi.hoisted(() => ({
    cache: new Map<string, {value?: object; error?: boolean; promise?: Promise<void>}>(),
    read: vi.fn<(url: string) => object>(), clear: vi.fn(), preload: vi.fn(),
    authenticated: true, profile: {data: undefined as {avatar: {head: string; body?: string}} | undefined},
    connections: {data: [] as {avatar: {head: string; body?: string}}[]},
}));
vi.mock('../hooks/useModel', () => ({useModel: Object.assign((url: string) => fixtures.read(url), {clear: fixtures.clear})}));
vi.mock('../store/useUserStore', () => ({useUserStore: (selector: (state: {isAuthenticated: boolean}) => unknown) => selector({isAuthenticated: fixtures.authenticated})}));
vi.mock('../hooks/useProfile', () => ({useProfile: () => fixtures.profile}));
vi.mock('../hooks/useConnections', async importOriginal => ({...await importOriginal<typeof import('../hooks/useConnections')>(), useConnections: () => fixtures.connections}));
vi.mock('../hooks/useAvatarAnimations', () => ({preloadAvatarAnimations: fixtures.preload}));

function mount(session: AvatarViewportSession, children: React.ReactNode = <AvatarResourcePreparation/>, client = new QueryClient()) {
    return render(<QueryClientProvider client={client}><AvatarViewportContext.Provider value={session}>{children}</AvatarViewportContext.Provider></QueryClientProvider>);
}
function ForegroundRead({url}: {url: string}) { useModel(url); return null; }

function certifyPrepared(s: AvatarViewportSession) {
    for (const view of s.registry.getSnapshot().views.filter(view => view.prepare)) {
        const job = s.registry.getJob(view.jobId)!;
        const token = s.registry.jobToken(job);
        const group = new Group();
        group.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
        s.registry.attachScene(token, new Scene(), new PerspectiveCamera());
        s.registry.setSceneStatus(token, {signature: job.signature, ready: true, group, frameSubmitted: false, framing: null, expectedParts: ['head']});
        s.registry.confirmCopy(s.registry.copyToken(view), {copied: true, meshCount: 1, drawCalls: 1, timestamp: performance.now()});
    }
}

describe('real loader readers and useful session warmup', () => {
    beforeEach(() => {
        vi.clearAllMocks(); fixtures.cache.clear(); fixtures.authenticated = true;
        fixtures.profile = {data: undefined}; fixtures.connections = {data: []};
        fixtures.preload.mockResolvedValue(undefined);
        fixtures.read.mockImplementation(url => {
            const entry = fixtures.cache.get(url);
            if (entry?.error) throw new Error('synthetic model unavailable');
            if (entry?.promise && !entry.value) throw entry.promise;
            if (!entry) { const value = {}; fixtures.cache.set(url, {value}); return value; }
            return entry.value!;
        });
        fixtures.clear.mockImplementation((url: string) => fixtures.cache.delete(url));
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({clearRect: vi.fn()}) as unknown as CanvasRenderingContext2D);
    });

    it('uses at most two unresolved useModel readers outside Canvas and the same URLs/cache as foreground', async () => {
        const s = createAvatarViewportSession();
        let release!: () => void;
        fixtures.cache.set('/models/a.fbx', {promise: new Promise(resolve => { release = resolve; })});
        fixtures.cache.set('/models/b.fbx', {promise: new Promise(() => {})});
        ['a', 'b', 'c'].forEach(name => s.preparation.request(`/models/${name}.fbx`));
        const view = mount(s);
        expect(new Set(fixtures.read.mock.calls.map(call => call[0]))).toEqual(new Set(['/models/a.fbx', '/models/b.fbx']));
        expect(s.preparation.getSnapshot().map(entry => entry.status)).toEqual(['reading', 'reading', 'queued']);
        const sharedAsset = {};
        await act(async () => { fixtures.cache.set('/models/a.fbx', {value: sharedAsset}); release(); });
        await waitFor(() => expect(s.preparation.getSnapshot()[0].status).toBe('ready'));
        await waitFor(() => expect(s.preparation.getSnapshot()[2].status).toBe('ready'));
        const before = fixtures.cache.get('/models/a.fbx')!.value;
        view.rerender(<QueryClientProvider client={new QueryClient()}><AvatarViewportContext.Provider value={s}>
            <AvatarResourcePreparation/><ForegroundRead url="/models/a.fbx"/>
        </AvatarViewportContext.Provider></QueryClientProvider>);
        expect(fixtures.cache.get('/models/a.fbx')!.value).toBe(before);
        expect(document.querySelector('canvas')).toBeNull();
        expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled();
    });

    it('keeps a failed speculative URL errored until an explicit retry clears only that cache entry', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const s = createAvatarViewportSession();
        fixtures.cache.set('/models/failure.fbx', {error: true});
        s.preparation.request('/models/failure.fbx');
        mount(s);
        await screen.findByRole('button', {name: 'Réessayer la préparation des avatars'});
        expect(s.preparation.getSnapshot()[0].status).toBe('error');
        expect(fixtures.clear).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', {name: 'Réessayer la préparation des avatars'}));
        await waitFor(() => expect(s.preparation.getSnapshot()[0].status).toBe('ready'));
        expect(fixtures.clear).toHaveBeenCalledExactlyOnceWith('/models/failure.fbx');
    });

    it('rejects late settlements of an ended account, while a new session can prepare normally', async () => {
        const old = createAvatarViewportSession();
        let release!: () => void;
        fixtures.cache.set('/models/late.fbx', {promise: new Promise(resolve => { release = resolve; })});
        old.preparation.request('/models/late.fbx');
        const view = mount(old);
        const ticket = old.preparation.getSnapshot()[0].ticket;
        view.unmount(); old.dispose();
        await act(async () => { fixtures.cache.set('/models/late.fbx', {value: {}}); release(); });
        expect(old.preparation.ready('/models/late.fbx', ticket)).toBe(false);
        const next = createAvatarViewportSession();
        next.preparation.request('/models/late.fbx'); mount(next);
        await waitFor(() => expect(next.preparation.getSnapshot()[0].status).toBe('ready'));
        expect(old.preparation.getSnapshot()).toEqual([]);
    });

    it('prepares only player/contact/cached profiles, and marks useful readiness only after each scene copy', async () => {
        const s = createAvatarViewportSession();
        fixtures.profile = {data: {avatar: {head: 'player', body: 'outfit'}}};
        fixtures.connections = {data: [{avatar: {head: 'contact'}}]};
        const client = new QueryClient();
        client.setQueryData(['profile', 'known'], {avatar: {head: 'cached'}});
        const view = mount(s, <AvatarWarmup/>, client);
        await waitFor(() => expect(s.registry.getSnapshot().views.filter(view => view.prepare)).toHaveLength(2));
        expect(fixtures.preload).toHaveBeenCalledWith(client);
        expect(s.preparation.getSnapshot().map(entry => entry.url).sort()).toEqual([
            '/models/cached.fbx', '/models/contact.fbx', '/models/outfit.fbx', '/models/player.fbx',
        ]);
        expect(view.container.querySelector('[data-avatar-preparation-ready]')).toHaveAttribute('data-avatar-preparation-ready', 'false');
        act(() => certifyPrepared(s));
        await waitFor(() => expect(s.registry.getSnapshot().views.filter(view => view.prepare)).toHaveLength(2));
        act(() => certifyPrepared(s));
        await waitFor(() => expect(s.registry.getSnapshot().views).toHaveLength(6));
        act(() => certifyPrepared(s));
        await waitFor(() => expect(view.container.querySelector('[data-avatar-preparation-ready]')).toHaveAttribute('data-avatar-preparation-ready', 'true'));
        expect(document.querySelector('canvas')).toBeNull();
        view.unmount();
        expect(s.registry.getSnapshot().views).toHaveLength(0);
        client.clear();
    });

    it('does not mount session readers or start animations for guests', () => {
        fixtures.authenticated = false;
        const s = createAvatarViewportSession(); mount(s, <AvatarWarmup/>);
        expect(fixtures.read).not.toHaveBeenCalled();
        expect(fixtures.preload).not.toHaveBeenCalled();
        expect(s.preparation.getSnapshot()).toEqual([]);
    });

    it.each([{viewport: 390, width: 92, height: 124}, {viewport: 420, width: 124, height: 156}])(
        'prepares the real inner thumbnail size at viewport $viewport, excluding its four border pixels', async ({viewport, width, height}) => {
            vi.stubGlobal('innerWidth', viewport);
            const s = createAvatarViewportSession();
            fixtures.profile = {data: {avatar: {head: 'player'}}};
            fixtures.connections = {data: [{avatar: {head: 'contact'}}]};
            const view = mount(s, <AvatarWarmup/>);
            await waitFor(() => expect(s.registry.getSnapshot().views.filter(view => view.prepare)).toHaveLength(2));
            act(() => certifyPrepared(s));
            await waitFor(() => expect(s.registry.getSnapshot().jobs.some(job => job.mode === 'thumbnail')).toBe(true));
            expect(s.registry.getSnapshot().jobs.find(job => job.mode === 'thumbnail')).toMatchObject({width, height});
            view.unmount(); s.dispose(); vi.unstubAllGlobals();
        },
    );

    it('preserves the exact connections query key and endpoint', async () => {
        const get = vi.spyOn(api, 'get').mockResolvedValue({data: []});
        const client = new QueryClient();
        expect(connectionsQueryOptions().queryKey).toEqual(['connections']);
        await client.fetchQuery(connectionsQueryOptions());
        expect(get).toHaveBeenCalledExactlyOnceWith('/auth/connections/');
        client.clear();
    });
});
