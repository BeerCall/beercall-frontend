/**
 * B14 — Préchargement CPU des assets de mondes et avatars.
 *
 * Utilise le même cache et les mêmes promesses dédupliquées que `loadGlb` (A13).
 * Effectue un yield `setTimeout(0)` entre les éléments pour ne pas bloquer le thread principal.
 * Ne crée aucun contexte WebGL ni Canvas pendant le préchargement.
 */

import { loadGlb } from '../avatar/glb/loadGlb';
import {
    type AvatarPartsConfig,
    type GlbManifest,
    loadGlbManifest,
    resolveAvatarParts,
} from '../avatar/glb/manifest';
import { WORLD_SCENE_CONFIG, type WorldKind } from './worldSceneConfig';

export interface PrefetchOptions {
    world: WorldKind;
    participants?: AvatarPartsConfig[];
    manifest?: GlbManifest;
}

export interface PrefetchResult {
    urls: string[];
    prefetchedCount: number;
}

const yieldThread = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function prefetchWorldAssets(options: PrefetchOptions): Promise<PrefetchResult> {
    const manifest = options.manifest ?? (await loadGlbManifest());
    const worldConfig = WORLD_SCENE_CONFIG[options.world];

    const urlsToFetch = new Set<string>();

    // 1. URL du décor du monde
    const decorItem = manifest.items.find((item) => item.key === worldConfig.decorKey);
    if (decorItem) {
        urlsToFetch.add(decorItem.url);
    }

    // 2. URLs des pièces des participants réels demandés
    for (const participant of options.participants ?? []) {
        try {
            const resolved = resolveAvatarParts(participant, manifest);
            urlsToFetch.add(resolved.head.url);
            urlsToFetch.add(resolved.body.url);
            urlsToFetch.add(resolved.legs.url);
            urlsToFetch.add(resolved.feet.url);
            if (resolved.accessory) {
                urlsToFetch.add(resolved.accessory.url);
            }
        } catch {
            // Configuration invalide ignorée lors du préchargement
        }
    }

    const urls = Array.from(urlsToFetch);
    let count = 0;

    for (const url of urls) {
        try {
            await loadGlb(url);
            count += 1;
        } catch {
            /* ignore individual prefetch failure */
        }
        await yieldThread();
    }

    return {
        urls,
        prefetchedCount: count,
    };
}
