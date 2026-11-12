/**
 * 8j — bornes d'inclinaison de la caméra des mondes.
 *
 * L'ancien `SelectWorldModal` bornait la caméra avec `minPolarAngle = Math.PI / 3`
 * et `maxPolarAngle = Math.PI / 1.8` (100°). Ces valeurs étaient sûres avec une
 * caméra très éloignée et une cible haute ; les mondes actuels utilisent une
 * caméra proche (rayon ≈ 17 à 19 unités) et une cible basse, où 100° passe sous
 * le décor (Bar -1,7 ; Piscine -1,7 ; Dodo +2,5 alors que le sol est à 5,3).
 *
 * La borne est donc calculée par monde à partir du rayon réel caméra → cible et
 * du sol mesuré (`planeY`), puis plafonnée à la valeur historique : la rotation
 * horizontale reste libre à 360°, seule la descente est arrêtée au-dessus du sol.
 */
import { WORLD_SPECS, type WorldKind } from './pocWorldScenario';

/** Inclinaison la plus haute conservée de l'ancien `SelectWorldModal` (60°). */
export const WORLD_CAMERA_MIN_POLAR_ANGLE = Math.PI / 3;

/** Plafond historique de l'ancien `SelectWorldModal` (100°), jamais dépassé. */
export const WORLD_CAMERA_LEGACY_MAX_POLAR_ANGLE = Math.PI / 1.8;

/** Marge verticale minimale entre la caméra et le sol mesuré (unités monde). */
export const WORLD_CAMERA_FLOOR_MARGIN = 0.35;

/**
 * Borne prudente tant que le sol n'est pas encore mesuré : la caméra reste au
 * dessus de l'horizontale de la cible. Elle est plus stricte que les trois
 * valeurs calculées, donc l'arrivée de la mesure ne fait jamais remonter la
 * caméra de façon visible.
 */
export const WORLD_CAMERA_UNMEASURED_MAX_POLAR_ANGLE = Math.PI / 2 - 0.05;

/** Distance entre la caméra initiale du monde et sa cible. */
export function worldCameraRadius(kind: WorldKind): number {
    const { camera, target } = WORLD_SPECS[kind];
    return Math.hypot(camera[0] - target[0], camera[1] - target[1], camera[2] - target[2]);
}

/**
 * Inclinaison polaire maximale pour laquelle la caméra reste au-dessus du sol.
 *
 * `cameraY = target.y + radius * cos(polar)`, donc la limite est
 * `acos((floorY + marge - target.y) / radius)`. Le résultat est encadré par les
 * bornes historiques. Un sol inconnu renvoie la borne prudente.
 */
export function worldCameraMaxPolarAngle(kind: WorldKind, floorY: number | null): number {
    if (floorY === null || !Number.isFinite(floorY)) {
        return WORLD_CAMERA_UNMEASURED_MAX_POLAR_ANGLE;
    }
    const radius = worldCameraRadius(kind);
    const minimumCameraY = floorY + WORLD_CAMERA_FLOOR_MARGIN;
    const cosine = (minimumCameraY - WORLD_SPECS[kind].target[1]) / radius;
    if (!Number.isFinite(cosine)) {
        return WORLD_CAMERA_UNMEASURED_MAX_POLAR_ANGLE;
    }
    const limit = Math.acos(Math.max(-1, Math.min(1, cosine)));
    return Math.max(
        WORLD_CAMERA_MIN_POLAR_ANGLE,
        Math.min(WORLD_CAMERA_LEGACY_MAX_POLAR_ANGLE, limit),
    );
}
