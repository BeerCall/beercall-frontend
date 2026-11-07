/**
 * 8h-3 — État global d'ouverture d'un monde.
 *
 * Le préchargement GLB s'arrête dès qu'un monde est ouvert (et reprend au
 * retour sur la carte) pour ne jamais disputer le thread principal, le réseau
 * ou le GPU à l'assemblage et au premier rendu du monde.
 */

let openCount = 0;

export function beginWorldOpen(): void {
    openCount += 1;
}

export function endWorldOpen(): void {
    openCount = Math.max(0, openCount - 1);
}

export function isWorldOpen(): boolean {
    return openCount > 0;
}

/** Réinitialisation réservée aux tests. */
export function resetWorldOpenState(): void {
    openCount = 0;
}
