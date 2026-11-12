import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';
import {
    AvatarPieceNotFoundError,
    GlbManifest,
    clearGlbManifest,
    resolveAvatarParts,
    setGlbManifest,
    sourceKey,
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

    it('calcule une clé sans le prix', () => {
        expect(sourceKey('Men_accessory_Beer_500')).toBe('Men_accessory_Beer');
        expect(sourceKey('Men_accessory_Beer_800.fbx')).toBe('Men_accessory_Beer');
        expect(sourceKey('Men_accessory_Beer_bWristR_s100_500.fbx')).toBe('Men_accessory_Beer');
        expect(sourceKey('Men_accessory_McLaren_px68_py15_pz-30_s0d3_5000.fbx')).toBe('Men_accessory_McLaren');
        expect(sourceKey('Men_body_Casual2_0')).toBe('Men_body_Casual2');
        expect(sourceKey('Bar.fbx')).toBeNull();
    });

    it('résout par la clé quand le fichier a changé de prix', () => {
        const beer = structuredClone(dummyManifest.items[4]);
        beer.key = 'acc/men/Men_accessory_Beer_800';
        beer.sourceId = 'Men_accessory_Beer_800';
        beer.source = 'Men_accessory_Beer_800.fbx';
        beer.url = '/models/glb/v1/accessories/Men/Men_accessory_Beer_800.hash5.glb';
        setGlbManifest({...dummyManifest, items: [...dummyManifest.items, beer]});

        const parts = resolveAvatarParts({
            head: 'Men_head_Casual_0',
            body: 'Men_body_Casual_0',
            legs: 'Men_legs_Casual_0',
            feet: 'Men_feet_Casual_0',
            accessory: 'Men_accessory_Beer_500',
            gender: 'Men',
        });

        expect(parts.accessory?.sourceId).toBe('Men_accessory_Beer_800');
        expect(parts.accessory?.url).toContain('Men_accessory_Beer_800');
    });

    it('résout les 70 anciens ids d’accessoires vers les nouveaux sourceId tokenisés', () => {
        const published = JSON.parse(
            readFileSync(
                resolve(process.cwd(), '../beercall-backend/static/models/glb/manifest.json'),
                'utf8',
            ),
        ) as GlbManifest;

        const pieceFor = (gender: string, slot: string) => {
            const item = published.items.find(
                (candidate) => candidate.sourceId.startsWith(`${gender}_${slot}_`),
            );
            if (!item) throw new Error(`Pièce ${gender}_${slot} absente du manifeste publié`);
            return item.sourceId;
        };

        let checked = 0;
        for (const item of published.items) {
            if (!item.key.startsWith('acc/')) continue;
            const parts = item.sourceId.split('_');
            const oldId = `${parts[0]}_${parts[1]}_${parts[2]}_${parts[parts.length - 1]}`;
            if (oldId === item.sourceId) continue;

            const resolved = resolveAvatarParts(
                {
                    head: pieceFor(parts[0], 'head'),
                    body: pieceFor(parts[0], 'body'),
                    legs: pieceFor(parts[0], 'legs'),
                    feet: pieceFor(parts[0], 'feet'),
                    accessory: oldId,
                    gender: parts[0] as 'Men' | 'Women',
                },
                published,
            );

            expect(resolved.accessory?.sourceId).toBe(item.sourceId);
            if (oldId === 'Men_accessory_Beer_500') {
                expect(resolved.accessory?.sourceId).toBe('Men_accessory_Beer_bWristR_s100_500');
            }
            checked += 1;
        }

        expect(checked).toBe(70);
    });

    it('expose l’identifiant de la pièce introuvable dans l’erreur', () => {
        try {
            resolveAvatarParts({
                head: 'Men_head_Casual_0',
                body: 'Men_body_Casual_0',
                legs: 'Men_legs_Casual_0',
                feet: 'Men_feet_Casual_0',
                accessory: 'Men_accessory_Fantome_500',
                gender: 'Men',
            });
            throw new Error('La résolution aurait dû échouer');
        } catch (error) {
            expect(error).toBeInstanceOf(AvatarPieceNotFoundError);
            expect((error as AvatarPieceNotFoundError).pieceId).toBe('Men_accessory_Fantome_500');
            expect((error as AvatarPieceNotFoundError).slot).toBe('accessory');
        }
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
