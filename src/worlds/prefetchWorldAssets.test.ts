import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Group } from 'three';

import { clearGlbCache } from '../avatar/glb/loadGlb';
import { clearGlbManifest, type GlbManifest } from '../avatar/glb/manifest';
import { resetWebglStats, webglStats } from '../three/lease/webgl';
import { prefetchWorldAssets } from './prefetchWorldAssets';

const manifestFixture = {
    version: 1,
    pipelineVersion: 1,
    generatedAt: '2026-11-02T00:00:00.000Z',
    items: [
        { key: 'decor/bar', url: '/models/glb/v1/decors/_/Bar.hash.glb', sourceId: 'Bar' },
        { key: 'men/head/Men_head_Casual_0', url: '/models/glb/v1/pieces/Men/Men_head_Casual_0.glb', sourceId: 'Men_head_Casual_0' },
        { key: 'men/body/Men_body_Casual_0', url: '/models/glb/v1/pieces/Men/Men_body_Casual_0.glb', sourceId: 'Men_body_Casual_0' },
        { key: 'men/legs/Men_legs_Casual_0', url: '/models/glb/v1/pieces/Men/Men_legs_Casual_0.glb', sourceId: 'Men_legs_Casual_0' },
        { key: 'men/feet/Men_feet_Casual_0', url: '/models/glb/v1/pieces/Men/Men_feet_Casual_0.glb', sourceId: 'Men_feet_Casual_0' },
    ],
} as unknown as GlbManifest;

const loadedUrls: string[] = [];
vi.mock('../avatar/glb/loadGlb', () => ({
    loadGlb: vi.fn().mockImplementation(async (url: string) => {
        loadedUrls.push(url);
        return { scene: new Group() };
    }),
    clearGlbCache: vi.fn(),
}));

describe('B14 — prefetchWorldAssets', () => {
    beforeEach(() => {
        clearGlbCache();
        clearGlbManifest();
        resetWebglStats();
        loadedUrls.length = 0;
        vi.restoreAllMocks();
    });

    it('déduplique les URLs et précharge le décor et les participants sans créer de WebGL', async () => {
        const participantA = {
            gender: 'Men',
            head: 'Men_head_Casual_0',
            body: 'Men_body_Casual_0',
            legs: 'Men_legs_Casual_0',
            feet: 'Men_feet_Casual_0',
        };
        // Participant B avec exactement la même tenue
        const participantB = { ...participantA };

        const result = await prefetchWorldAssets({
            world: 'bar',
            participants: [participantA, participantB],
            manifest: manifestFixture,
        });

        // 1 décor + 4 pièces uniques (dédupliquées entre A et B) = 5 URLs
        expect(result.urls.length).toBe(5);
        expect(result.prefetchedCount).toBe(5);

        // Zéro création de contexte WebGL
        expect(webglStats().created).toBe(0);
        expect(webglStats().active).toBe(0);

        // Contient bien le décor du bar et les pièces de la tenue
        expect(result.urls).toContain('/models/glb/v1/decors/_/Bar.hash.glb');
        expect(result.urls).toContain('/models/glb/v1/pieces/Men/Men_head_Casual_0.glb');
    });
});
