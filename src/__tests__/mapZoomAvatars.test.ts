import { describe, expect, it } from 'vitest';

import {
    AVATAR_VISIBLE_PX,
    AVATAR_ZOOM,
    BODY_ICON_SIZE,
    BODY_SPRITE,
    BODY_VISIBLE_RATIO,
    avatarFramePx,
    avatarIconSizeAtZoom,
    avatarIconSizeExpression,
    avatarVisiblePx,
} from '../map/snap/mapScenario';

describe('taille des avatars carte selon le zoom', () => {
    it('passe par 56 px à zoom 10, 87,5 px à zoom 14 et 140 px à zoom 18', () => {
        expect(avatarVisiblePx(10)).toBeCloseTo(56, 6);
        expect(avatarVisiblePx(14)).toBeCloseTo(87.5, 6);
        expect(avatarVisiblePx(18)).toBeCloseTo(140, 6);
        expect(avatarVisiblePx(8)).toBe(56);
        expect(avatarVisiblePx(20)).toBe(140);
    });

    it('est strictement croissante entre les bornes de zoom', () => {
        let previous = avatarVisiblePx(AVATAR_ZOOM.min);
        for (let zoom = AVATAR_ZOOM.min + 1; zoom <= AVATAR_ZOOM.max; zoom += 1) {
            const current = avatarVisiblePx(zoom);
            expect(current).toBeGreaterThan(previous);
            previous = current;
        }
    });

    it('conserve le cadre 100 px et le facteur MapLibre de 7b-3d à zoom 14', () => {
        expect(avatarFramePx(14)).toBeCloseTo(100, 6);
        expect(avatarIconSizeAtZoom(14)).toBeCloseTo(BODY_ICON_SIZE, 10);
        expect(avatarFramePx(10)).toBeCloseTo(64, 6);
        expect(avatarFramePx(18)).toBeCloseTo(160, 6);
    });

    it('expose une expression MapLibre à arrêts de zoom, sans bitmap par frame', () => {
        const expression = avatarIconSizeExpression() as unknown[];
        expect(expression[0]).toBe('interpolate');
        expect(expression[1]).toEqual(['linear']);
        expect(expression[2]).toEqual(['zoom']);
        expect(expression[3]).toBe(AVATAR_ZOOM.min);
        expect(expression[expression.length - 2]).toBe(AVATAR_ZOOM.max);
        expect((expression[expression.length - 1] as number)).toBeCloseTo(avatarIconSizeAtZoom(18), 10);
    });

    it('documente la résolution au maximum : 128×256, corps 224 px source', () => {
        const sourceBodyPx = BODY_SPRITE.height * BODY_VISIBLE_RATIO;
        const maxDevicePx = AVATAR_VISIBLE_PX.max * 2; // DPR 2
        expect(sourceBodyPx).toBeCloseTo(224, 6);
        expect(sourceBodyPx / maxDevicePx).toBeCloseTo(0.8, 6);
    });
});
