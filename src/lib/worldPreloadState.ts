/**
 * 8h-4b-1 — État du préchargement GLB au repos.
 *
 * Le panneau de parcours doit afficher « préchargement terminé : oui/non »
 * avant de lancer les mesures. L'état est exposé sur `window` pour que la
 * recette puisse aussi attendre la fin du préchargement avant d'ouvrir un monde.
 */

export interface WorldPreloadStatus {
    started: boolean;
    done: boolean;
    files: number;
    failures: number;
    elapsedMs: number | null;
    /** Signature du plan terminé : un refetch identique ne repasse pas à « non ». */
    signature: string | null;
}

const initialStatus: WorldPreloadStatus = {
    started: false,
    done: false,
    files: 0,
    failures: 0,
    elapsedMs: null,
    signature: null,
};

let status: WorldPreloadStatus = { ...initialStatus };

declare global {
    interface Window {
        __beercallWorldPreload?: WorldPreloadStatus;
    }
}

function publish(): void {
    if (typeof window !== 'undefined') {
        window.__beercallWorldPreload = getWorldPreloadStatus();
    }
}

export function getWorldPreloadStatus(): WorldPreloadStatus {
    return { ...status };
}

export function reportWorldPreloadStart(files: number, signature: string): void {
    if (status.signature === signature && status.done) {
        return;
    }
    status = { started: true, done: false, files, failures: 0, elapsedMs: null, signature };
    publish();
}

export function reportWorldPreloadDone(files: number, failures: number, elapsedMs: number, signature: string): void {
    status = { started: true, done: true, files, failures, elapsedMs, signature };
    publish();
}

/** Réservé aux tests. */
export function resetWorldPreloadStatusForTests(): void {
    status = { ...initialStatus };
    if (typeof window !== 'undefined') {
        delete window.__beercallWorldPreload;
    }
}
