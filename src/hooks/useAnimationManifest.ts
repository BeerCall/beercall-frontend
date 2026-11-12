import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { animationManifestQueryOptions } from './useAvatarAnimations';
import type { AnimationClipEntry } from '../types/animationPack';

const EMPTY_CLIPS: readonly AnimationClipEntry[] = Object.freeze([]);
const EMPTY_NAMES: readonly string[] = Object.freeze([]);

export interface AnimationCatalogResult {
  /** Entrées complètes du manifeste v2, vignettes incluses. */
  readonly clips: readonly AnimationClipEntry[];
  /** Noms des clips, dans l'ordre du manifeste. */
  readonly names: readonly string[];
  readonly isLoading: boolean;
  readonly error: Error | null;
}

/**
 * Catalogue des animations, indépendant de la scène 3D et du lease WebGL.
 * Partage la même clé React Query que `useAvatarAnimations` : le manifeste
 * n'est téléchargé qu'une fois.
 */
export function useAnimationManifest(): AnimationCatalogResult {
  const query = useQuery(animationManifestQueryOptions());
  const clips = query.data?.clips ?? EMPTY_CLIPS;
  const names = useMemo(
    () => (clips.length > 0 ? Object.freeze(clips.map(clip => clip.name)) : EMPTY_NAMES),
    [clips],
  );
  return {
    clips,
    names,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error : null,
  };
}
