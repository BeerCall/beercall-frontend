import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AnimationClip } from 'three';
import { ANIMATION_BYTE_LIMITS, createAnimationPackManager, validateManifest } from '../lib/animationPack';
import type { AnimationPackManager, AvatarAnimationsResult } from '../types/animationPack';

const EMPTY_NAMES: readonly string[] = Object.freeze([]);
const CACHE_TIME = 30 * 60 * 1000;
const queryPolicy = {
  staleTime: Infinity, gcTime: CACHE_TIME, retry: 1, retryDelay: 250,
  refetchOnWindowFocus: false, refetchOnReconnect: false, retryOnMount: false,
  structuralSharing: false,
} as const;

// Fetching belongs to queryFn; validators remain independent of the transport.
export async function readAnimationResponse(url: string, limit: number, signal?: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(url, { signal, cache: url.endsWith('/manifest.json') ? 'no-cache' : 'default' });
  if (!response.ok) throw new Error(`Animation request failed (${response.status})`);
  if (!response.body) throw new Error('Animation response has no readable body');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new Error('Animation response exceeds byte limit');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export function useAvatarAnimations(targetAnimation: string | null = 'Idle'): AvatarAnimationsResult {
  const queryClient = useQueryClient();
  const requested = targetAnimation || 'Idle';
  const [frameManager, setFrameManager] = useState<AnimationPackManager>();
  const frameRequests = useRef(new Set<number>());
  const [selection, setSelection] = useState<{
    manager: AnimationPackManager; name: string; clip?: AnimationClip; error?: Error;
  }>();
  const manifestQuery = useQuery({
    ...queryPolicy,
    queryKey: ['avatar-animations', 'manifest', 1],
    queryFn: async ({ signal }) => {
      const bytes = await readAnimationResponse('/animations/manifest.json', ANIMATION_BYTE_LIMITS.manifest, signal);
      const data: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      return validateManifest(data);
    },
  });
  const manifest = manifestQuery.data;
  const criticalQuery = useQuery({
    ...queryPolicy,
    queryKey: ['avatar-animations', 'idle', manifest?.formatVersion, manifest?.sourceHash, manifest?.critical.sha256],
    enabled: !!manifest,
    queryFn: async ({ signal }) => {
      if (!manifest) throw new Error('Animation manifest is not loaded');
      const bytes = await readAnimationResponse(manifest.critical.url, manifest.critical.byteLength, signal);
      return createAnimationPackManager(manifest, bytes);
    },
  });
  const manager = criticalQuery.data;
  const deferredOptions = useMemo(() => ({
    ...queryPolicy,
    queryKey: ['avatar-animations', 'deferred', manifest?.formatVersion, manifest?.sourceHash, manifest?.deferred.sha256],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      if (!manager || !manifest) throw new Error('Critical animation is not loaded');
      const bytes = await readAnimationResponse(manifest.deferred.url, manifest.deferred.byteLength, signal);
      await manager.loadDeferredPack(bytes);
      return manager;
    },
  }), [manager, manifest]);
  const deferredQuery = useQuery({
    ...deferredOptions,
    enabled: !!manager && (frameManager === manager || (requested !== 'Idle' && manager.hasClip(requested))),
  });

  const getClip = useCallback(async (name: string) => {
    if (!manager) throw new Error('Critical animation is not loaded');
    if (!manager.hasClip(name)) throw new Error(`Unknown animation clip requested: "${name}"`);
    if (name !== 'Idle' && !manager.isDeferredLoaded()) await queryClient.fetchQuery(deferredOptions);
    return manager.getClip(name);
  }, [manager, queryClient, deferredOptions]);

  // Decode one selected clip after commit, not during React render. Late selections cannot win.
  useEffect(() => {
    if (!manager || requested === 'Idle' || (!deferredQuery.isSuccess && manager.hasClip(requested))) return;
    let current = true;
    getClip(requested).then(
      clip => { if (current) setSelection({ manager, name: requested, clip }); },
      error => { if (current) setSelection({ manager, name: requested, error: error instanceof Error ? error : new Error(String(error)) }); },
    );
    return () => { current = false; };
  }, [manager, requested, getClip, deferredQuery.isSuccess, deferredQuery.dataUpdatedAt]);

  const notifyInitialFrame = useCallback(() => {
    if (!manager || frameManager === manager || frameRequests.current.size) return;
    const first = requestAnimationFrame(() => {
      frameRequests.current.delete(first);
      const second = requestAnimationFrame(() => {
        frameRequests.current.delete(second);
        setFrameManager(manager);
      });
      frameRequests.current.add(second);
    });
    frameRequests.current.add(first);
  }, [manager, frameManager]);
  useEffect(() => {
    const requests = frameRequests.current;
    return () => { for (const id of requests) cancelAnimationFrame(id); requests.clear(); };
  }, [manager]);

  const retry = useCallback(async () => {
    if (manifestQuery.isError) { await manifestQuery.refetch(); return; }
    if (criticalQuery.isError) { await criticalQuery.refetch(); return; }
    await deferredQuery.refetch();
  }, [manifestQuery, criticalQuery, deferredQuery]);
  const selected = selection && selection.manager === manager && selection.name === requested ? selection : undefined;
  return {
    clipNames: manifest?.clips ?? EMPTY_NAMES,
    activeClip: requested === 'Idle' ? manager?.criticalClip : selected?.clip ?? manager?.criticalClip,
    isLoading: !manager && !manifestQuery.isError && !criticalQuery.isError,
    deferredStatus: deferredQuery.isError ? 'error' : deferredQuery.isSuccess ? 'ready' : deferredQuery.isFetching ? 'loading' : 'idle',
    error: manifestQuery.error ?? criticalQuery.error ?? deferredQuery.error ?? selected?.error ?? null,
    notifyInitialFrame, getClip, retry,
  };
}
