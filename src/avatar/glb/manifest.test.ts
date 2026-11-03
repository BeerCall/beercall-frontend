import { describe, expect, it, beforeEach } from 'vitest';
import {
    GlbManifest,
    clearGlbManifest,
    resolveAvatarParts,
    setGlbManifest,
    validateManifest,
} from './manifest';

const dummyManifest: GlbManifest = {
    version: 1,
    pipelineVersion: 1,
    generatedAt: '2026-11-02T00:00:00.000Z',
    items: [
        {
            key: 'men/head/Men_head_Casual_0',
            url: '/models/glb/v1/pieces/Men/Men_head_Casual_0.hash1.glb',
            sha256: 'a'.repeat(64),
            bytes: 1000,
            drawCalls: 1,
            triangles: 100,
            joints: 10,
            textures: 0,
            source: 'Men_head_Casual_0.fbx',
            sourceId: 'Men_head_Casual_0',
            sourceSha256: 'b'.repeat(64),
            sourceBBox: { min: [-1, -1, -1], max: [1, 1, 1] },
            pipelineVersion: 1,
        },
        {
            key: 'men/body/Men_body_Casual_0',
            url: '/models/glb/v1/pieces/Men/Men_body_Casual_0.hash2.glb',
            sha256: 'a'.repeat(64),
            bytes: 1000,
            drawCalls: 1,
            triangles: 100,
            joints: 10,
            textures: 0,
            source: 'Men_body_Casual_0.fbx',
            sourceId: 'Men_body_Casual_0',
            sourceSha256: 'b'.repeat(64),
            sourceBBox: { min: [-1, -1, -1], max: [1, 1, 1] },
            pipelineVersion: 1,
        },
        {
            key: 'men/legs/Men_legs_Casual_0',
            url: '/models/glb/v1/pieces/Men/Men_legs_Casual_0.hash3.glb',
            sha256: 'a'.repeat(64),
            bytes: 1000,
            drawCalls: 1,
            triangles: 100,
            joints: 10,
            textures: 0,
            source: 'Men_legs_Casual_0.fbx',
            sourceId: 'Men_legs_Casual_0',
            sourceSha256: 'b'.repeat(64),
            sourceBBox: { min: [-1, -1, -1], max: [1, 1, 1] },
            pipelineVersion: 1,
        },
        {
            key: 'men/feet/Men_feet_Casual_0',
            url: '/models/glb/v1/pieces/Men/Men_feet_Casual_0.hash4.glb',
            sha256: 'a'.repeat(64),
            bytes: 1000,
            drawCalls: 1,
            triangles: 100,
            joints: 10,
            textures: 0,
            source: 'Men_feet_Casual_0.fbx',
            sourceId: 'Men_feet_Casual_0',
            sourceSha256: 'b'.repeat(64),
            sourceBBox: { min: [-1, -1, -1], max: [1, 1, 1] },
            pipelineVersion: 1,
        },
        {
            key: 'acc/men/Men_accessory_Backpack_0',
            url: '/models/glb/v1/accessories/Men/Men_accessory_Backpack_0.hash5.glb',
            sha256: 'a'.repeat(64),
            bytes: 1000,
            drawCalls: 1,
            triangles: 100,
            joints: 0,
            textures: 0,
            source: 'Men_accessory_Backpack_0.fbx',
            sourceId: 'Men_accessory_Backpack_0',
            sourceSha256: 'b'.repeat(64),
            sourceBBox: { min: [-1, -1, -1], max: [1, 1, 1] },
            pipelineVersion: 1,
        },
        {
            key: 'women/head/Women_head_Casual_0',
            url: '/models/glb/v1/pieces/Women/Women_head_Casual_0.hash6.glb',
            sha256: 'a'.repeat(64),
            bytes: 1000,
            drawCalls: 1,
            triangles: 100,
            joints: 10,
            textures: 0,
            source: 'Women_head_Casual_0.fbx',
            sourceId: 'Women_head_Casual_0',
            sourceSha256: 'b'.repeat(64),
            sourceBBox: { min: [-1, -1, -1], max: [1, 1, 1] },
            pipelineVersion: 1,
        },
        {
            key: 'women/body/Women_body_Casual_0',
            url: '/models/glb/v1/pieces/Women/Women_body_Casual_0.hash7.glb',
            sha256: 'a'.repeat(64),
            bytes: 1000,
            drawCalls: 1,
            triangles: 100,
            joints: 10,
            textures: 0,
            source: 'Women_body_Casual_0.fbx',
            sourceId: 'Women_body_Casual_0',
            sourceSha256: 'b'.repeat(64),
            sourceBBox: { min: [-1, -1, -1], max: [1, 1, 1] },
            pipelineVersion: 1,
        },
        {
            key: 'women/legs/Women_legs_Casual_0',
            url: '/models/glb/v1/pieces/Women/Women_legs_Casual_0.hash8.glb',
            sha256: 'a'.repeat(64),
            bytes: 1000,
            drawCalls: 1,
            triangles: 100,
            joints: 10,
            textures: 0,
            source: 'Women_legs_Casual_0.fbx',
            sourceId: 'Women_legs_Casual_0',
            sourceSha256: 'b'.repeat(64),
            sourceBBox: { min: [-1, -1, -1], max: [1, 1, 1] },
            pipelineVersion: 1,
        },
        {
            key: 'women/feet/Women_feet_Casual_0',
            url: '/models/glb/v1/pieces/Women/Women_feet_Casual_0.hash9.glb',
            sha256: 'a'.repeat(64),
            bytes: 1000,
            drawCalls: 1,
            triangles: 100,
            joints: 10,
            textures: 0,
            source: 'Women_feet_Casual_0.fbx',
            sourceId: 'Women_feet_Casual_0',
            sourceSha256: 'b'.repeat(64),
            sourceBBox: { min: [-1, -1, -1], max: [1, 1, 1] },
            pipelineVersion: 1,
        },
    ],
};

describe('A13 — Manifeste GLB et résolution des pièces', () => {
    beforeEach(() => {
        clearGlbManifest();
        setGlbManifest(dummyManifest);
    });

    it('valide que seules les URLs sous /models/glb/v1/ sont acceptées', () => {
        const invalidManifest = {
            version: 1,
            pipelineVersion: 1,
            generatedAt: '2026-11-02',
            items: [
                {
                    key: 'bad',
                    url: 'http://malicious.com/bad.glb',
                    sourceId: 'bad',
                } as unknown as GlbManifest['items'][number],
            ],
        };
        expect(() => validateManifest(invalidManifest)).toThrow(/URL GLB non autorisée/);
    });

    it('résout fidèlement une configuration Men avec accessoire', () => {
        const parts = resolveAvatarParts({
            head: 'Men_head_Casual_0',
            body: 'Men_body_Casual_0',
            legs: 'Men_legs_Casual_0',
            feet: 'Men_feet_Casual_0',
            accessory: 'Men_accessory_Backpack_0',
            gender: 'Men',
        });

        expect(parts.gender).toBe('Men');
        expect(parts.head.sourceId).toBe('Men_head_Casual_0');
        expect(parts.accessory?.sourceId).toBe('Men_accessory_Backpack_0');
        expect(parts.accessory?.url).toContain('/models/glb/v1/accessories/Men/');
    });

    it('résout une configuration sans accessoire (none, null ou absent)', () => {
        for (const acc of [undefined, null, 'none', 'NONE', '']) {
            const parts = resolveAvatarParts({
                head: 'Women_head_Casual_0',
                body: 'Women_body_Casual_0',
                legs: 'Women_legs_Casual_0',
                feet: 'Women_feet_Casual_0',
                accessory: acc,
            });
            expect(parts.gender).toBe('Women');
            expect(parts.accessory).toBeNull();
        }
    });

    it('déduit le genre automatiquement lorsque non spécifié (SignUp)', () => {
        const parts = resolveAvatarParts({
            head: 'Women_head_Casual_0',
            body: 'Women_body_Casual_0',
            legs: 'Women_legs_Casual_0',
            feet: 'Women_feet_Casual_0',
        });
        expect(parts.gender).toBe('Women');
    });

    it('lève une erreur visible sur une pièce inconnue sans fallback silencieux', () => {
        expect(() =>
            resolveAvatarParts({
                head: 'Unknown_head_Piece',
                body: 'Men_body_Casual_0',
                legs: 'Men_legs_Casual_0',
                feet: 'Men_feet_Casual_0',
            })
        ).toThrow(/Pièce inconnue dans le catalogue/);
    });

    it('lève une erreur visible si le genre entre les pièces est incohérent', () => {
        expect(() =>
            resolveAvatarParts({
                head: 'Men_head_Casual_0',
                body: 'Women_body_Casual_0',
                legs: 'Men_legs_Casual_0',
                feet: 'Men_feet_Casual_0',
            })
        ).toThrow(/Genre incohérent/);
    });
});
