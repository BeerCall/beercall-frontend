import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    AnimationClip,
    Bone,
    BoxGeometry,
    Float32BufferAttribute,
    Group,
    Mesh,
    MeshBasicMaterial,
    Skeleton,
    SkinnedMesh,
    Uint16BufferAttribute,
    Vector3,
    VectorKeyframeTrack,
} from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';

import { clearGlbCache, loadGlb } from '../glb/loadGlb';
import { clearGlbManifest, setGlbManifest } from '../glb/manifest';
import { composePerson } from './composePerson';

function createDummyGltf(name: string, isSkinned: boolean = true): GLTF {
    const scene = new Group();
    scene.name = name;

    if (isSkinned) {
        const rootBone = new Bone();
        rootBone.name = `${name}_Bone`;
        const wristR = new Bone();
        wristR.name = 'WristR';
        wristR.position.set(4, 5, 6);
        rootBone.add(wristR);
        const skeleton = new Skeleton([rootBone]);

        const geometry = new BoxGeometry(10, 10, 10);
        const count = geometry.attributes.position.count;
        const skinIndices = new Uint16Array(count * 4);
        const skinWeights = new Float32Array(count * 4);
        for (let i = 0; i < count; i += 1) {
            skinWeights[i * 4] = 1.0;
        }
        geometry.setAttribute('skinIndex', new Uint16BufferAttribute(skinIndices, 4));
        geometry.setAttribute('skinWeight', new Float32BufferAttribute(skinWeights, 4));

        const material = new MeshBasicMaterial();
        const skinnedMesh = new SkinnedMesh(geometry, material);
        skinnedMesh.bind(skeleton);

        scene.add(rootBone);
        scene.add(skinnedMesh);
    } else {
        const geometry = new BoxGeometry(5, 5, 5);
        const material = new MeshBasicMaterial();
        const staticMesh = new Mesh(geometry, material);
        scene.add(staticMesh);
    }

    return {
        scene,
        scenes: [scene],
        animations: [],
        cameras: [],
        asset: {},
        userData: {},
    } as unknown as GLTF;
}

const manifestFixture = {
    version: 1,
    pipelineVersion: 1,
    generatedAt: '2026-11-02T00:00:00.000Z',
    items: [
        {
            key: 'men/head/Men_head_Casual_0',
            url: '/models/glb/v1/pieces/Men/Men_head_Casual_0.glb',
            sourceId: 'Men_head_Casual_0',
        },
        {
            key: 'men/body/Men_body_Casual_0',
            url: '/models/glb/v1/pieces/Men/Men_body_Casual_0.glb',
            sourceId: 'Men_body_Casual_0',
        },
        {
            key: 'men/legs/Men_legs_Casual_0',
            url: '/models/glb/v1/pieces/Men/Men_legs_Casual_0.glb',
            sourceId: 'Men_legs_Casual_0',
        },
        {
            key: 'men/feet/Men_feet_Casual_0',
            url: '/models/glb/v1/pieces/Men/Men_feet_Casual_0.glb',
            sourceId: 'Men_feet_Casual_0',
        },
        {
            key: 'acc/men/Men_accessory_Beer_500',
            url: '/models/glb/v1/accessories/Men/Men_accessory_Beer_500.glb',
            sourceId: 'Men_accessory_Beer_500',
            transform: { position: [75, 150, 0], rotation: [0, 0, 0], scale: 100, bone: null },
        },
    ],
} as unknown as Parameters<typeof setGlbManifest>[0];

describe('A13 — composePerson et loadGlb (composition GLB partagée)', () => {
    beforeEach(() => {
        clearGlbCache();
        clearGlbManifest();
        setGlbManifest(manifestFixture);
        vi.restoreAllMocks();
    });

    it('déduplique les requêtes concurrentes vers la même URL et permet le rejeu sur échec', async () => {
        let fetchCount = 0;
        let shouldFail = true;

        const fakeFetch = vi.fn().mockImplementation(async () => {
            fetchCount += 1;
            if (shouldFail) {
                return { ok: false, status: 500 };
            }
            return {
                ok: true,
                status: 200,
                arrayBuffer: async () => new ArrayBuffer(8),
            };
        });
        vi.stubGlobal('fetch', fakeFetch);

        const dummy = createDummyGltf('test');
        vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockResolvedValue(dummy);

        // 1. Appel en échec
        await expect(loadGlb('/models/glb/v1/fail.glb')).rejects.toThrow(/HTTP 500/);

        // 2. Rejeu possible après échec (la promesse rejetée a bien été retirée)
        shouldFail = false;
        const [p1, p2] = await Promise.all([
            loadGlb('/models/glb/v1/fail.glb'),
            loadGlb('/models/glb/v1/fail.glb'),
        ]);

        expect(p1).toBe(p2);
        // fetch appelé une fois pour l'échec + une seule fois dédupliquée pour le succès = 2
        expect(fetchCount).toBe(2);
    });

    it('compose un avatar complet avec ses annotations et des mixers indépendants', async () => {
        vi.stubGlobal('fetch', async () => ({
            ok: true,
            status: 200,
            arrayBuffer: async () => new ArrayBuffer(8),
        }));

        vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementation(async () => {
            return createDummyGltf('mock_part', true);
        });

        const track = new VectorKeyframeTrack('Casual_Body.position', [0, 1], [0, 0, 0, 0, 1, 0]);
        const clip = new AnimationClip('Idle', 1.0, [track]);

        const composed = await composePerson({
            config: {
                head: 'Men_head_Casual_0',
                body: 'Men_body_Casual_0',
                legs: 'Men_legs_Casual_0',
                feet: 'Men_feet_Casual_0',
                accessory: 'Men_accessory_Beer_500',
            },
            clip,
        });

        // 1. Hiérarchie et annotations
        expect(composed.group.name).toBe('avatar:Men');
        expect(composed.parts.head.userData.partKey).toBe('head');
        expect(composed.parts.body.userData.partKey).toBe('body');
        expect(composed.parts.legs.userData.partKey).toBe('legs');
        expect(composed.parts.feet.userData.partKey).toBe('feet');
        expect(composed.parts.accessory?.userData.partKey).toBe('accessory');

        // 2. Mixers créés pour les pièces skinnées
        expect(composed.mixers.length).toBeGreaterThanOrEqual(4);

        // 3. Transform de l'accessoire appliqué à sa racine sœur en radians
        expect(composed.parts.accessory?.position.x).toBe(75);
        expect(composed.parts.accessory?.position.y).toBe(150);
        expect(composed.parts.accessory?.scale.x).toBe(100);

        // 4. bodyBounds et fullBounds calculés et finis
        expect(Number.isFinite(composed.bodyBounds.min.x)).toBe(true);
        expect(Number.isFinite(composed.fullBounds.min.x)).toBe(true);

        // 5. stop et dispose n'altèrent pas le cache
        composed.stop();
        composed.dispose();
        expect(composed.group.children.length).toBe(0);
    });

    it('attache un accessoire à os sur le bone du sprite, à sa position d’attache', async () => {
        vi.stubGlobal('fetch', async () => ({
            ok: true,
            status: 200,
            arrayBuffer: async () => new ArrayBuffer(8),
        }));

        vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementation(async () => {
            return createDummyGltf('mock_part', true);
        });

        const withBone = {
            ...manifestFixture,
            items: manifestFixture.items.map((item) => (
                item.sourceId === 'Men_accessory_Beer_500'
                    ? {
                        ...item,
                        transform: {
                            position: [0, 0, 0],
                            rotation: [0, 0, 0],
                            scale: 100,
                            bone: 'WristR',
                        },
                    }
                    : item
            )),
        } as typeof manifestFixture;
        setGlbManifest(withBone);

        const composed = await composePerson({
            config: {
                head: 'Men_head_Casual_0',
                body: 'Men_body_Casual_0',
                legs: 'Men_legs_Casual_0',
                feet: 'Men_feet_Casual_0',
                accessory: 'Men_accessory_Beer_500',
            },
            clip: new AnimationClip('Idle', 1, []),
        });

        const wrist = composed.parts.body.getObjectByName('WristR');
        expect(wrist).toBeTruthy();
        expect(composed.parts.accessory?.parent).toBe(wrist);

        const wristPosition = wrist!.getWorldPosition(new Vector3());
        const accessoryPosition = composed.parts.accessory!.getWorldPosition(new Vector3());
        expect(accessoryPosition.distanceTo(wristPosition)).toBeCloseTo(0, 5);

        composed.dispose();
    });

    it('garantit que deux avatars assemblés ont des squelettes et des mixers strictement indépendants', async () => {
        vi.stubGlobal('fetch', async () => ({
            ok: true,
            status: 200,
            arrayBuffer: async () => new ArrayBuffer(8),
        }));

        vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementation(async () => {
            return createDummyGltf('shared_part', true);
        });

        const a1 = await composePerson({
            config: {
                head: 'Men_head_Casual_0',
                body: 'Men_body_Casual_0',
                legs: 'Men_legs_Casual_0',
                feet: 'Men_feet_Casual_0',
            },
        });

        const a2 = await composePerson({
            config: {
                head: 'Men_head_Casual_0',
                body: 'Men_body_Casual_0',
                legs: 'Men_legs_Casual_0',
                feet: 'Men_feet_Casual_0',
            },
        });

        // Les groupes racines sont des instances distinctes
        expect(a1.group).not.toBe(a2.group);
        expect(a1.parts.head).not.toBe(a2.parts.head);

        // Les mixers ciblent des racines différentes
        expect(a1.mixers[0].getRoot()).not.toBe(a2.mixers[0].getRoot());

        a1.dispose();
        a2.dispose();
    });
});
