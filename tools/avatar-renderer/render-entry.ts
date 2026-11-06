/**
 * A15 — Entrypoint du navigateur de rendu des avatars (Playwright / Chromium).
 *
 * Initialise le WebGLRenderer hors-écran et précharge le manifeste et le clip critique Idle.
 * Expose window.__renderAvatar et window.__rendererReady pour le pilote server.mjs.
 */

import { Box3 } from 'three';

import {
    AvatarPieceNotFoundError,
    type AvatarPartsConfig,
    loadGlbManifest,
} from '../../src/avatar/glb/manifest';
import {
    analyzeAnimationPose,
    renderAnimationThumbnail,
    type ThumbnailGender,
} from '../../src/avatar/render/animationThumbnails';
import { loadAnimationClip } from '../../src/avatar/render/animationClip';
import { loadIdleClip } from '../../src/avatar/render/idleClip';
import { createOffscreenRenderer, renderSprites } from '../../src/avatar/render/renderSprites';
import { renderThumbnail } from '../../src/avatar/render/thumbnails';

declare global {
    interface Window {
        __rendererReady?: boolean;
        __renderAvatar?: (config: AvatarPartsConfig, userId?: string | number) => Promise<{
            head: string;
            portrait: string;
            body: string;
            checks: {
                bodyBounds: number[];
                fullBounds: number[];
            };
        }>;
        __renderThumbnail?: (sourceId: string) => Promise<string>;
        __animationThumbnailBounds?: (request: {
            clipName: string;
            gender: ThumbnailGender;
            keyTime: number;
        }) => Promise<{ idle: number[]; clip: number[] }>;
        __animationThumbnailRender?: (request: {
            clipName: string;
            gender: ThumbnailGender;
            keyTime: number;
            center: [number, number, number];
            extent: number;
        }) => Promise<string>;
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

    window.__renderAvatar = async (config: AvatarPartsConfig, userId?: string | number) => {
        let results;
        try {
            results = await renderSprites(renderer, {
                config,
                manifest,
                clip,
            });
        } catch (error) {
            // Aucune image partielle n'est renvoyée : le job doit échouer.
            const owner = userId ?? 'inconnu';
            if (error instanceof AvatarPieceNotFoundError) {
                console.error(
                    `[renderer] pièce introuvable "${error.pieceId}" (slot "${error.slot}") pour l'utilisateur ${owner}`,
                );
            } else {
                console.error(
                    `[renderer] rendu impossible pour l'utilisateur ${owner} : ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                );
            }
            throw new Error(
                `Utilisateur ${owner} : ${error instanceof Error ? error.message : String(error)}`,
            );
        }

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

    window.__renderThumbnail = async (sourceId: string) => {
        const item = manifest.items.find((candidate) => candidate.sourceId === sourceId);
        if (!item) {
            throw new Error(`Vignette impossible : sourceId inconnu "${sourceId}"`);
        }
        const dataUrl = await renderThumbnail(renderer, { item, clip });
        return dataUrl.split(',')[1] ?? '';
    };

    const boxToArray = (box: Box3): number[] => [
        box.min.x, box.min.y, box.min.z,
        box.max.x, box.max.y, box.max.z,
    ];

    window.__animationThumbnailBounds = async ({ clipName, gender, keyTime }) => {
        const target = clipName === 'Idle' ? clip : await loadAnimationClip(clipName);
        const { idleBounds, clipBounds } = await analyzeAnimationPose({
            manifest,
            idleClip: clip,
            clip: target,
            gender,
            keyTime,
        });
        return { idle: boxToArray(idleBounds), clip: boxToArray(clipBounds) };
    };

    window.__animationThumbnailRender = async ({ clipName, gender, keyTime, center, extent }) => {
        const target = clipName === 'Idle' ? clip : await loadAnimationClip(clipName);
        const dataUrl = await renderAnimationThumbnail(renderer, {
            manifest,
            clip: target,
            gender,
            keyTime,
            center,
            extent,
        });
        return dataUrl.split(',')[1] ?? '';
    };

    window.__rendererReady = true;
}

initRenderer().catch((error) => {
    console.error('Échec critique de l’initialisation du renderer :', error);
});
