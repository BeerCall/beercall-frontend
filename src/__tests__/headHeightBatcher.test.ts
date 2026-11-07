import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHeadHeightBatcher, HEAD_HEIGHT_FLUSH_DELAY_MS } from '../worlds/headHeightBatcher';

describe('regroupement des hauteurs de tête (8h-3)', () => {
    afterEach(() => { vi.useRealTimers(); });

    it('émet un seul flush pour les 50 hauteurs du Dodo', () => {
        const onFlush = vi.fn();
        const batcher = createHeadHeightBatcher({onFlush});
        batcher.setExpected(50);
        for (let index = 0; index < 50; index += 1) {
            batcher.add(index, 1.5 + index * 0.01);
        }
        expect(onFlush).toHaveBeenCalledTimes(1);
        expect(Object.keys(onFlush.mock.calls[0][0])).toHaveLength(50);
    });

    it('n’émet rien tant que toutes les hauteurs attendues ne sont pas là, puis une fois après le délai', () => {
        vi.useFakeTimers();
        const onFlush = vi.fn();
        const batcher = createHeadHeightBatcher({onFlush});
        batcher.setExpected(3);
        batcher.add(0, 1.4);
        batcher.add(1, 1.5);
        expect(onFlush).not.toHaveBeenCalled();
        vi.advanceTimersByTime(HEAD_HEIGHT_FLUSH_DELAY_MS - 1);
        expect(onFlush).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(onFlush).toHaveBeenCalledTimes(1);
        expect(onFlush.mock.calls[0][0]).toEqual({0: 1.4, 1: 1.5});
    });

    it('ignore une hauteur identique et ne re-rend pas la foule', () => {
        const onFlush = vi.fn();
        const batcher = createHeadHeightBatcher({onFlush});
        batcher.setExpected(2);
        batcher.add(0, 1.4);
        batcher.add(0, 1.4);
        expect(onFlush).not.toHaveBeenCalled();
        batcher.add(1, 1.5);
        expect(onFlush).toHaveBeenCalledTimes(1);
    });

    it('prend en compte le nombre d’avatars attendu déclaré après les mesures', () => {
        const onFlush = vi.fn();
        const batcher = createHeadHeightBatcher({onFlush});
        batcher.add(0, 1.4);
        batcher.add(1, 1.5);
        batcher.setExpected(2);
        expect(onFlush).toHaveBeenCalledTimes(1);
        expect(onFlush.mock.calls[0][0]).toEqual({0: 1.4, 1: 1.5});
    });

    it('annule le flush différé au démontage du monde', () => {
        vi.useFakeTimers();
        const onFlush = vi.fn();
        const batcher = createHeadHeightBatcher({onFlush});
        batcher.setExpected(2);
        batcher.add(0, 1.4);
        batcher.cancel();
        vi.advanceTimersByTime(HEAD_HEIGHT_FLUSH_DELAY_MS);
        expect(onFlush).not.toHaveBeenCalled();
    });

    it('refuse une hauteur invalide au lieu de la placer silencieusement', () => {
        const batcher = createHeadHeightBatcher({onFlush: vi.fn()});
        expect(() => batcher.add(0, Number.NaN)).toThrow(/Hauteur de tête invalide/);
        expect(() => batcher.add(0, -1)).toThrow(/Hauteur de tête invalide/);
    });
});
