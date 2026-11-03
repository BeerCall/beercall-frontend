import { describe, it, expect } from 'vitest';
import { formatAgo } from './formatAgo';

const now = Date.parse('2026-11-02T12:00:00.000Z');
const ago = (ms: number) => new Date(now - ms).toISOString();

describe('formatAgo', () => {
    it("affiche l'instant pour moins d'une minute", () => {
        expect(formatAgo(ago(0), now)).toBe("à l'instant");
        expect(formatAgo(ago(59_000), now)).toBe("à l'instant");
        expect(formatAgo(ago(60_000), now)).toBe('1 min');
    });

    it('affiche les minutes', () => {
        expect(formatAgo(ago(2 * 60_000), now)).toBe('2 min');
        expect(formatAgo(ago(59 * 60_000), now)).toBe('59 min');
        expect(formatAgo(ago(60 * 60_000), now)).toBe('1 h');
    });

    it('affiche les heures', () => {
        expect(formatAgo(ago(23 * 3_600_000), now)).toBe('23 h');
        expect(formatAgo(ago(24 * 3_600_000), now)).toBe('1 j');
    });

    it('affiche les jours', () => {
        expect(formatAgo(ago(72 * 3_600_000), now)).toBe('3 j');
    });

    it('ramene une date future a zero', () => {
        expect(formatAgo(new Date(now + 10_000).toISOString(), now)).toBe("à l'instant");
    });

    it('signale une date invalide ou absente', () => {
        expect(formatAgo('pas une date', now)).toBe('date inconnue');
        expect(formatAgo(null, now)).toBe('date inconnue');
        expect(formatAgo(undefined, now)).toBe('date inconnue');
        expect(formatAgo('', now)).toBe('date inconnue');
    });
});
