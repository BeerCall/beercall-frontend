/**
 * A15 — Entrypoint du navigateur de rendu des avatars (Playwright / Chromium).
 *
 * Initialise le WebGLRenderer hors-écran et précharge le manifeste et le clip critique Idle.
 * Expose window.__renderAvatar et window.__rendererReady pour le pilote server.mjs.
 */

import { type AvatarPartsConfig, loadGlbManifest } from '../../src/avatar/glb/manifest';
import { loadIdleClip } from '../../src/avatar/render/idleClip';
import { createOffscreenRenderer, renderSprites } from '../../src/avatar/render/renderSprites';

declare global {
    interface Window {
        __rendererReady?: boolean;
        __renderAvatar?: (config: AvatarPartsConfig) => Promise<{
            head: string;
            portrait: string;
            body: string;
            checks: {
                bodyBounds: number[];
                fullBounds: number[];
            };
        }>;
    }
}

async function initRenderer(): Promise<void> {
    const renderer = createOffscreenRenderer(512, 512);
    const gl = renderer.getContext();
    if (!gl) {
        throw new Error('Contexte WebGL2 indisponible dans le navigateur de rendu');
    }

    // Préchargement du catalogue et du clip Idle officiel
    const [manifest, clip] = await Promise.all([
        loadGlbManifest('/models/glb/manifest.json'),
        loadIdleClip('/animations/manifest.json'),
    ]);

    window.__renderAvatar = async (config: AvatarPartsConfig) => {
        const results = await renderSprites(renderer, {
            config,
            manifest,
            clip,
        });

        // Extraction des données brutes en base64 (retrait du préfixe data:image/png;base64,)
        const stripPrefix = (dataUrl: string) => dataUrl.split(',')[1] ?? '';

        return {
            head: stripPrefix(results.head),
            portrait: stripPrefix(results.portrait),
            body: stripPrefix(results.body),
            checks: {
                bodyBounds: [
                    results.bounds.body.min.x,
                    results.bounds.body.min.y,
                    results.bounds.body.min.z,
                    results.bounds.body.max.x,
                    results.bounds.body.max.y,
                    results.bounds.body.max.z,
                ],
                fullBounds: [
                    results.bounds.full.min.x,
                    results.bounds.full.min.y,
                    results.bounds.full.min.z,
                    results.bounds.full.max.x,
                    results.bounds.full.max.y,
                    results.bounds.full.max.z,
                ],
            },
        };
    };

    window.__rendererReady = true;
}

initRenderer().catch((error) => {
    console.error('Échec critique de l’initialisation du renderer :', error);
});
