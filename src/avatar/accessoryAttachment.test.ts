import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import {
    attachAccessory,
    normalizeAccessoryTransform,
} from './accessoryAttachment';

const manifest = JSON.parse(
    readFileSync(resolve(process.cwd(), '../beercall-backend/static/models/glb/manifest.json'), 'utf8'),
) as { items: Array<{ key: string; sourceId: string }> };
const accessories = manifest.items.filter((item) => item.key.startsWith('acc/'));

function bodyWithBone(name: string): { root: Object3D; body: Object3D; bone: Object3D } {
    const root = new Object3D();
    const body = new Object3D();
    const bone = new Object3D();
    bone.name = name;
    bone.position.set(0, 1, 0);
    body.add(bone);
    root.add(body);
    root.updateMatrixWorld(true);
    return { root, body, bone };
}

describe('accessoryAttachment', () => {
    it('utilise le transform manifeste en convertissant les degrés en radians', () => {
        const normalized = normalizeAccessoryTransform('Men_accessory_X_500', {
            position: [1, 2, 3],
            rotation: [90, -45, 180],
            scale: 0.5,
            bone: null,
        });

        expect(normalized.position).toEqual([1, 2, 3]);
        expect(normalized.rotation[0]).toBeCloseTo(Math.PI / 2);
        expect(normalized.rotation[1]).toBeCloseTo(-Math.PI / 4);
        expect(normalized.rotation[2]).toBeCloseTo(Math.PI);
        expect(normalized.scale).toEqual([0.5, 0.5, 0.5]);
    });

    it('applique l’identité sans transform manifeste', () => {
        expect(normalizeAccessoryTransform('Men_accessory_Unchanged_0', null)).toEqual({
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            bone: null,
        });
    });

    it('tous les accessoires du manifeste restent résolus', () => {
        expect(accessories.length).toBeGreaterThan(0);
        for (const { sourceId, transform } of accessories as Array<{
            sourceId: string;
            transform?: unknown;
        }>) {
            const normalized = normalizeAccessoryTransform(sourceId, transform as never);
            expect(Number.isFinite(normalized.scale[0])).toBe(true);
        }
    });

    it('donne la même position monde normalisée en 3D et dans le sprite', () => {
        const transform = {
            position: [2, 3, 4] as [number, number, number],
            rotation: [0, 0, 0] as [number, number, number],
            scale: 100,
            bone: 'WristR',
        };

        const three = bodyWithBone('WristR');
        three.root.scale.setScalar(0.01);
        const threeAcc = new Object3D();
        attachAccessory({
            accessoryId: 'Men_accessory_X_500',
            instance: threeAcc,
            body: three.body,
            root: three.root,
            manifestTransform: transform,
        });

        const sprite = bodyWithBone('WristR');
        sprite.root.scale.setScalar(1);
        const spriteAcc = new Object3D();
        attachAccessory({
            accessoryId: 'Men_accessory_X_500',
            instance: spriteAcc,
            body: sprite.body,
            root: sprite.root,
            manifestTransform: transform,
        });

        const threeWorld = threeAcc.getWorldPosition(new Vector3()).divideScalar(0.01);
        const spriteWorld = spriteAcc.getWorldPosition(new Vector3()).divideScalar(1);
        expect(threeWorld.x).toBeCloseTo(spriteWorld.x);
        expect(threeWorld.y).toBeCloseTo(spriteWorld.y);
        expect(threeWorld.z).toBeCloseTo(spriteWorld.z);
        expect(threeAcc.getWorldScale(new Vector3()).x).toBeCloseTo(100);
        expect(spriteAcc.getWorldScale(new Vector3()).x).toBeCloseTo(100);
    });

    it('replie WristR sur HandR quand WristR manque', () => {
        const { root, body, bone } = bodyWithBone('HandR');
        const instance = new Object3D();
        attachAccessory({
            accessoryId: 'Men_accessory_Beer_500',
            instance,
            body,
            root,
            manifestTransform: {
                position: [0, 0, 0],
                rotation: [0, 0, 0],
                scale: 100,
                bone: 'WristR',
            },
        });
        expect(instance.parent).toBe(bone);
    });
});
