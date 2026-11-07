/**
 * 8h-3 — Sélection des GLB préchargés pour les mondes.
 *
 * WorldScene monte :
 * - un décor GLB par monde (`decor/bar`, `decor/piscine`, `decor/dodo`) ;
 * - RealAvatar avec les slots `head`, `body`, `legs`, `feet`. L'accessoire est
 *   explicitement retiré par WorldAvatar (parité PoC), donc il n'est jamais
 *   préchargé.
 *
 * Le préchargement passe par le cache CPU partagé `loadGlb`, comme le rendu :
 * un monde ouvert avant la fin réutilise les promesses en cours.
 */

import type { GlbManifest, GlbManifestItem } from '../avatar/glb/manifest';
import { loadGlb } from '../avatar/glb/loadGlb';

export const WORLD_PRELOAD_DECOR_KEYS = ['decor/bar', 'decor/piscine', 'decor/dodo'] as const;
export const WORLD_PRELOAD_AVATAR_SLOTS = ['head', 'body', 'legs', 'feet'] as const;
export const WORLD_PRELOAD_GENDERS = ['men', 'women'] as const;

export interface WorldPreloadPlan {
    items: GlbManifestItem[];
    bytes: number;
    decorCount: number;
    avatarCount: number;
}

function isAvatarSlotKey(key: string): boolean {
    const [gender, slot] = key.split('/');
    return (WORLD_PRELOAD_GENDERS as readonly string[]).includes(gender)
        && (WORLD_PRELOAD_AVATAR_SLOTS as readonly string[]).includes(slot);
}

export function selectWorldPreloadItems(manifest: GlbManifest): GlbManifestItem[] {
    const decor = WORLD_PRELOAD_DECOR_KEYS.map((key) => {
        const item = manifest.items.find((candidate) => candidate.key === key);
        if (!item) throw new Error(`Décor GLB introuvable dans le manifeste : ${key}`);
        return item;
    });
    const avatars = manifest.items.filter((item) => isAvatarSlotKey(item.key));
    return [...decor, ...avatars];
}

export function buildWorldPreloadPlan(manifest: GlbManifest): WorldPreloadPlan {
    const items = selectWorldPreloadItems(manifest);
    const decorCount = items.filter((item) => (WORLD_PRELOAD_DECOR_KEYS as readonly string[]).includes(item.key)).length;
    return {
        items,
        bytes: items.reduce((total, item) => total + item.bytes, 0),
        decorCount,
        avatarCount: items.length - decorCount,
    };
}

/** Mo décimaux, pour le rapport et les logs. */
export function toMegabytes(bytes: number): number {
    return Math.round((bytes / 1_000_000) * 100) / 100;
}

export function preloadWorldAsset(item: GlbManifestItem): Promise<void> {
    return loadGlb(item.url).then(() => undefined);
}
