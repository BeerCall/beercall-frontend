/**
 * 8l — règles pures de la machine à sous du monde Bar.
 *
 * Le levier s'abaisse pendant `SLOT_LEVER_PULL_MS` puis lance (ou reprend) la
 * partie. Comme pour les avatars de 8i, seul un vrai toucher déclenche : un
 * glissement de caméra au-delà de 8 px est ignoré.
 */
import { shouldOpenAvatarProfile } from './avatarHitTarget';

/** Machine en lévitation au-dessus du comptoir, hors de portée des avatars. */
export const SLOT_MACHINE_POSITION: [number, number, number] = [-1.5, 2.45, 1.2];

/** Orientation : l'écran regarde la caméra initiale du Bar. */
export const SLOT_MACHINE_ROTATION_Y = 0.9;

/** Durée de l'abaissement du levier avant l'appel réseau. */
export const SLOT_LEVER_PULL_MS = 600;

/** Inclinaison du levier tiré (72°), comme l'ancien BarWorld. */
export const SLOT_LEVER_DOWN_ANGLE = Math.PI / 2.5;

export interface LeverPullState {
    /** Couche Bar affichée et modale ouverte. */
    active: boolean;
    /** Apéro actif et au moins deux participants fiables. */
    canLaunch: boolean;
    /** Requête de jeu en cours. */
    locked: boolean;
    /** Levier déjà en cours d'abaissement. */
    pulled: boolean;
    /** Déplacement du doigt entre l'appui et le relâchement, en pixels CSS. */
    delta: number;
}

/** Un toucher déclenche le levier ; un glissement de caméra non. */
export function shouldPullLever(state: LeverPullState): boolean {
    return state.active
        && state.canLaunch
        && !state.locked
        && !state.pulled
        && shouldOpenAvatarProfile(state.delta);
}

export interface SlotMachineScreen {
    /** Couleur de l'écran : ambre avant la partie, vert quand elle tourne. */
    color: string;
    /** Texte affiché, une entrée par ligne. */
    lines: string[];
}

export function slotMachineScreen(gameInProgress: boolean): SlotMachineScreen {
    return gameInProgress
        ? { color: '#059669', lines: ['REJOINDRE', 'LA SQUAD'] }
        : { color: '#d97706', lines: ['JACKPOT'] };
}
