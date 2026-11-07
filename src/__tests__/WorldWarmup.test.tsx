import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GlbManifest, GlbManifestItem } from '../avatar/glb/manifest';
import WorldWarmup from '../components/WorldWarmup';
import { resetWorldPreloadStatusForTests } from '../lib/worldPreloadState';
import { resetPreloadScheduleForTests } from '../lib/preloadSchedule';
import { resetWorldOpenState } from '../lib/worldOpenState';

function item(key: string, bytes: number): GlbManifestItem {
    return {
        key,
        url: `/models/glb/v1/${key}.glb`,
        sha256: 'sha',
        bytes,
        drawCalls: 1,
        triangles: 1,
        joints: 0,
        textures: 0,
        source: `${key}.fbx`,
        sourceId: key,
        sourceSha256: 'sha',
        sourceBBox: null,
        pipelineVersion: 1,
    };
}

const manifest: GlbManifest = {
    version: 1,
    pipelineVersion: 1,
    generatedAt: '2026-11-05T00:00:00.000Z',
    items: [
        item('decor/bar', 271_660),
        item('decor/piscine', 69_680),
        item('decor/dodo', 118_336),
        item('men/head/Men_head_Casual_0', 1_000),
        item('men/body/Men_body_Casual_0', 2_000),
        item('men/legs/Men_legs_Casual_0', 3_000),
        item('men/feet/Men_feet_Casual_0', 4_000),
        item('acc/men/Men_accessory_Beer_500', 9_999),
    ],
};

const state = vi.hoisted(() => ({
    authenticated: true,
    loadGlb: vi.fn((url: string) => Promise.resolve({url})),
}));

vi.mock('../store/useUserStore', () => ({
    useUserStore: (selector: (value: { isAuthenticated: boolean }) => unknown) => selector({isAuthenticated: state.authenticated}),
}));
vi.mock('../avatar/glb/loadGlb', () => ({loadGlb: state.loadGlb}));
vi.mock('../avatar/glb/useGlbManifest', () => ({
    useGlbManifest: () => ({data: manifest, isError: false, error: null}),
}));

const clients: QueryClient[] = [];
function mount(path = '/dashboard') {
    const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
    clients.push(client);
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><WorldWarmup/></MemoryRouter></QueryClientProvider>);
    return client;
}
function interactiveMap() {
    act(() => window.dispatchEvent(new CustomEvent('beercall:scene-metric', {
        detail: {kind: 'mapInteractive', view: 'dashboard'},
    })));
}

describe('préchargement des mondes au repos (8h-3)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetWorldPreloadStatusForTests();
        resetPreloadScheduleForTests();
        resetWorldOpenState();
        state.authenticated = true;
        state.loadGlb.mockImplementation((url: string) => Promise.resolve({url}));
        performance.clearMarks();
    });
    afterEach(() => { clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks(); });

    it('attend la carte, puis précharge les 3 décors et les slots d’avatar, sans FBX legacy ni Canvas', async () => {
        mount();
        expect(state.loadGlb).not.toHaveBeenCalled();
        interactiveMap();
        await waitFor(() => expect(state.loadGlb).toHaveBeenCalledTimes(7), {timeout: 5000});
        const urls = state.loadGlb.mock.calls.map(call => call[0]);
        expect(urls.slice(0, 3)).toEqual([
            manifest.items[0].url, manifest.items[1].url, manifest.items[2].url,
        ]);
        expect(urls).toContain(manifest.items[3].url);
        expect(urls).not.toContain(manifest.items[7].url);
        expect(urls.some(url => url.endsWith('.fbx'))).toBe(false);
        expect(urls).not.toContain('/models/Bar.fbx');
        expect(urls).not.toContain('/models/Swimming_pool.fbx');
        expect(urls).not.toContain('/models/Floaty_Island.fbx');
        expect(document.querySelector('canvas')).toBeNull();
    });

    it('ne précharge rien pour un invité, même après le signal de carte', () => {
        state.authenticated = false;
        mount();
        interactiveMap();
        expect(state.loadGlb).not.toHaveBeenCalled();
    });

    it('ne précharge pas sur les autres routes', () => {
        mount('/profile');
        interactiveMap();
        expect(state.loadGlb).not.toHaveBeenCalled();
    });

    it('loggue un échec et continue les fichiers suivants, sans repli muet', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        state.loadGlb.mockImplementation((url: string) => (
            url === manifest.items[0].url ? Promise.reject(new Error('asset failure')) : Promise.resolve({url})
        ));
        mount();
        interactiveMap();
        await waitFor(() => expect(state.loadGlb).toHaveBeenCalledTimes(7), {timeout: 5000});
        expect(error).toHaveBeenCalledWith(
            `[world] préchargement échoué : ${manifest.items[0].url}`,
            expect.any(Error),
        );
        await waitFor(() => expect(info).toHaveBeenCalledWith(
            '[world] préchargement terminé',
            expect.objectContaining({files: 7, failures: 1}),
        ));
    });
});
