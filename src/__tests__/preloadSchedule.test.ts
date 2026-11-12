import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPreloadScheduleForTests, whenPreloadIdle } from '../lib/preloadSchedule';
import { beginWorldOpen, endWorldOpen, resetWorldOpenState } from '../lib/worldOpenState';

describe('ordonnanceur du préchargement au repos (8h-3)', () => {
    afterEach(() => {
        vi.useRealTimers();
        resetPreloadScheduleForTests();
        resetWorldOpenState();
    });

    it('prépare hors interaction quand la carte est au repos', () => {
        vi.useFakeTimers();
        const callback = vi.fn();
        whenPreloadIdle(callback);
        vi.advanceTimersByTime(100);
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it('attend 1,2 s après la dernière interaction', () => {
        vi.useFakeTimers();
        const callback = vi.fn();
        document.dispatchEvent(new Event('pointerdown'));
        whenPreloadIdle(callback);
        vi.advanceTimersByTime(1000);
        expect(callback).not.toHaveBeenCalled();
        vi.advanceTimersByTime(300);
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it('suspend le préchargement tant qu’un monde est ouvert, puis reprend', () => {
        vi.useFakeTimers();
        const callback = vi.fn();
        beginWorldOpen();
        whenPreloadIdle(callback);
        vi.advanceTimersByTime(5000);
        expect(callback).not.toHaveBeenCalled();
        endWorldOpen();
        vi.advanceTimersByTime(600);
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it('n’appelle jamais le callback après annulation', () => {
        vi.useFakeTimers();
        const callback = vi.fn();
        const cancel = whenPreloadIdle(callback);
        cancel();
        vi.advanceTimersByTime(5000);
        expect(callback).not.toHaveBeenCalled();
    });
});
