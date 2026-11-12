/**
 * B11 — Hook React Query de récupération du manifeste GLB.
 *
 * Utilise `api.get(url, { baseURL: '' })` pour cibler directement la racine
 * et valide la structure via `validateManifest`.
 */

import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { type GlbManifest, getCachedGlbManifest, setGlbManifest, validateManifest } from './manifest';

export const GLB_MANIFEST_URL = '/models/glb/manifest.json';
export const GLB_MANIFEST_QUERY_KEY = ['glb-manifest'];

export async function fetchGlbManifest(): Promise<GlbManifest> {
    const response = await api.get<GlbManifest>(GLB_MANIFEST_URL, { baseURL: '' });
    const manifest = validateManifest(response.data);
    setGlbManifest(manifest);
    return manifest;
}

export function useGlbManifest(): UseQueryResult<GlbManifest, Error> {
    let hasClient = false;
    try {
        hasClient = Boolean(useQueryClient());
    } catch {
        hasClient = false;
    }

    if (!hasClient) {
        return {
            data: getCachedGlbManifest() ?? undefined,
            isLoading: false,
            isError: false,
            error: null,
            refetch: () => Promise.resolve({ data: getCachedGlbManifest() }),
        } as unknown as UseQueryResult<GlbManifest, Error>;
    }

    return useQuery({
        queryKey: GLB_MANIFEST_QUERY_KEY,
        queryFn: fetchGlbManifest,
        initialData: () => getCachedGlbManifest() ?? undefined,
        staleTime: Infinity,
        retry: 1,
    });
}
