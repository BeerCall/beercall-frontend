import { describe, it, expect, afterEach, vi } from 'vitest';
import { isFeatureEnabled } from './featureFlags';

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('isFeatureEnabled', () => {
    it('active par défaut quand la variable est absente', () => {
        expect(isFeatureEnabled('glbAvatar')).toBe(true);
        expect(isFeatureEnabled('glbWorlds')).toBe(true);
    });

    it("désactive uniquement avec '0' ou 'false'", () => {
        vi.stubEnv('VITE_FF_GLB_AVATAR', '0');
        expect(isFeatureEnabled('glbAvatar')).toBe(false);

        vi.stubEnv('VITE_FF_GLB_AVATAR', 'false');
        expect(isFeatureEnabled('glbAvatar')).toBe(false);

        vi.stubEnv('VITE_FF_GLB_AVATAR', 'FALSE');
        expect(isFeatureEnabled('glbAvatar')).toBe(false);

        vi.stubEnv('VITE_FF_GLB_AVATAR', ' 0 ');
        expect(isFeatureEnabled('glbAvatar')).toBe(false);
    });

    it("active avec '1', 'true' ou toute autre valeur", () => {
        vi.stubEnv('VITE_FF_GLB_AVATAR', '1');
        expect(isFeatureEnabled('glbAvatar')).toBe(true);

        vi.stubEnv('VITE_FF_GLB_AVATAR', 'true');
        expect(isFeatureEnabled('glbAvatar')).toBe(true);

        vi.stubEnv('VITE_FF_GLB_AVATAR', 'yes');
        expect(isFeatureEnabled('glbAvatar')).toBe(true);
    });

    it('lit les deux flags indépendamment', () => {
        vi.stubEnv('VITE_FF_GLB_AVATAR', '0');
        vi.stubEnv('VITE_FF_GLB_WORLDS', '1');
        expect(isFeatureEnabled('glbAvatar')).toBe(false);
        expect(isFeatureEnabled('glbWorlds')).toBe(true);
    });
});
