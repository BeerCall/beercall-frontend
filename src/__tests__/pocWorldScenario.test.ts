import { describe, expect, it } from 'vitest';
import { WORLD_SPECS, spreadPoints, surfaceGrid } from '../worlds/pocWorldScenario';

describe('P2 — contrat de scène des mondes (copie PoC)', () => {
    it('conserve les trois mondes et leurs clés de décor du manifeste', () => {
        expect(Object.keys(WORLD_SPECS)).toEqual(['bar', 'piscine', 'dodo']);
        expect(WORLD_SPECS.bar.decorKey).toBe('decor/bar');
        expect(WORLD_SPECS.piscine.decorKey).toBe('decor/piscine');
        expect(WORLD_SPECS.dodo.decorKey).toBe('decor/dodo');
    });

    it('conserve la caméra et la cible du Bar de la PoC', () => {
        expect(WORLD_SPECS.bar.camera).toEqual([9.5, 6.6, 12.5]);
        expect(WORLD_SPECS.bar.target).toEqual([0, 1.2, 0]);
        expect(WORLD_SPECS.bar.walkBand).toEqual([-0.05, 0.6]);
    });

    it('borne la grille de surface aux limites fournies', () => {
        const points = surfaceGrid({ minX: 0, maxX: 1, minZ: 0, maxZ: 1 }, 0.5);
        expect(points).toEqual([
            { x: 0, z: 0 }, { x: 0, z: 0.5 }, { x: 0, z: 1 },
            { x: 0.5, z: 0 }, { x: 0.5, z: 0.5 }, { x: 0.5, z: 1 },
            { x: 1, z: 0 }, { x: 1, z: 0.5 }, { x: 1, z: 1 },
        ]);
    });

    it('retourne tous les points quand la demande dépasse la surface', () => {
        const points = [{ x: 0, z: 0 }, { x: 1, z: 1 }];
        expect(spreadPoints(points, 10)).toEqual(points);
    });

    it('sélectionne exactement le nombre demandé de points éloignés', () => {
        const points = Array.from({ length: 100 }, (_, i) => ({ x: i % 10, z: Math.floor(i / 10) }));
        const selected = spreadPoints(points, 10);
        expect(selected).toHaveLength(10);
        expect(new Set(selected.map((point) => `${point.x}:${point.z}`)).size).toBe(10);
    });

    it('reste déterministe pour la même entrée', () => {
        const points = Array.from({ length: 50 }, (_, i) => ({ x: i, z: 50 - i }));
        expect(spreadPoints(points, 8)).toEqual(spreadPoints(points, 8));
    });
});
