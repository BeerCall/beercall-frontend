import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientContext } from '@tanstack/react-query';
import { api } from '../lib/api';
import { clearGlbManifest, setGlbManifest, type GlbManifest } from '../avatar/glb/manifest';
import { useGlbManifest } from '../avatar/glb/useGlbManifest';

vi.mock('../lib/api', () => ({ api: { get: vi.fn() } }));

const manifest: GlbManifest = { version: 1, pipelineVersion: 1, generatedAt: '2026-11-13', items: [] };

afterEach(() => {
    clearGlbManifest();
    vi.clearAllMocks();
});

describe('useGlbManifest provider and standalone previews', () => {
    it('reads the standalone cache without requesting the network', () => {
        setGlbManifest(manifest);
        const { result } = renderHook(() => useGlbManifest());
        expect(result.current.data).toEqual(manifest);
        expect(result.current.isLoading).toBe(false);
        expect(api.get).not.toHaveBeenCalled();
    });

    it('fetches through the provided client without a preloaded cache', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
        vi.mocked(api.get).mockResolvedValue({ data: manifest });
        const wrapper = ({ children }: { children: ReactNode }) =>
            <QueryClientContext.Provider value={client}>{children}</QueryClientContext.Provider>;
        const { result, unmount } = renderHook(() => useGlbManifest(), { wrapper });
        await waitFor(() => expect(result.current.data).toEqual(manifest));
        expect(api.get).toHaveBeenCalledExactlyOnceWith('/models/glb/manifest.json', { baseURL: '' });
        unmount();
        client.clear();
    });
});
