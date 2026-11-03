/**
 * A14 — Chargement du clip critique Idle pour le rendu des sprites.
 *
 * Utilise createAnimationPackManager de `src/lib/animationPack.ts`.
 * Valide le SHA-256 et la longueur du pack critique sans composant ni hook React.
 */

import type { AnimationClip } from 'three';
import { createAnimationPackManager } from '../../lib/animationPack';

let idleClipPromise: Promise<AnimationClip> | null = null;

export async function loadIdleClip(baseManifestUrl = '/animations/manifest.json'): Promise<AnimationClip> {
    if (idleClipPromise) return idleClipPromise;

    idleClipPromise = (async () => {
        const manifestRes = await fetch(baseManifestUrl);
        if (!manifestRes.ok) {
            throw new Error(`Manifest animations introuvable depuis ${baseManifestUrl} (HTTP ${manifestRes.status})`);
        }
        const manifestJson = (await manifestRes.json()) as {
            critical?: { url?: string; file?: string };
        };

        const criticalUrl = manifestJson.critical?.url ?? `/animations/${manifestJson.critical?.file}`;
        const criticalRes = await fetch(criticalUrl);
        if (!criticalRes.ok) {
            throw new Error(`Pack d'animation critique introuvable depuis ${criticalUrl} (HTTP ${criticalRes.status})`);
        }
        const criticalBytes = await criticalRes.arrayBuffer();

        const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
        const manager = await createAnimationPackManager(manifestJson, criticalBytes, subtle);
        return manager.getClip('Idle');
    })().catch((error) => {
        idleClipPromise = null;
        throw error;
    });

    return idleClipPromise;
}

export function clearIdleClipCache(): void {
    idleClipPromise = null;
}
