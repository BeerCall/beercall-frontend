import { describe, expect, it } from 'vitest';

import { bodyVisibleHeightPx } from '../map/snap/avatarIcons';
import { BODY_CSS_PX, BODY_ICON_SIZE, BODY_SPRITE } from '../map/snap/mapScenario';

describe('taille des corps de la carte (cadrage e4ab949, avant 7b-3c)', () => {
    it('fige 87,5 px visibles dans un cadre de 100 px', () => {
        // Sprite corps FluiditeDemo : 256×512, corps visible 448 px de haut.
        const visibleRatio = 448 / 512;
        expect(BODY_CSS_PX).toBe(100);
        expect(bodyVisibleHeightPx(visibleRatio)).toBeCloseTo(87.5, 6);
    });

    it('conserve le cadre 128×256 et le facteur d’échelle carte', () => {
        expect(BODY_SPRITE).toEqual({ width: 128, height: 256 });
        expect(BODY_ICON_SIZE).toBeCloseTo(100 / 256, 10);
    });

    it('garde la référence 448/512 et pas la normalisation PoC 198/256', () => {
        expect(bodyVisibleHeightPx(198 / 256)).toBeCloseTo(77.34375, 5);
        expect(bodyVisibleHeightPx(448 / 512)).toBeGreaterThan(bodyVisibleHeightPx(198 / 256));
    });
});
