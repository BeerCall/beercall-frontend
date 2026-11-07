import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    attachWorldContextRecovery,
    WORLD_CONTEXT_RESTORE_TIMEOUT_MS,
} from '../worlds/worldContextRecovery';

function contextLostEvent(): Event {
    return new Event('webglcontextlost', { cancelable: true });
}

describe('reprise du contexte WebGL des mondes', () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.useFakeTimers();
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        errorSpy.mockRestore();
    });

    it('annule la perte et laisse la restauration se faire sans afficher le secours', () => {
        const canvas = document.createElement('canvas');
        const onLost = vi.fn();
        const onRestored = vi.fn();
        const onFailed = vi.fn();
        const cleanup = attachWorldContextRecovery(canvas, { onLost, onRestored, onFailed });

        const lost = contextLostEvent();
        canvas.dispatchEvent(lost);

        expect(lost.defaultPrevented).toBe(true);
        expect(onLost).toHaveBeenCalledTimes(1);
        expect(onFailed).not.toHaveBeenCalled();

        canvas.dispatchEvent(new Event('webglcontextrestored'));
        expect(onRestored).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(WORLD_CONTEXT_RESTORE_TIMEOUT_MS);
        expect(onFailed).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith('[world] Contexte WebGL perdu', expect.any(Object));
        expect(errorSpy).toHaveBeenCalledWith('[world] Contexte WebGL restauré');

        cleanup();
    });

    it('signale l’échec seulement après le délai de restauration', () => {
        const canvas = document.createElement('canvas');
        const onFailed = vi.fn();
        const cleanup = attachWorldContextRecovery(canvas, { onFailed });

        canvas.dispatchEvent(contextLostEvent());
        vi.advanceTimersByTime(WORLD_CONTEXT_RESTORE_TIMEOUT_MS - 1);
        expect(onFailed).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(onFailed).toHaveBeenCalledTimes(1);
        expect(errorSpy).toHaveBeenCalledWith(
            `[world] Restauration WebGL non confirmée après ${WORLD_CONTEXT_RESTORE_TIMEOUT_MS} ms`,
            expect.any(Object),
        );

        cleanup();
    });

    it('retire les écouteurs et annule le délai au démontage', () => {
        const canvas = document.createElement('canvas');
        const onLost = vi.fn();
        const onFailed = vi.fn();
        const cleanup = attachWorldContextRecovery(canvas, { onLost, onFailed });

        cleanup();
        canvas.dispatchEvent(contextLostEvent());
        vi.advanceTimersByTime(WORLD_CONTEXT_RESTORE_TIMEOUT_MS);

        expect(onLost).not.toHaveBeenCalled();
        expect(onFailed).not.toHaveBeenCalled();
    });
});
