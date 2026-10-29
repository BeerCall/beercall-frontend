import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorldWarmup from '../components/WorldWarmup';

const state = vi.hoisted(() => ({ authenticated: true, read: vi.fn(), clear: vi.fn(), renderWorld: vi.fn(() => null) }));
vi.mock('../store/useUserStore', () => ({
    useUserStore: (selector: (value: { isAuthenticated: boolean }) => unknown) => selector({ isAuthenticated: state.authenticated }),
}));
vi.mock('@react-three/drei', () => ({ useFBX: Object.assign((path: string) => state.read(path), { clear: state.clear }) }));
vi.mock('../components/3D/BarWorld', () => ({ default: state.renderWorld }));
vi.mock('../components/3D/PiscineWorld', () => ({ default: state.renderWorld }));
vi.mock('../components/3D/FloatyIslandWorld', () => ({ default: state.renderWorld }));

const clients: QueryClient[] = [];
function mount(path = '/dashboard') {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><WorldWarmup/></MemoryRouter></QueryClientProvider>);
    return client;
}
function interactiveMap() {
    act(() => window.dispatchEvent(new CustomEvent('beercall:scene-metric', {
        detail: { kind: 'mapInteractive', view: 'dashboard' },
    })));
}

describe('optional preparation of the three static worlds', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.authenticated = true;
        state.read.mockImplementation(() => ({}));
        performance.clearMarks();
    });
    afterEach(() => { clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks(); });

    it('waits for the map, then reads the three exact cached models without rendering any world or Canvas', async () => {
        const client = mount();
        expect(state.read).not.toHaveBeenCalled();
        interactiveMap();
        await waitFor(() => expect(state.read.mock.calls.map(call => call[0])).toEqual([
            '/models/Bar.fbx', '/models/Swimming_pool.fbx', '/models/Floaty_Island.fbx',
        ]));
        for (const tab of ['bar', 'piscine', 'dodo']) {
            expect(client.getQueryData(['world-module', tab])).toEqual({ default: state.renderWorld });
        }
        expect(state.renderWorld).not.toHaveBeenCalled();
        expect(document.querySelector('canvas')).toBeNull();
    });

    it('does not fetch for guests, even after a map signal', () => {
        state.authenticated = false;
        mount();
        interactiveMap();
        expect(state.read).not.toHaveBeenCalled();
    });

    it('does not prepare on profile/other routes', () => {
        mount('/profile');
        interactiveMap();
        expect(state.read).not.toHaveBeenCalled();
    });

    it('clears a failed speculative model so a real opening can retry, and still prepares the other two', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        state.read.mockImplementation((path: string) => {
            if (path === '/models/Bar.fbx') throw new Error('temporary asset failure');
            return {};
        });
        mount();
        interactiveMap();
        await waitFor(() => expect(state.clear).toHaveBeenCalledWith('/models/Bar.fbx'));
        await waitFor(() => expect(state.read).toHaveBeenCalledWith('/models/Floaty_Island.fbx'));
        expect(state.renderWorld).not.toHaveBeenCalled();
        expect(document.querySelector('canvas')).toBeNull();
    });
});
