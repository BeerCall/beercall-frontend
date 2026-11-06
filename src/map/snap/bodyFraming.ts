import { BODY_SPRITE, BODY_VISIBLE_RATIO } from './mapScenario';

/**
 * 8a-2 — recadrage des corps carte à l'échelle de la référence.
 *
 * Le rendu serveur cadre le corps sur `fullBounds`, accessoire compris. Un
 * véhicule (McLaren, Alpine, Audi, Aston Martin) ou un Pokémon agrandit donc
 * la fenêtre orthographique et rapetisse l'avatar dans le sprite. On mesure
 * une seule fois, au chargement, le plus grand composant alpha (l'avatar) et
 * on le remet à la hauteur de la référence (448/512 du sprite, soit 224 px
 * dans une image de 256 px de haut). Aucun travail par frame ni pendant le
 * zoom : le bitmap normalisé est ensuite seulement mis à l'échelle par
 * MapLibre via `icon-size`.
 */

export interface AlphaBounds {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

export interface AlphaComponents {
    /** Plus grand composant connexe : le personnage. */
    avatar: AlphaBounds;
    /** Tous les pixels opaques, accessoire compris. */
    scene: AlphaBounds;
}

export interface BodyFramePlan {
    width: number;
    height: number;
    /** Facteur source -> sprite (le corps doit faire 224 px de haut). */
    scale: number;
    offsetX: number;
    offsetY: number;
    bodyTop: number;
    bodyBottom: number;
    bodyHeight: number;
}

/** Hauteur de référence d'un corps dans le sprite carte (448/512 de 256). */
export const BODY_FRAME_TARGET_HEIGHT = BODY_SPRITE.height * BODY_VISIBLE_RATIO;
/** Pieds de la référence dans le sprite (495/512 de 256). */
export const BODY_FRAME_BOTTOM = BODY_SPRITE.height * (495 / 512);
export const BODY_FRAME_MIN_WIDTH = BODY_SPRITE.width;
const ALPHA_THRESHOLD = 8;

/**
 * Extrait les bornes alpha d'un RGBA. Une seule lecture par sprite, jamais
 * pendant le zoom ni par frame.
 */
export function alphaFromRgba(
    rgba: Uint8ClampedArray,
    width: number,
    height: number,
): Uint8ClampedArray {
    if (rgba.length !== width * height * 4) {
        throw new Error(`Image RGBA incohérente : ${rgba.length} octets pour ${width}×${height}`);
    }
    const alpha = new Uint8ClampedArray(width * height);
    for (let index = 0; index < alpha.length; index += 1) {
        alpha[index] = rgba[index * 4 + 3];
    }
    return alpha;
}

/**
 * Trouve le plus grand composant alpha (l'avatar) et l'enveloppe de tous les
 * pixels opaques (avatar + accessoire). Le véhicule est un composant séparé :
 * il ne doit pas définir la taille du personnage.
 */
export function alphaComponents(
    alpha: Uint8ClampedArray,
    width: number,
    height: number,
): AlphaComponents {
    if (width <= 0 || height <= 0 || alpha.length !== width * height) {
        throw new Error(`Masque alpha incohérent : ${alpha.length} px pour ${width}×${height}`);
    }

    let sceneLeft = width;
    let sceneTop = height;
    let sceneRight = 0;
    let sceneBottom = 0;
    for (let index = 0; index < alpha.length; index += 1) {
        if (alpha[index]! <= ALPHA_THRESHOLD) continue;
        const x = index % width;
        const y = (index - x) / width;
        if (x < sceneLeft) sceneLeft = x;
        if (x > sceneRight) sceneRight = x;
        if (y < sceneTop) sceneTop = y;
        if (y > sceneBottom) sceneBottom = y;
    }
    if (sceneRight < sceneLeft || sceneBottom < sceneTop) {
        throw new Error('Sprite corps vide : aucun pixel opaque');
    }

    const visited = new Uint8Array(width * height);
    const stack = new Int32Array(width * height);
    let bestArea = 0;
    let best: AlphaBounds | null = null;

    for (let start = 0; start < alpha.length; start += 1) {
        if (visited[start] || alpha[start]! <= ALPHA_THRESHOLD) continue;
        let top = 0;
        stack[top++] = start;
        visited[start] = 1;
        let area = 0;
        let left = width;
        let upper = height;
        let right = -1;
        let lower = -1;

        while (top > 0) {
            const index = stack[--top]!;
            const x = index % width;
            const y = (index - x) / width;
            area += 1;
            if (x < left) left = x;
            if (x > right) right = x;
            if (y < upper) upper = y;
            if (y > lower) lower = y;

            if (x > 0) {
                const next = index - 1;
                if (!visited[next] && alpha[next]! > ALPHA_THRESHOLD) {
                    visited[next] = 1;
                    stack[top++] = next;
                }
            }
            if (x + 1 < width) {
                const next = index + 1;
                if (!visited[next] && alpha[next]! > ALPHA_THRESHOLD) {
                    visited[next] = 1;
                    stack[top++] = next;
                }
            }
            if (y > 0) {
                const next = index - width;
                if (!visited[next] && alpha[next]! > ALPHA_THRESHOLD) {
                    visited[next] = 1;
                    stack[top++] = next;
                }
            }
            if (y + 1 < height) {
                const next = index + width;
                if (!visited[next] && alpha[next]! > ALPHA_THRESHOLD) {
                    visited[next] = 1;
                    stack[top++] = next;
                }
            }
        }

        if (area > bestArea) {
            bestArea = area;
            best = {x0: left, y0: upper, x1: right + 1, y1: lower + 1};
        }
    }

    if (!best) throw new Error('Sprite corps vide : aucun composant');
    return {
        avatar: best,
        scene: {x0: sceneLeft, y0: sceneTop, x1: sceneRight + 1, y1: sceneBottom + 1},
    };
}

/**
 * Calcule le canevas et la transformation qui placent l'avatar à la hauteur
 * de la référence, centré horizontalement et pieds à la même hauteur.
 */
export function planBodyFrame(
    sourceWidth: number,
    sourceHeight: number,
    avatar: AlphaBounds,
    scene: AlphaBounds,
): BodyFramePlan {
    if (sourceWidth <= 0 || sourceHeight <= 0) {
        throw new Error(`Sprite corps de taille invalide : ${sourceWidth}×${sourceHeight}`);
    }
    const avatarWidth = avatar.x1 - avatar.x0;
    const avatarHeight = avatar.y1 - avatar.y0;
    if (avatarWidth <= 0 || avatarHeight <= 0) {
        throw new Error(`Composant avatar vide : ${avatarWidth}×${avatarHeight}`);
    }

    const scale = BODY_FRAME_TARGET_HEIGHT / avatarHeight;
    const centerX = (avatar.x0 + avatar.x1) / 2;
    const neededHalf = Math.max(
        (centerX - scene.x0) * scale,
        (scene.x1 - centerX) * scale,
        BODY_FRAME_MIN_WIDTH / 2,
    );
    const width = Math.ceil(neededHalf) * 2;
    const offsetX = width / 2 - centerX * scale;
    const offsetY = BODY_FRAME_BOTTOM - avatar.y1 * scale;

    return {
        width,
        height: BODY_SPRITE.height,
        scale,
        offsetX,
        offsetY,
        bodyTop: offsetY + avatar.y0 * scale,
        bodyBottom: offsetY + avatar.y1 * scale,
        bodyHeight: avatarHeight * scale,
    };
}
