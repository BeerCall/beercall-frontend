/**
 * Chargement du catalogue d'animations dans le navigateur de rendu.
 *
 * Distinct de `loadIdleClip` : les vignettes d'animations ont besoin du pack
 * différé complet, chargé une seule fois et décodé à la demande par le manager.
 */

import type { AnimationClip } from 'three';
import { createAnimationPackManager, validateManifest } from '../../lib/animationPack';
import type { AnimationManifest, AnimationPackManager } from '../../types/animationPack';

interface AnimationCatalog {
    manifest: AnimationManifest;
    manager: AnimationPackManager;
}

let catalogPromise: Promise<AnimationCatalog> | null = null;

async function fetchBytes(url: string, label: string): Promise<ArrayBuffer> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${label} introuvable depuis ${url} (HTTP ${response.status})`);
    }
    return response.arrayBuffer();
}

export async function loadAnimationCatalog(
    baseManifestUrl = '/animations/manifest.json',
): Promise<AnimationCatalog> {
    if (catalogPromise) return catalogPromise;

    catalogPromise = (async () => {
        const manifestResponse = await fetch(baseManifestUrl);
        if (!manifestResponse.ok) {
            throw new Error(`Manifest animations introuvable depuis ${baseManifestUrl} (HTTP ${manifestResponse.status})`);
        }
        const manifest = validateManifest(await manifestResponse.json());
        const criticalBytes = await fetchBytes(manifest.critical.url, 'Pack critique');
        const subtle = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto.subtle : undefined;
        const manager = await createAnimationPackManager(manifest, criticalBytes, subtle);
        const deferredBytes = await fetchBytes(manifest.deferred.url, 'Pack différé');
        await manager.loadDeferredPack(deferredBytes, subtle);
        return { manifest, manager };
    })().catch((error) => {
        catalogPromise = null;
        throw error;
    });

    return catalogPromise;
}

export async function loadAnimationClip(name: string): Promise<AnimationClip> {
    const { manager } = await loadAnimationCatalog();
    return manager.getClip(name);
}

export function clearAnimationClipCache(): void {
    catalogPromise = null;
}
