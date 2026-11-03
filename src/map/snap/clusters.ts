import type {Cluster, ClusterPoint, Coordinates} from './types';

/**
 * B09a — regroupement déterministe en espace écran (esprit Snap Map).
 *
 * L'appartenance est décidée une fois par demi-niveau de zoom à partir des
 * coordonnées de base ; seuls les centroïdes suivent les positions live.
 */
const TILE_SIZE = 512;

export const MAX_MERCATOR_LATITUDE = 85.05112878;
export const MAPLIBRE_MIN_ZOOM = 0;
export const MAPLIBRE_MAX_ZOOM = 24;

/** Projection Web Mercator ; latitude bornée à ±85.05112878 pour rester finie. */
export function worldPixel(longitude: number, latitude: number, zoom: number): [number, number] {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || !Number.isFinite(zoom)) {
        throw new Error(`Coordonnées de projection invalides: ${longitude}, ${latitude}, ${zoom}`);
    }
    const safeZoom = Math.min(MAPLIBRE_MAX_ZOOM, Math.max(MAPLIBRE_MIN_ZOOM, zoom));
    const safeLatitude = Math.min(MAX_MERCATOR_LATITUDE, Math.max(-MAX_MERCATOR_LATITUDE, latitude));
    const scale = TILE_SIZE * 2 ** safeZoom;
    const sin = Math.sin((safeLatitude * Math.PI) / 180);
    return [
        ((longitude + 180) / 360) * scale,
        (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
    ];
}

/** Demi-niveaux de zoom : assez fin pour paraître continu, assez stable pour ne pas sauter. */
export function zoomBucket(zoom: number): number {
    if (!Number.isFinite(zoom)) throw new Error(`Zoom invalide: ${zoom}`);
    return Math.round(zoom * 2) / 2;
}

/**
 * Partition gloutonne : le premier point libre est le germe d'un groupe formé
 * de tous les points libres à moins de `radiusPx`. L'ordre d'entrée départage,
 * le résultat est donc une fonction pure des points et du bucket.
 */
export function partition(points: readonly ClusterPoint[], bucket: number, radiusPx: number): number[][] {
    const pixels = points.map((point) => worldPixel(point.coordinates[0], point.coordinates[1], bucket));
    const taken = new Array<boolean>(points.length).fill(false);
    const groups: number[][] = [];
    const squared = radiusPx * radiusPx;
    for (let seed = 0; seed < points.length; seed += 1) {
        if (taken[seed]) continue;
        const members = [seed];
        taken[seed] = true;
        for (let other = seed + 1; other < points.length; other += 1) {
            if (taken[other]) continue;
            const dx = pixels[other][0] - pixels[seed][0];
            const dy = pixels[other][1] - pixels[seed][1];
            if (dx * dx + dy * dy <= squared) {
                members.push(other);
                taken[other] = true;
            }
        }
        groups.push(members);
    }
    return groups;
}

export class ClusterIndex {
    private readonly cache = new Map<number, number[][]>();
    private readonly points: readonly ClusterPoint[];
    readonly radiusPx: number;
    readonly maxStack: number;

    constructor(points: readonly ClusterPoint[], radiusPx: number, maxStack = 4) {
        if (!(radiusPx > 0)) throw new Error(`Rayon de regroupement invalide: ${radiusPx}`);
        if (!Number.isInteger(maxStack) || maxStack < 2) throw new Error(`Pile de groupe invalide: ${maxStack}`);
        this.points = points;
        this.radiusPx = radiusPx;
        this.maxStack = maxStack;
    }

    membership(bucket: number): number[][] {
        let groups = this.cache.get(bucket);
        if (!groups) {
            groups = partition(this.points, bucket, this.radiusPx);
            this.cache.set(bucket, groups);
        }
        return groups;
    }

    /** Groupes d'un bucket, centrés sur les positions live fournies (même ordre). */
    compose(positions: readonly Coordinates[], bucket: number): Cluster[] {
        if (positions.length !== this.points.length) {
            throw new Error(`positions ${positions.length} ≠ points ${this.points.length}`);
        }
        return this.membership(bucket).map((indices) => {
            const members = indices.map((index) => this.points[index].id);
            let longitude = 0;
            let latitude = 0;
            for (const index of indices) {
                longitude += positions[index][0];
                latitude += positions[index][1];
            }
            return {
                id: indices.length === 1 ? members[0] : `group-${members[0]}-${indices.length}`,
                members,
                keys: indices.slice(0, this.maxStack).map((index) => this.points[index].key),
                shown: members.slice(0, this.maxStack),
                coordinates: [longitude / indices.length, latitude / indices.length] as Coordinates,
            };
        });
    }
}
