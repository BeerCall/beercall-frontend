import { describe, expect, it } from 'vitest';
import type { GlbManifest, GlbManifestItem } from '../avatar/glb/manifest';
import {
    buildWorldPreloadPlan,
    selectWorldPreloadItems,
    toMegabytes,
    WORLD_PRELOAD_AVATAR_SLOTS,
    WORLD_PRELOAD_DECOR_KEYS,
} from '../lib/worldPreload';

function item(key: string, bytes: number): GlbManifestItem {
    return {
        key,
        url: `/models/glb/v1/${key}.glb`,
        sha256: 'sha',
        bytes,
        drawCalls: 1,
        triangles: 1,
        joints: 0,
        textures: 0,
        source: `${key}.fbx`,
        sourceId: key,
        sourceSha256: 'sha',
        sourceBBox: null,
        pipelineVersion: 1,
    };
}

function manifest(items: GlbManifestItem[]): GlbManifest {
    return {version: 1, pipelineVersion: 1, generatedAt: '2026-11-05T00:00:00.000Z', items};
}

describe('sélection du préchargement des mondes (8h-3)', () => {
    it('prépare les 3 décors avant les pièces head/body/legs/feet des deux genres', () => {
        const items = [
            item('men/head/Men_head_Casual_0', 10),
            item('acc/men/Men_accessory_Beer_500', 99),
            item('women/body/Women_body_Suit_300', 20),
            item('decor/dodo', 3),
            item('men/legs/Men_legs_Casual_0', 30),
            item('decor/bar', 1),
            item('women/feet/Women_feet_Suit_100', 40),
            item('decor/piscine', 2),
            item('men/feet/Men_feet_Casual_0', 50),
            item('women/head/Women_head_Suit_150', 60),
            item('women/legs/Women_legs_Suit_200', 70),
            item('men/body/Men_body_Casual_0', 80),
        ];
        const selected = selectWorldPreloadItems(manifest(items));
        expect(selected.slice(0, 3).map(entry => entry.key)).toEqual([...WORLD_PRELOAD_DECOR_KEYS]);
        expect(selected.map(entry => entry.key)).not.toContain('acc/men/Men_accessory_Beer_500');
        expect(selected).toHaveLength(3 + 2 * WORLD_PRELOAD_AVATAR_SLOTS.length);
        expect(selected.every(entry => entry.url.includes('/models/glb/v1/'))).toBe(true);
        expect(selected.every(entry => !entry.url.endsWith('.fbx'))).toBe(true);
    });

    it('refuse un décor manquant au lieu de préparer un monde incomplet', () => {
        expect(() => selectWorldPreloadItems(manifest([item('decor/bar', 1)])))
            .toThrow(/Décor GLB introuvable.*decor\/piscine/);
    });

    it('calcule le poids total en Mo et le détail décors / avatars', () => {
        const plan = buildWorldPreloadPlan(manifest([
            item('decor/bar', 271_660),
            item('decor/piscine', 69_680),
            item('decor/dodo', 118_336),
            item('men/head/Men_head_Casual_0', 1_000_000),
            item('women/feet/Women_feet_Suit_100', 2_000_000),
        ]));
        expect(plan.decorCount).toBe(3);
        expect(plan.avatarCount).toBe(2);
        expect(plan.bytes).toBe(3_459_676);
        expect(toMegabytes(plan.bytes)).toBe(3.46);
    });
});
