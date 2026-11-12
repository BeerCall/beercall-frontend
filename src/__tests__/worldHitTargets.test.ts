import { Object3D, PerspectiveCamera } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import {
    registerWorldHitTarget,
    resetWorldHitTargetsForTests,
    resolveWorldHitTargets,
    unregisterWorldHitTarget,
} from '../worlds/worldHitTargets';

function camera(): PerspectiveCamera {
    const view = new PerspectiveCamera(50, 16 / 9, 0.1, 100);
    view.position.set(0, 0, 5);
    view.lookAt(0, 0, 0);
    view.updateMatrixWorld(true);
    return view;
}

function targetAt(x: number, y = 0): Object3D {
    const object = new Object3D();
    object.position.set(x, y, 0);
    object.updateMatrixWorld(true);
    return object;
}

afterEach(() => {
    resetWorldHitTargetsForTests();
});

describe('cibles de toucher publiées pour le probe (8i)', () => {
    it('projette le centre de chaque avatar en coordonnées NDC', () => {
        const view = camera();
        registerWorldHitTarget({
            world: 'bar', userId: 'u_1', username: 'Ada', object: targetAt(0), camera: view,
        });
        registerWorldHitTarget({
            world: 'bar', userId: 'u_2', username: 'Bob', object: targetAt(1), camera: view,
        });

        const resolved = resolveWorldHitTargets();
        expect(resolved).toHaveLength(2);
        const ada = resolved.find((entry) => entry.userId === 'u_1');
        const bob = resolved.find((entry) => entry.userId === 'u_2');
        expect(ada?.ndcX).toBeCloseTo(0, 6);
        expect(ada?.ndcY).toBeCloseTo(0, 6);
        expect(ada?.username).toBe('Ada');
        expect(bob?.ndcX).toBeGreaterThan(0);
    });

    it('retire la cible au démontage et remplace au lieu de dupliquer', () => {
        const view = camera();
        registerWorldHitTarget({ world: 'dodo', userId: 'u_9', object: targetAt(0), camera: view });
        registerWorldHitTarget({ world: 'dodo', userId: 'u_9', object: targetAt(0.5), camera: view });
        expect(resolveWorldHitTargets()).toHaveLength(1);

        unregisterWorldHitTarget('dodo', 'u_9');
        expect(resolveWorldHitTargets()).toHaveLength(0);
    });

    it('ignore une cible sortie du cadre au lieu de publier un point faux', () => {
        const view = camera();
        registerWorldHitTarget({ world: 'piscine', userId: 'u_3', object: targetAt(20), camera: view });
        expect(resolveWorldHitTargets()).toHaveLength(0);
    });
});
