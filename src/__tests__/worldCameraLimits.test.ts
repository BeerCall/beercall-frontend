import { PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { afterEach, describe, expect, it } from 'vitest';
import { WORLD_SPECS, type WorldKind } from '../worlds/pocWorldScenario';
import {
    WORLD_CAMERA_FLOOR_MARGIN,
    WORLD_CAMERA_LEGACY_MAX_POLAR_ANGLE,
    WORLD_CAMERA_MIN_POLAR_ANGLE,
    WORLD_CAMERA_UNMEASURED_MAX_POLAR_ANGLE,
    worldCameraMaxPolarAngle,
    worldCameraRadius,
} from '../worlds/worldCameraLimits';
import {
    getWorldFloor,
    resetWorldFloorsForTests,
    setWorldFloor,
    subscribeWorldFloors,
} from '../worlds/worldFloors';

/** Hauteurs de sol réellement mesurées sur les trois décors ([world] measure). */
const MEASURED_FLOORS: Record<WorldKind, number> = { bar: 0.15, piscine: 1.65, dodo: 5.3 };
const KINDS: WorldKind[] = ['bar', 'piscine', 'dodo'];

function cameraYAtPolar(kind: WorldKind, polarAngle: number): number {
    return WORLD_SPECS[kind].target[1] + worldCameraRadius(kind) * Math.cos(polarAngle);
}

function orbitControlsFor(kind: WorldKind, maxPolarAngle: number) {
    const domElement = document.createElement('div');
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(...WORLD_SPECS[kind].camera);
    const controls = new OrbitControls(camera, domElement);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.minPolarAngle = WORLD_CAMERA_MIN_POLAR_ANGLE;
    controls.maxPolarAngle = maxPolarAngle;
    controls.target.set(...WORLD_SPECS[kind].target);
    return {camera, controls};
}

afterEach(() => {
    resetWorldFloorsForTests();
});

describe('8j — bornes de caméra des mondes', () => {
    it('conserve les bornes de l’ancien SelectWorldModal', () => {
        expect(WORLD_CAMERA_MIN_POLAR_ANGLE).toBeCloseTo(Math.PI / 3, 12);
        expect(WORLD_CAMERA_LEGACY_MAX_POLAR_ANGLE).toBeCloseTo(Math.PI / 1.8, 12);
        expect(WORLD_CAMERA_MIN_POLAR_ANGLE).toBeGreaterThan(0);
        expect(WORLD_CAMERA_MIN_POLAR_ANGLE).toBeLessThan(WORLD_CAMERA_LEGACY_MAX_POLAR_ANGLE);
        expect(WORLD_CAMERA_LEGACY_MAX_POLAR_ANGLE).toBeLessThanOrEqual(Math.PI / 1.8);
    });

    it('montre que la borne historique de 100° passe sous le sol des trois décors', () => {
        for (const kind of KINDS) {
            expect(cameraYAtPolar(kind, WORLD_CAMERA_LEGACY_MAX_POLAR_ANGLE))
                .toBeLessThan(MEASURED_FLOORS[kind]);
        }
    });

    it('arrête la caméra juste au-dessus du sol mesuré de chaque monde', () => {
        for (const kind of KINDS) {
            const floor = MEASURED_FLOORS[kind];
            const limit = worldCameraMaxPolarAngle(kind, floor);
            expect(limit).toBeGreaterThanOrEqual(WORLD_CAMERA_MIN_POLAR_ANGLE);
            expect(limit).toBeLessThanOrEqual(WORLD_CAMERA_LEGACY_MAX_POLAR_ANGLE);
            expect(cameraYAtPolar(kind, limit)).toBeCloseTo(floor + WORLD_CAMERA_FLOOR_MARGIN, 6);
        }
    });

    it('reste au-dessus de la cible tant que le sol n’est pas mesuré', () => {
        for (const kind of KINDS) {
            const limit = worldCameraMaxPolarAngle(kind, null);
            expect(limit).toBe(WORLD_CAMERA_UNMEASURED_MAX_POLAR_ANGLE);
            expect(cameraYAtPolar(kind, limit)).toBeGreaterThan(WORLD_SPECS[kind].target[1]);
        }
    });

    it('fait ramener par OrbitControls une caméra placée sous le sol', () => {
        const kind: WorldKind = 'bar';
        const floor = MEASURED_FLOORS[kind];
        const limit = worldCameraMaxPolarAngle(kind, floor);
        const {camera, controls} = orbitControlsFor(kind, limit);
        const [targetX, targetY, targetZ] = WORLD_SPECS[kind].target;

        // Caméra à la verticale sous la cible : inclinaison polaire de 180°.
        camera.position.set(targetX, targetY - worldCameraRadius(kind), targetZ);
        controls.update();

        expect(camera.position.y).toBeGreaterThan(floor);
        expect(camera.position.y).toBeCloseTo(floor + WORLD_CAMERA_FLOOR_MARGIN, 4);
        controls.dispose();
    });

    it('publie le sol mesuré sans doublon et l’efface à la demande', () => {
        const seen: Array<number | null> = [];
        const unsubscribe = subscribeWorldFloors(() => seen.push(getWorldFloor('dodo')));
        setWorldFloor('dodo', 5.3);
        setWorldFloor('dodo', 5.3);
        setWorldFloor('dodo', null);
        unsubscribe();
        setWorldFloor('dodo', 9);

        expect(seen).toEqual([5.3, null]);
        expect(getWorldFloor('dodo')).toBe(9);
    });
});
