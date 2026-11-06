import { describe, expect, it } from 'vitest';

import { mapBodyPlacement } from '../map/snap/avatarIcons';
import { BODY_CSS_PX, BODY_SPRITE } from '../map/snap/mapScenario';

describe('cadre des corps de la carte (PoC 7ad2d84)', () => {
    it('normalise un corps 256×512 au cadre PoC 198/256 et pieds à 6 px du bas', () => {
        const placement = mapBodyPlacement({x: 20, y: 24, width: 79, height: 224 });
        expect(placement.height).toBeCloseTo(BODY_SPRITE.height * (198 / 256), 6);
        expect(placement.y).toBeCloseTo(BODY_SPRITE.height - 6 - placement.height, 6);
        expect(placement.width).toBeLessThanOrEqual(BODY_SPRITE.width);
    });

    it('laisse le cadre PoC inchangé pour un corps déjà à 198/256', () => {
        const placement = mapBodyPlacement({x: 32, y: 53, width: 64, height: 198 });
        expect(placement.height).toBe(198);
        expect(placement.width).toBe(64);
        expect(placement.y).toBe(52);
        expect(placement.x).toBe(32);
    });

    it('conserve un corps large sans rognage', () => {
        const placement = mapBodyPlacement({x: 4, y: 53, width: 120, height: 198 });
        expect(placement.width).toBe(120);
        expect(placement.height).toBe(198);
        expect(placement.x).toBe(4);
    });

    it('borne la largeur à 128 px pour un corps plus large', () => {
        const placement = mapBodyPlacement({x: 0, y: 0, width: 200, height: 100 });
        expect(placement.width).toBe(128);
        expect(placement.height).toBeLessThan(198);
    });

    it('donne la taille visible carte de la PoC : 77,34 px pour un cadre de 100 px', () => {
        const placement = mapBodyPlacement({x: 32, y: 53, width: 64, height: 198 });
        const visiblePx = (placement.height / BODY_SPRITE.height) * BODY_CSS_PX;
        expect(visiblePx).toBeCloseTo(77.34375, 5);
    });
});
