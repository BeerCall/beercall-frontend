import { describe, expect, it } from 'vitest';

import { PHOTO_HEAD_CLEARANCE, photoAnchorY } from '../worlds/photoAnchor';

describe('position de la preuve photo au-dessus de la tête (8d-2)', () => {
    it('suit la hauteur réelle de la tête, au lieu de 2.2 fixe', () => {
        expect(photoAnchorY(1.6)).toBeCloseTo(1.6 + PHOTO_HEAD_CLEARANCE, 6);
        expect(photoAnchorY(1.95)).toBeCloseTo(1.95 + PHOTO_HEAD_CLEARANCE, 6);
        // L'ancien code plaçait toutes les cartes à 2.2, quelle que soit la taille.
        expect(photoAnchorY(1.6)).not.toBeCloseTo(2.2, 3);
        expect(photoAnchorY(1.95)).toBeGreaterThan(photoAnchorY(1.6));
    });

    it('garde une marge positive au-dessus de la tête', () => {
        expect(PHOTO_HEAD_CLEARANCE).toBeGreaterThan(0);
        expect(photoAnchorY(1.7) - 1.7).toBeCloseTo(PHOTO_HEAD_CLEARANCE, 6);
    });

    it('refuse une hauteur invalide au lieu d’un repli silencieux', () => {
        expect(() => photoAnchorY(Number.NaN)).toThrow('Hauteur de tête invalide');
        expect(() => photoAnchorY(-1)).toThrow('Hauteur de tête invalide');
    });
});
