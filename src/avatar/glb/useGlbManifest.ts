/**
 * B11 — Hook React Query de récupération du manifeste GLB.
 *
 * Utilise `api.get(url, { baseURL: '' })` pour cibler directement la racine
 * et valide la structure via `validateManifest`.
 */

import { useContext } from 'react';
import { QueryClient, QueryClientContext, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { type GlbManifest, getCachedGlbManifest, setGlbManifest, validateManifest } from './manifest';

export const GLB_MANIFEST_URL = '/models/glb/manifest.json';
export const GLB_MANIFEST_QUERY_KEY = ['glb-manifest'];
// Standalone previews may read the published cache without a provider. Keep
// the query hook unconditional, but never fetch on this fallback client.
const previewClient = new QueryClient();

export async function fetchGlbManifest(): Promise<GlbManifest> {
    const response = await api.get<GlbManifest>(GLB_MANIFEST_URL, { baseURL: '' });
    const manifest = validateManifest(response.data);
    setGlbManifest(manifest);
    return manifest;
}

export function useGlbManifest(): UseQueryResult<GlbManifest, Error> {
    const client = useContext(QueryClientContext);
    const query = useQuery({
        queryKey: GLB_MANIFEST_QUERY_KEY,
        queryFn: fetchGlbManifest,
        initialData: () => getCachedGlbManifest() ?? undefined,
        enabled: Boolean(client),
        staleTime: Infinity,
        retry: 1,
    }, client ?? previewClient);

    if (!client) {
        return {
            data: getCachedGlbManifest() ?? undefined,
            isLoading: false,
            isError: false,
            error: null,
            refetch: () => Promise.resolve({ data: getCachedGlbManifest() }),
        } as unknown as UseQueryResult<GlbManifest, Error>;
    }

    return query;
}
