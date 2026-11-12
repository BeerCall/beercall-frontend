/**
 * 8i — zone de toucher d'un avatar, commune aux trois mondes.
 *
 * Un cylindre invisible et fixe couvre le corps entier. Il n'y a ni survol ni
 * suivi de pointeur : seuls l'appui et le clic sont écoutés. Le seuil ci-dessous
 * distingue un toucher d'un glissement de caméra.
 */
export const AVATAR_HIT_RADIUS = 0.5;
export const AVATAR_HIT_HEIGHT = 1.9;
export const AVATAR_HIT_SEGMENTS = 8;

/**
 * Déplacement maximal, en pixels CSS, entre l'appui et le relâchement pour
 * ouvrir un profil. Au-delà, le geste est considéré comme un glissement de
 * caméra et n'ouvre rien.
 */
export const AVATAR_DRAG_THRESHOLD_PX = 8;

export function shouldOpenAvatarProfile(deltaPx: number): boolean {
    return deltaPx >= 0 && deltaPx <= AVATAR_DRAG_THRESHOLD_PX;
}
