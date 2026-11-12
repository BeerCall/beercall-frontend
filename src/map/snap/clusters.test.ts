import { describe, it, expect } from 'vitest';
import {
    MAX_MERCATOR_LATITUDE,
    MAPLIBRE_MAX_ZOOM,
    worldPixel,
    zoomBucket,
    partition,
    ClusterIndex,
} from './clusters';
import type { ClusterPoint } from './types';

const point = (id: string, lng: number, lat: number, key = id): ClusterPoint => ({
    id, key, coordinates: [lng, lat],
});

describe('worldPixel', () => {
    it('projette les latitudes ordinaires comme le POC', () => {
        const [x, y] = worldPixel(2.25, 48.84, 12);
        expect(x).toBeCloseTo(((2.25 + 180) / 360) * 512 * 4096, 6);
        expect(Number.isFinite(y)).toBe(true);
        expect(y).toBeGreaterThan(0);
    });

    it('borne la latitude polaire à ±85.05112878 et reste fini', () => {
        const north = worldPixel(0, 90, 12);
        const pole = worldPixel(0, MAX_MERCATOR_LATITUDE, 12);
        expect(north).toEqual(pole);
        expect(Number.isFinite(north[1])).toBe(true);
        const south = worldPixel(0, -90, 12);
        expect(Number.isFinite(south[1])).toBe(true);
    });

    it('rejette les valeurs non finies', () => {
        expect(() => worldPixel(Number.NaN, 0, 12)).toThrow();
        expect(() => worldPixel(0, Number.POSITIVE_INFINITY, 12)).toThrow();
        expect(() => worldPixel(0, 0, Number.NaN)).toThrow();
    });

    it('borne le zoom aux limites MapLibre', () => {
        expect(worldPixel(0, 0, 99)).toEqual(worldPixel(0, 0, MAPLIBRE_MAX_ZOOM));
        expect(worldPixel(0, 0, -5)).toEqual(worldPixel(0, 0, 0));
    });
});

describe('zoomBucket', () => {
    it('arrondit au demi-niveau', () => {
        expect(zoomBucket(12.24)).toBe(12);
        expect(zoomBucket(12.26)).toBe(12.5);
        expect(zoomBucket(16)).toBe(16);
    });
});

describe('partition / ClusterIndex', () => {
    it('regroupe les points proches et sépare les lointains', () => {
        const points = [point('a', 2.35, 48.85), point('b', 2.35, 48.85), point('c', 3.5, 49.5)];
        const groups = partition(points, 14, 34);
        expect(groups).toHaveLength(2);
        expect(groups[0]).toEqual([0, 1]);
        expect(groups[1]).toEqual([2]);
    });

    it('est stable entre appels et buckets mémorisés', () => {
        const points = [point('a', 2.35, 48.85), point('b', 2.3501, 48.8501)];
        const index = new ClusterIndex(points, 34, 4);
        expect(index.membership(14)).toBe(index.membership(14));
        expect(index.membership(14)).toEqual(partition(points, 14, 34));
    });

    it('plafonne la pile à 4 mais conserve tous les membres', () => {
        const points = Array.from({ length: 5 }, (_, i) => point(`m${i}`, 2.35, 48.85, `key${i}`));
        const index = new ClusterIndex(points, 34, 4);
        const [cluster] = index.compose(points.map((p) => p.coordinates), 16);
        expect(cluster.members).toHaveLength(5);
        expect(cluster.shown).toHaveLength(4);
        expect(cluster.keys).toHaveLength(4);
        expect(cluster.id).toBe('group-m0-5');
    });

    it('centre le groupe sur les positions live', () => {
        const points = [point('a', 2, 48), point('b', 2, 48)];
        const index = new ClusterIndex(points, 34, 4);
        const [cluster] = index.compose([[2, 48], [2.002, 48]], 16);
        expect(cluster.coordinates[0]).toBeCloseTo(2.001, 9);
        expect(cluster.coordinates[1]).toBeCloseTo(48, 9);
    });

    it('rejette un rayon ou une pile invalides', () => {
        expect(() => new ClusterIndex([], 0)).toThrow();
        expect(() => new ClusterIndex([], 34, 1)).toThrow();
    });
});
