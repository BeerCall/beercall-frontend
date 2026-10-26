import {Box3} from 'three';

/**
 * Cadrage perspective borné pour une miniature : l'assemblage complet (accessoire
 * inclus) doit tenir dans le cadre avec 10 % de marge sur chaque bord.
 *
 * Ce module est volontairement pur : aucune mutation de la Box3, aucune caméra créée,
 * aucun accès au DOM. Le renderer applique le résultat.
 */

export const FRAMING_MARGIN = 0.8;

export interface AvatarFramingInput {
    /** Boîte englobante monde de l'assemblage posé (SkinnedMesh courant inclus). */
    box: Box3;
    /** Largeur CSS du canvas en pixels. */
    width: number;
    /** Hauteur CSS du canvas en pixels. */
    height: number;
    /** FOV vertical en degrés. */
    fov: number;
}

export interface AvatarFramingReady {
    ok: true;
    /** Point visé (centre de la boîte), coordonnées monde. */
    center: [number, number, number];
    /** Position caméra sur l'axe +Z depuis le centre. */
    position: [number, number, number];
    distance: number;
    near: number;
    far: number;
    /** Demi-largeur/demi-hauteur du plan au centre, utiles au diagnostic. */
    tanHalfVertical: number;
    tanHalfHorizontal: number;
}

export interface AvatarFramingUnavailable {
    ok: false;
    reason: 'empty-box' | 'non-finite-box' | 'invalid-size' | 'invalid-fov';
}

export type AvatarFraming = AvatarFramingReady | AvatarFramingUnavailable;

function isFinitePositive(value: number): boolean {
    return Number.isFinite(value) && value > 0;
}

export function computeAvatarFraming({box, width, height, fov}: AvatarFramingInput): AvatarFraming {
    if (!isFinitePositive(width) || !isFinitePositive(height)) {
        return {ok: false, reason: 'invalid-size'};
    }
    if (!isFinitePositive(fov) || fov >= 180) {
        return {ok: false, reason: 'invalid-fov'};
    }
    if (!box || box.isEmpty()) {
        return {ok: false, reason: 'empty-box'};
    }

    const min = box.min;
    const max = box.max;
    const bounds = [min.x, min.y, min.z, max.x, max.y, max.z];
    if (!bounds.every(value => Number.isFinite(value))) {
        return {ok: false, reason: 'non-finite-box'};
    }

    const center: [number, number, number] = [
        (min.x + max.x) / 2,
        (min.y + max.y) / 2,
        (min.z + max.z) / 2,
    ];

    const tanHalfVertical = Math.tan((fov * Math.PI) / 360);
    const tanHalfHorizontal = tanHalfVertical * (width / height);

    let distance = 0;

    for (const x of [min.x, max.x]) {
        for (const y of [min.y, max.y]) {
            for (const z of [min.z, max.z]) {
                const dx = Math.abs(x - center[0]);
                const dy = Math.abs(y - center[1]);
                const dz = z - center[2];
                const required = Math.max(
                    dz + dx / (FRAMING_MARGIN * tanHalfHorizontal),
                    dz + dy / (FRAMING_MARGIN * tanHalfVertical),
                );
                if (required > distance) distance = required;
            }
        }
    }

    if (!Number.isFinite(distance) || distance <= 0) {
        return {ok: false, reason: 'empty-box'};
    }

    // Profondeurs caméra réelles de chaque coin, une fois la distance fixée.
    let nearestDepth = Number.POSITIVE_INFINITY;
    let farthestDepth = Number.NEGATIVE_INFINITY;
    for (const z of [min.z, max.z]) {
        const depth = distance - (z - center[2]);
        if (depth < nearestDepth) nearestDepth = depth;
        if (depth > farthestDepth) farthestDepth = depth;
    }

    if (!Number.isFinite(nearestDepth) || nearestDepth <= 0) {
        return {ok: false, reason: 'empty-box'};
    }

    const near = Math.max(0.01, nearestDepth * 0.5);
    const far = Math.max(near * 1.01, farthestDepth + Math.max(1, distance * 0.5));

    return {
        ok: true,
        center,
        position: [center[0], center[1], center[2] + distance],
        distance,
        near,
        far,
        tanHalfVertical,
        tanHalfHorizontal,
    };
}
