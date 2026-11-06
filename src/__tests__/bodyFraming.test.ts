import { describe, expect, it } from 'vitest';

import {
    BODY_FRAME_BOTTOM,
    BODY_FRAME_TARGET_HEIGHT,
    alphaComponents,
    alphaFromRgba,
    planBodyFrame,
    type AlphaBounds,
} from '../map/snap/bodyFraming';
import { BODY_SPRITE } from '../map/snap/mapScenario';

interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

function mask(width: number, height: number, rects: Rect[]): Uint8ClampedArray {
    const alpha = new Uint8ClampedArray(width * height);
    for (const rect of rects) {
        for (let y = rect.y; y < rect.y + rect.height; y += 1) {
            for (let x = rect.x; x < rect.x + rect.width; x += 1) {
                alpha[y * width + x] = 255;
            }
        }
    }
    return alpha;
}

// Mesures réelles des sprites Fluide50 (voir 8a-2) :
// - FluiditeDemo, accessoire Beer : corps 448 px ;
// - FluiditeUser_1, McLaren : corps 225 px, voiture séparée à droite.
const FULL_AVATAR: AlphaBounds = {x0: 41, y0: 47, x1: 199, y1: 495};
const FULL_SCENE: AlphaBounds = {x0: 41, y0: 47, x1: 199, y1: 495};
const CAR_AVATAR: AlphaBounds = {x0: 91, y0: 278, x1: 165, y1: 503};
const CAR_SCENE: AlphaBounds = {x0: 90, y0: 267, x1: 247, y1: 503};

describe('cadrage des corps carte (8a-2)', () => {
    it('sépare l’avatar du véhicule et garde l’enveloppe complète', () => {
        const alpha = mask(40, 50, [
            {x: 2, y: 5, width: 10, height: 20},
            {x: 25, y: 35, width: 6, height: 6},
        ]);
        expect(alphaComponents(alpha, 40, 50)).toEqual({
            avatar: {x0: 2, y0: 5, x1: 12, y1: 25},
            scene: {x0: 2, y0: 5, x1: 31, y1: 41},
        });
    });

    it('extrait l’alpha d’un RGBA sans toucher aux couleurs', () => {
        const rgba = new Uint8ClampedArray([0, 0, 0, 0, 1, 2, 3, 255]);
        expect([...alphaFromRgba(rgba, 2, 1)]).toEqual([0, 255]);
    });

    it('garde la référence à 224 px de corps dans une image de 256 px', () => {
        const plan = planBodyFrame(256, 512, FULL_AVATAR, FULL_SCENE);
        expect(BODY_FRAME_TARGET_HEIGHT).toBe(224);
        expect(BODY_SPRITE).toEqual({width: 128, height: 256});
        expect(plan).toMatchObject({width: 128, height: 256, bodyHeight: 224});
        expect(plan.bodyTop).toBeCloseTo(23.5, 6);
        expect(plan.bodyBottom).toBeCloseTo(BODY_FRAME_BOTTOM, 6);
        expect(plan.scale).toBeCloseTo(0.5, 6);
    });

    it('remet un avatar avec voiture à la même hauteur que la référence', () => {
        const plan = planBodyFrame(256, 512, CAR_AVATAR, CAR_SCENE);
        expect(plan.bodyHeight).toBeCloseTo(224, 6);
        expect(plan.bodyTop).toBeCloseTo(23.5, 6);
        expect(plan.bodyBottom).toBeCloseTo(BODY_FRAME_BOTTOM, 6);
        expect(plan.scale).toBeCloseTo(224 / 225, 6);
        // Ancien comportement (source entière à 0,5) : 112,5 px de corps.
        expect(plan.bodyHeight).not.toBeCloseTo(112.5, 3);
    });

    it('laisse la voiture entière dans l’image élargie', () => {
        const plan = planBodyFrame(256, 512, CAR_AVATAR, CAR_SCENE);
        expect(plan.width).toBe(238);
        expect(plan.offsetX + CAR_SCENE.x0 * plan.scale).toBeGreaterThanOrEqual(0);
        expect(plan.offsetX + CAR_SCENE.x1 * plan.scale).toBeLessThanOrEqual(plan.width);
        expect(plan.offsetY + CAR_SCENE.y1 * plan.scale).toBeLessThanOrEqual(plan.height);
    });

    it('refuse un sprite vide au lieu de produire une taille arbitraire', () => {
        expect(() => alphaComponents(new Uint8ClampedArray(4), 2, 2)).toThrow('vide');
        expect(() => planBodyFrame(
            256,
            512,
            {x0: 10, y0: 10, x1: 10, y1: 10},
            FULL_SCENE,
        )).toThrow('avatar vide');
    });
});
