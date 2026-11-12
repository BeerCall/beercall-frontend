/**
 * 8h-3 — Regroupe les hauteurs de tête mesurées par les avatars.
 *
 * Chaque `onHeadAnchor` alimentait directement un `setState`, ce qui re-rendait
 * toute la foule une fois par avatar (50 rendus pour le Dodo). Ici les hauteurs
 * sont accumulées dans un objet local et un seul flush est émis :
 * - dès que toutes les hauteurs attendues sont reçues ;
 * - sinon après un court délai, pour qu'un avatar sans os de tête ne bloque
 *   jamais les autres libellés (le délai ne baisse aucun seuil de perf).
 */

export type HeadHeights = Record<number, number>;

export const HEAD_HEIGHT_FLUSH_DELAY_MS = 400;

export interface HeadHeightBatcherOptions {
    onFlush: (heights: HeadHeights) => void;
    delayMs?: number;
    setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
    clearTimer?: (handle: ReturnType<typeof setTimeout>) => void;
}

export interface HeadHeightBatcher {
    /** Nombre d'avatars dont une hauteur est attendue. */
    setExpected: (count: number) => void;
    /** Ajoute ou met à jour la hauteur d'un avatar. */
    add: (index: number, height: number) => void;
    /** Annule le flush différé (démontage du monde). */
    cancel: () => void;
}

export function createHeadHeightBatcher({
    onFlush,
    delayMs = HEAD_HEIGHT_FLUSH_DELAY_MS,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
}: HeadHeightBatcherOptions): HeadHeightBatcher {
    const heights: HeadHeights = {};
    const received = new Set<number>();
    let expected = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearScheduled = () => {
        if (timer !== null) {
            clearTimer(timer);
            timer = null;
        }
    };

    const flush = () => {
        clearScheduled();
        if (received.size === 0) return;
        onFlush({...heights});
    };

    const scheduleFlush = () => {
        clearScheduled();
        timer = setTimer(flush, delayMs);
    };

    return {
        setExpected(count) {
            if (!Number.isFinite(count) || count < 0) {
                throw new Error(`Nombre d'avatars invalide : ${count}`);
            }
            expected = count;
            if (expected > 0 && received.size >= expected) flush();
        },
        add(index, height) {
            if (!Number.isFinite(height) || height < 0) {
                throw new Error(`Hauteur de tête invalide pour l'avatar ${index} : ${height}`);
            }
            if (heights[index] === height) return;
            heights[index] = height;
            received.add(index);
            if (expected > 0 && received.size >= expected) {
                flush();
                return;
            }
            scheduleFlush();
        },
        cancel: clearScheduled,
    };
}
