import { describe, expect, it } from 'vitest';
import {
    AVATAR_DRAG_THRESHOLD_PX,
    AVATAR_HIT_HEIGHT,
    AVATAR_HIT_RADIUS,
    AVATAR_HIT_SEGMENTS,
    shouldOpenAvatarProfile,
} from '../worlds/avatarHitTarget';

describe('zone de toucher des avatars (8i)', () => {
    it('couvre le corps avec un cylindre simple et borné', () => {
        expect(AVATAR_HIT_RADIUS).toBeGreaterThan(0);
        expect(AVATAR_HIT_HEIGHT).toBeGreaterThanOrEqual(1.9);
        expect(AVATAR_HIT_SEGMENTS).toBe(8);
    });

    it('ouvre le profil au toucher et refuse un glissement de caméra', () => {
        expect(shouldOpenAvatarProfile(0)).toBe(true);
        expect(shouldOpenAvatarProfile(AVATAR_DRAG_THRESHOLD_PX)).toBe(true);
        expect(shouldOpenAvatarProfile(AVATAR_DRAG_THRESHOLD_PX + 0.1)).toBe(false);
        expect(shouldOpenAvatarProfile(40)).toBe(false);
    });

    it('refuse une distance invalide au lieu de l’interpréter comme un toucher', () => {
        expect(shouldOpenAvatarProfile(-1)).toBe(false);
        expect(shouldOpenAvatarProfile(Number.NaN)).toBe(false);
    });
});
