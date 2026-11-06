/** Marge verticale entre le sommet de la tête et le bas de la carte photo. */
export const PHOTO_HEAD_CLEARANCE = 0.18;

/**
 * Ancre de la carte photo, en unités du groupe avatar, à partir de la hauteur
 * réelle du sommet de tête. Aucune hauteur fixe : un avatar assis ou plus petit
 * n'aura pas la même ancre qu'un grand avatar.
 */
export function photoAnchorY(headTopY: number): number {
    if (!Number.isFinite(headTopY) || headTopY < 0) {
        throw new Error(`Hauteur de tête invalide : ${headTopY}`);
    }
    return headTopY + PHOTO_HEAD_CLEARANCE;
}
