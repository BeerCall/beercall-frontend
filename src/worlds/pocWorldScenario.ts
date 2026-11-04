/**
 * P2 — copie de `poc/fluidite/src/world/worldScenario.ts` (7ad2d84).
 *
 * Seule adaptation : le décor est identifié par sa clé de manifeste A13
 * (`decor/bar`, `decor/piscine`, `decor/dodo`) au lieu d'un chemin statique.
 */

export type WorldKind = 'bar' | 'piscine' | 'dodo';

export type WorldSpec = {
    label: string;
    decorKey: string;
    participants: number;
    modelScale: number;
    modelOffsetY: number;
    camera: [number, number, number];
    target: [number, number, number];
    /** World-Y band in which a raycast hit counts as a walkable surface. */
    walkBand: [number, number];
    /** Horizontal margin kept between the surface scan and the measured model bounds. */
    margin: number;
};

export const WORLD_SPECS: Record<WorldKind, WorldSpec> = {
    bar: {
        label: 'Bar',
        decorKey: 'decor/bar',
        participants: 10,
        modelScale: 0.65,
        modelOffsetY: -0.28,
        camera: [9.5, 6.6, 12.5],
        target: [0, 1.2, 0],
        walkBand: [-0.05, 0.6],
        margin: 1.4,
    },
    piscine: {
        label: 'Piscine',
        decorKey: 'decor/piscine',
        participants: 10,
        modelScale: 0.26,
        modelOffsetY: 0,
        camera: [10.2, 7, 12.8],
        target: [0, 1.3, 0],
        walkBand: [-0.1, 2.3],
        margin: 0.9,
    },
    dodo: {
        label: 'Île flottante',
        decorKey: 'decor/dodo',
        participants: 20,
        modelScale: 1333,
        modelOffsetY: 5.56,
        camera: [10.5, 12.2, 14.5],
        target: [0, 5.8, 0],
        walkBand: [-0.1, 9.1],
        margin: 0.7,
    },
};

export type WorldBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

/** Uniform grid inside the measured model bounds, used to discover walkable floor. */
export function surfaceGrid(bounds: WorldBounds, step = 0.3): Array<{ x: number; z: number }> {
    const points: Array<{ x: number; z: number }> = [];
    for (let x = bounds.minX; x <= bounds.maxX + 1e-6; x += step) {
        for (let z = bounds.minZ; z <= bounds.maxZ + 1e-6; z += step) points.push({ x, z });
    }
    return points;
}

/**
 * Farthest-point sampling: keep the population spread instead of clustering on
 * the first grid rows. The first point is the one nearest the centroid, so the
 * selection is deterministic and independent of grid orientation.
 */
export function spreadPoints<T extends { x: number; z: number }>(points: T[], count: number): T[] {
    if (points.length <= count) return points.slice();
    const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const centerZ = points.reduce((sum, point) => sum + point.z, 0) / points.length;
    let first = 0;
    let best = Number.POSITIVE_INFINITY;
    points.forEach((point, index) => {
        const distance = (point.x - centerX) ** 2 + (point.z - centerZ) ** 2;
        if (distance < best) { best = distance; first = index; }
    });
    const chosen = [points[first]];
    const minDistance = points.map((point) => (point.x - points[first].x) ** 2 + (point.z - points[first].z) ** 2);
    while (chosen.length < count) {
        let next = 0;
        for (let index = 1; index < points.length; index += 1) {
            if (minDistance[index] > minDistance[next]) next = index;
        }
        chosen.push(points[next]);
        points.forEach((point, index) => {
            const distance = (point.x - points[next].x) ** 2 + (point.z - points[next].z) ** 2;
            if (distance < minDistance[index]) minDistance[index] = distance;
        });
    }
    return chosen;
}
