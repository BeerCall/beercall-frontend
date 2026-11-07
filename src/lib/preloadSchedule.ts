/**
 * 8h-3 — Ordonnanceur de préchargement au repos.
 *
 * `requestIdleCallback` n'existe pas sur Safari iOS. Le repli ne doit pas
 * transformer le préchargement en travail pendant que l'utilisateur manipule
 * la carte : on attend une fenêtre sans interaction récente, on vérifie encore
 * l'absence d'interaction quand le callback arrive, et on se replanifie sinon.
 */

import { isWorldOpen } from './worldOpenState';

const QUIET_MS = 1200;
const RETRY_HIDDEN_MS = 500;
const RETRY_WORLD_OPEN_MS = 500;
const FALLBACK_DELAY_MS = 50;
const IDLE_TIMEOUT_MS = 3000;

const INTERACTION_EVENTS = [
    'pointerdown',
    'pointerup',
    'mousedown',
    'wheel',
    'touchstart',
    'touchmove',
    'keydown',
] as const;

let lastInteractionAt = 0;
let listening = false;
let worldOpenLogged = false;

function installInteractionTracking(): void {
    if (listening || typeof window === 'undefined') return;
    listening = true;
    const mark = () => { lastInteractionAt = Date.now(); };
    // Capture : un canvas de carte peut arrêter la propagation des événements.
    for (const event of INTERACTION_EVENTS) {
        document.addEventListener(event, mark, {capture: true, passive: true});
    }
}

/** Planifie `callback` après une fenêtre de repos. Retourne son annulation. */
export function whenPreloadIdle(callback: () => void): () => void {
    installInteractionTracking();
    let cancelled = false;
    let idleHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const clearHandles = () => {
        if (idleHandle !== null && typeof window.cancelIdleCallback === 'function') {
            window.cancelIdleCallback(idleHandle);
            idleHandle = null;
        }
        if (timeoutHandle !== null) {
            clearTimeout(timeoutHandle);
            timeoutHandle = null;
        }
    };

    const run = () => {
        if (cancelled) return;
        idleHandle = null;
        timeoutHandle = null;
        if (isWorldOpen() || document.hidden || Date.now() - lastInteractionAt < QUIET_MS) {
            schedule();
            return;
        }
        if (worldOpenLogged) {
            worldOpenLogged = false;
            console.info('[world] préchargement repris');
        }
        callback();
    };

    const schedule = () => {
        if (cancelled) return;
        if (isWorldOpen()) {
            if (!worldOpenLogged) {
                worldOpenLogged = true;
                console.info('[world] préchargement suspendu (monde ouvert)');
            }
            timeoutHandle = setTimeout(schedule, RETRY_WORLD_OPEN_MS);
            return;
        }
        if (document.hidden) {
            timeoutHandle = setTimeout(schedule, RETRY_HIDDEN_MS);
            return;
        }
        const quietFor = Date.now() - lastInteractionAt;
        if (quietFor < QUIET_MS) {
            timeoutHandle = setTimeout(schedule, QUIET_MS - quietFor);
            return;
        }
        if (typeof window.requestIdleCallback === 'function') {
            idleHandle = window.requestIdleCallback(run, {timeout: IDLE_TIMEOUT_MS});
            return;
        }
        timeoutHandle = setTimeout(run, FALLBACK_DELAY_MS);
    };

    schedule();

    return () => {
        cancelled = true;
        clearHandles();
    };
}

/** Réinitialisation réservée aux tests. */
export function resetPreloadScheduleForTests(): void {
    lastInteractionAt = 0;
    worldOpenLogged = false;
}
