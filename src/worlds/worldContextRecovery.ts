/**
 * 8h-4b-2 — Reprise automatique du contexte WebGL des mondes.
 *
 * `webglcontextlost` est annulé (preventDefault) pour laisser le navigateur
 * restaurer le contexte. `webglcontextrestored` relance le rendu. Si la
 * restauration n'arrive pas dans le délai, l'appelant affiche le bouton
 * « Réessayer » en dernier recours.
 *
 * Tous les événements sont tracés : aucune perte ni restauration n'est avalée.
 */

import { webglStats } from '../three/lease/webgl';

export const WORLD_CONTEXT_RESTORE_TIMEOUT_MS = 5_000;

export interface WorldContextRecoveryOptions {
    onLost?: (event: Event) => void;
    onRestored?: () => void;
    onFailed?: () => void;
    timeoutMs?: number;
    setTimeoutFn?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
    clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void;
}

export function attachWorldContextRecovery(
    canvas: HTMLCanvasElement,
    options: WorldContextRecoveryOptions = {},
): () => void {
    const timeoutMs = options.timeoutMs ?? WORLD_CONTEXT_RESTORE_TIMEOUT_MS;
    const setTimer = options.setTimeoutFn ?? setTimeout;
    const clearTimer = options.clearTimeoutFn ?? clearTimeout;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const clearPending = () => {
        if (timer !== null) {
            clearTimer(timer);
            timer = null;
        }
    };

    const onLost = (event: Event) => {
        // Sans preventDefault, le contexte n'est jamais restaurable.
        event.preventDefault();
        const stats = webglStats();
        console.error('[world] Contexte WebGL perdu', {
            created: stats.created,
            active: stats.active,
            unexpectedLoss: stats.unexpectedLoss,
        });
        clearPending();
        timer = setTimer(() => {
            if (disposed) return;
            console.error(`[world] Restauration WebGL non confirmée après ${timeoutMs} ms`, {
                created: webglStats().created,
                active: webglStats().active,
            });
            options.onFailed?.();
        }, timeoutMs);
        options.onLost?.(event);
    };

    const onRestored = () => {
        clearPending();
        console.error('[world] Contexte WebGL restauré');
        options.onRestored?.();
    };

    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);

    return () => {
        disposed = true;
        clearPending();
        canvas.removeEventListener('webglcontextlost', onLost);
        canvas.removeEventListener('webglcontextrestored', onRestored);
    };
}
