import {describe, expect, it} from 'vitest';
import {Box3, PerspectiveCamera, Vector3} from 'three';
import {computeAvatarFraming, FRAMING_MARGIN, type AvatarFramingReady} from '../lib/avatarFraming';

function cornersOf(box: Box3): Vector3[] {
    const corners: Vector3[] = [];
    for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
            for (const z of [box.min.z, box.max.z]) {
                corners.push(new Vector3(x, y, z));
            }
        }
    }
    return corners;
}

/**
 * Vérification indépendante de la formule du helper : une vraie caméra perspective
 * projette les huit coins, et non une réimplémentation des mêmes équations.
 */
function projectWithCamera(
    framing: AvatarFramingReady,
    box: Box3,
    width: number,
    height: number,
    fov: number,
) {
    const camera = new PerspectiveCamera(fov, width / height, framing.near, framing.far);
    camera.position.set(...framing.position);
    camera.lookAt(new Vector3(...framing.center));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    const centerNdc = new Vector3(...framing.center).project(camera);
    const corners = cornersOf(box).map(corner => corner.clone().project(camera));
    return {camera, centerNdc, corners};
}

function expectFramed(framing: AvatarFramingReady, box: Box3, width: number, height: number, fov: number) {
    const {centerNdc, corners} = projectWithCamera(framing, box, width, height, fov);

    expect(Math.abs(centerNdc.x)).toBeLessThan(2 / width);
    expect(Math.abs(centerNdc.y)).toBeLessThan(2 / height);

    for (const ndc of corners) {
        expect(Number.isFinite(ndc.x)).toBe(true);
        expect(Number.isFinite(ndc.y)).toBe(true);
        expect(Math.abs(ndc.x)).toBeLessThanOrEqual(FRAMING_MARGIN + 1e-6);
        expect(Math.abs(ndc.y)).toBeLessThanOrEqual(FRAMING_MARGIN + 1e-6);
        expect(ndc.z).toBeGreaterThan(-1);
        expect(ndc.z).toBeLessThan(1);
    }
}

describe('computeAvatarFraming', () => {
    const tallHumanoid = new Box3(new Vector3(-30, -10, -20), new Vector3(30, 260, 20));
    const wideKart = new Box3(new Vector3(-150, -20, -30), new Vector3(150, 180, 30));
    const deepAccessory = new Box3(new Vector3(-40, -10, -200), new Vector3(40, 220, 60));

    it('cadre un humanoïde haut dans un cadre 128x160', () => {
        const framing = computeAvatarFraming({box: tallHumanoid, width: 128, height: 160, fov: 45});
        expect(framing.ok).toBe(true);
        if (!framing.ok) return;
        expect(framing.distance).toBeGreaterThan(0);
        expect(framing.near).toBeGreaterThan(0);
        expect(framing.far).toBeGreaterThan(framing.near);
        expectFramed(framing, tallHumanoid, 128, 160, 45);
    });

    it('cadre un accessoire large et décalé sans le couper', () => {
        const framing = computeAvatarFraming({box: wideKart, width: 128, height: 160, fov: 45});
        expect(framing.ok).toBe(true);
        if (!framing.ok) return;
        expectFramed(framing, wideKart, 128, 160, 45);
    });

    it('cadre une boîte profonde et reste devant le coin le plus proche', () => {
        const framing = computeAvatarFraming({box: deepAccessory, width: 128, height: 160, fov: 45});
        expect(framing.ok).toBe(true);
        if (!framing.ok) return;
        const nearestDepth = framing.distance + deepAccessory.min.z - framing.center[2];
        expect(nearestDepth).toBeGreaterThan(0);
        expect(framing.near).toBeLessThan(nearestDepth);
        expectFramed(framing, deepAccessory, 128, 160, 45);
    });

    it('respecte un second aspect 96x128', () => {
        const framing = computeAvatarFraming({box: tallHumanoid, width: 96, height: 128, fov: 45});
        expect(framing.ok).toBe(true);
        if (!framing.ok) return;
        expectFramed(framing, tallHumanoid, 96, 128, 45);
    });

    it('éloigne la caméra quand le cadre devient plus étroit', () => {
        const wide = computeAvatarFraming({box: wideKart, width: 200, height: 160, fov: 45});
        const narrow = computeAvatarFraming({box: wideKart, width: 96, height: 160, fov: 45});
        expect(wide.ok && narrow.ok).toBe(true);
        if (!wide.ok || !narrow.ok) return;
        expect(narrow.distance).toBeGreaterThan(wide.distance);
    });

    it('refuse les entrées invalides sans NaN', () => {
        const empty = new Box3();
        expect(computeAvatarFraming({box: empty, width: 128, height: 160, fov: 45}))
            .toEqual({ok: false, reason: 'empty-box'});
        expect(computeAvatarFraming({box: tallHumanoid, width: 0, height: 160, fov: 45}))
            .toEqual({ok: false, reason: 'invalid-size'});
        expect(computeAvatarFraming({box: tallHumanoid, width: 128, height: Number.NaN, fov: 45}))
            .toEqual({ok: false, reason: 'invalid-size'});
        expect(computeAvatarFraming({box: tallHumanoid, width: 128, height: 160, fov: 0}))
            .toEqual({ok: false, reason: 'invalid-fov'});
        expect(computeAvatarFraming({box: tallHumanoid, width: 128, height: 160, fov: 180}))
            .toEqual({ok: false, reason: 'invalid-fov'});
        const nonFinite = new Box3(new Vector3(-10, -10, -10), new Vector3(10, Number.POSITIVE_INFINITY, 10));
        expect(computeAvatarFraming({box: nonFinite, width: 128, height: 160, fov: 45}))
            .toEqual({ok: false, reason: 'non-finite-box'});
    });

    it('ne mute pas la boîte reçue', () => {
        const box = tallHumanoid.clone();
        const before = box.clone();
        computeAvatarFraming({box, width: 128, height: 160, fov: 45});
        expect(box.min.equals(before.min)).toBe(true);
        expect(box.max.equals(before.max)).toBe(true);
    });

    it('contrôle négatif : la caméra historique ne contient pas une boîte haute/large', () => {
        const camera = new PerspectiveCamera(45, 128 / 160, 0.1, 2000);
        camera.position.set(0, 80, 300);
        camera.lookAt(new Vector3(0, 80, 0));
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(true);

        const outside = cornersOf(wideKart)
            .map(corner => corner.clone().project(camera))
            .some(ndc => Math.abs(ndc.x) > FRAMING_MARGIN || Math.abs(ndc.y) > FRAMING_MARGIN);

        expect(outside).toBe(true);
    });
});
