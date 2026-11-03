/**
 * B14 — Configuration factorisée des scènes des mondes 3D (CHAL-02 / PERF).
 *
 * Exprime les mondes en coordonnées historiques (non métriques) :
 * - Caméra partagée : [0, 80, 450], fov 45, cible [0, 80, 0].
 * - Bar : échelle 0.1, position [0, 0, 0].
 * - Piscine : échelle 7.5, position [0, 0, 0].
 * - Dodo : échelle 500, position [0, 100, 0].
 * - Échelle avatars : 0.25 (Bar & Piscine), 0.1 (Dodo).
 */

export type WorldKind = 'bar' | 'piscine' | 'dodo';

export interface WorldConfig {
    kind: WorldKind;
    name: string;
    decorKey: string;
    decorSourceId: string;
    camera: {
        position: [number, number, number];
        fov: number;
        target: [number, number, number];
    };
    decorTransform: {
        scale: number;
        position: [number, number, number];
        rotation: [number, number, number];
    };
    avatarScale: number;
    posterUrl: string;
}

export const WORLD_SCENE_CONFIG: Record<WorldKind, WorldConfig> = {
    bar: {
        kind: 'bar',
        name: 'Le Bar',
        decorKey: 'decor/bar',
        decorSourceId: 'Bar',
        camera: {
            position: [0, 80, 450],
            fov: 45,
            target: [0, 80, 0],
        },
        decorTransform: {
            scale: 0.1,
            position: [0, 0, 0],
            rotation: [0, 0, 0],
        },
        avatarScale: 0.25,
        posterUrl: '/worlds/bar.webp',
    },
    piscine: {
        kind: 'piscine',
        name: 'La Piscine',
        decorKey: 'decor/piscine',
        decorSourceId: 'Swimming_pool',
        camera: {
            position: [0, 80, 450],
            fov: 45,
            target: [0, 80, 0],
        },
        decorTransform: {
            scale: 7.5,
            position: [0, 0, 0],
            rotation: [0, 0, 0],
        },
        avatarScale: 0.25,
        posterUrl: '/worlds/piscine.webp',
    },
    dodo: {
        kind: 'dodo',
        name: 'Le Dodo',
        decorKey: 'decor/dodo',
        decorSourceId: 'Floaty_Island',
        camera: {
            position: [0, 80, 450],
            fov: 45,
            target: [0, 80, 0],
        },
        decorTransform: {
            scale: 500,
            position: [0, 100, 0],
            rotation: [0, 0, 0],
        },
        avatarScale: 0.1,
        posterUrl: '/worlds/dodo.webp',
    },
};
