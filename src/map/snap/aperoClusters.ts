import type {AperoStatus, BeerCall} from '../../types/api';
import {ClusterIndex, MAPLIBRE_MAX_ZOOM, MAPLIBRE_MIN_ZOOM, worldPixel} from './clusters';
import type {ClusterPoint, Coordinates} from './types';

/**
 * 14b-1 — regroupement visuel des apéros en espace écran.
 *
 * Module pur, sans React ni MapLibre : mêmes primitives déterministes que les
 * avatars (`ClusterIndex`, demi-niveaux de zoom), mais un index et un rayon
 * dédiés aux apéros. Aucun compteur de participants, aucune coordonnée déplacée.
 */
export const APERO_CLUSTER_RADIUS_PX = 44;
export const APERO_EXPAND_MAX_ZOOM = 20;
export const APERO_DETAIL_MIN_BUCKET = 19;
export const APERO_DETAIL_SPREAD_RADIUS_PX = 36;
const DETAIL_TARGET_SPACING_PX = 132;

export interface AperoProjection {
    project(coordinates: Coordinates): {x: number; y: number};
    unproject(point: [number, number]): {lng: number; lat: number};
}
export const APERO_SAME_POINT_EPSILON = 1e-6;
export const APERO_EXPAND_PADDING = {top: 96, right: 48, bottom: 128, left: 48} as const;
export const APERO_EXPAND_MIN_ADVANCE = 0.25;
export const APERO_GROUP_Z_INDEX = 58;
export const APERO_EXPAND_DURATION_MS = 450;

export interface AperoVisibility {
    active_beer_call?: readonly BeerCall[] | null;
    scheduled_beer_calls?: readonly BeerCall[] | null;
    past_beer_calls?: readonly BeerCall[] | null;
}

export interface AperoPoint extends ClusterPoint {
    call: BeerCall;
}

export type AperoEntry =
    | {kind: 'single'; id: string; call: BeerCall; coordinates: Coordinates}
    | {
          kind: 'group';
          id: string;
          calls: BeerCall[];
          coordinates: Coordinates;
          statuses: AperoStatus[];
          dominantStatus: AperoStatus;
          canExpand: boolean;
      };

/** Ordre stable et indépendant de la locale, pour que la partition soit reproductible. */
function byId(a: BeerCall, b: BeerCall): number {
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
}

function statusRank(status: AperoStatus): number {
    switch (status) {
        case 'active':
            return 0;
        case 'scheduled':
            return 1;
        case 'ended':
            return 2;
        case 'cancelled':
            return 3;
    }
}

/** Repli d'affichage uniquement ; l'objet métier et son statut restent intacts. */
function displayStatus(status: AperoStatus): AperoStatus {
    switch (status) {
        case 'active':
        case 'scheduled':
        case 'ended':
        case 'cancelled':
            return status;
        default:
            return 'ended';
    }
}

/**
 * Points des seuls apéros déjà fournis par `SquadDetails`.
 *
 * Priorité de dédoublonnage : actif > programmé > passé (ordre des tableaux),
 * puis ordre d'`id` à l'intérieur de chaque tableau. Les coordonnées non finies
 * sont ignorées comme dans `MapSection`.
 */
export function buildAperoPoints(visibility: AperoVisibility): AperoPoint[] {
    const sources = [
        visibility.active_beer_call,
        visibility.scheduled_beer_calls,
        visibility.past_beer_calls,
    ];
    const seen = new Set<string>();
    const points: AperoPoint[] = [];
    for (const source of sources) {
        if (!source) continue;
        for (const call of [...source].sort(byId)) {
            if (!call.id || seen.has(call.id)) continue;
            const coordinates: Coordinates = [Number(call.longitude), Number(call.latitude)];
            if (!Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) continue;
            seen.add(call.id);
            points.push({id: call.id, key: call.id, coordinates, call});
        }
    }
    return points;
}

/** Empreinte minimale (ids + coordonnées) pour mémoïser l'index sans le recréer par rendu. */
export function aperoSignature(points: readonly AperoPoint[]): string {
    return points.map((point) => `${point.id}@${point.coordinates[0]},${point.coordinates[1]}`).join('|');
}

/** Index dédié aux apéros : même rayon pour tous les buckets, cache interne par bucket. */
export function createAperoIndex(points: readonly AperoPoint[]): ClusterIndex {
    return new ClusterIndex(points, APERO_CLUSTER_RADIUS_PX);
}

/**
 * Décale un point de `dx`/`dy` pixels écran (nord en haut) au bucket donné.
 * Utilisé uniquement au zoom de détail pour désempiler des apéros au même
 * endroit ; les objets métier et leurs vraies coordonnées restent intacts.
 */
export function coordinatesWithPixelOffset(
    coordinates: Coordinates,
    dx: number,
    dy: number,
    bucket: number,
): Coordinates {
    const [x, y] = worldPixel(coordinates[0], coordinates[1], bucket);
    const scale = 512 * 2 ** Math.min(MAPLIBRE_MAX_ZOOM, Math.max(MAPLIBRE_MIN_ZOOM, bucket));
    const nextX = x + dx;
    const nextY = y + dy;
    const longitude = (nextX / scale) * 360 - 180;
    const mercator = 0.5 - nextY / scale;
    const latitude = (Math.asin(Math.tanh(2 * Math.PI * mercator)) * 180) / Math.PI;
    return [longitude, latitude];
}

/**
 * Au zoom de détail, plus aucune girafe : chaque apéro devient un totem.
 * Les apéros encore à moins d'un rayon d'écran les uns des autres sont
 * répartis en cercle autour de leur centre pour être tous visibles et
 * cliquables, y compris quand leurs coordonnées sont identiques.
 */
function composeDetailEntries(
    points: readonly AperoPoint[],
    bucket: number,
    index: ClusterIndex,
    projection?: AperoProjection,
): AperoEntry[] {
    const clusters = index.compose(
        points.map((point) => point.coordinates),
        bucket,
    );
    const byIdMap = new Map(points.map((point) => [point.id, point]));
    const entries: AperoEntry[] = [];
    for (const cluster of clusters) {
        if (cluster.members.length === 1) {
            const member = byIdMap.get(cluster.members[0]);
            if (!member) throw new Error(`Apéro inconnu: ${cluster.members[0]}`);
            entries.push({
                kind: 'single',
                id: member.id,
                call: member.call,
                coordinates: member.coordinates,
            });
            continue;
        }
        const total = cluster.members.length;
        // La distance entre voisins ne doit pas diminuer avec le nombre de
        // membres : les plus grands totems mesurent 108 × 72 px.
        const radius = Math.max(APERO_DETAIL_SPREAD_RADIUS_PX,
            DETAIL_TARGET_SPACING_PX / (2 * Math.sin(Math.PI / total)));
        const center = projection?.project(cluster.coordinates);
        cluster.members.forEach((id, position) => {
            const member = byIdMap.get(id);
            if (!member) throw new Error(`Apéro inconnu: ${id}`);
            const angle = -Math.PI / 2 + (2 * Math.PI * position) / total;
            const dx = Math.cos(angle) * radius;
            const dy = Math.sin(angle) * radius;
            const projected = center ? projection?.unproject([center.x + dx, center.y + dy]) : undefined;
            entries.push({
                kind: 'single',
                id: member.id,
                call: member.call,
                coordinates: projected ? [projected.lng, projected.lat] : coordinatesWithPixelOffset(
                    cluster.coordinates,
                    dx,
                    dy,
                    bucket,
                ),
            });
        });
    }
    return entries;
}

/** Un apéro apparaît exactement une fois : seul ou membre d'un groupe. */
export function composeAperoEntries(
    points: readonly AperoPoint[],
    bucket: number,
    index: ClusterIndex = createAperoIndex(points),
    projection?: AperoProjection,
): AperoEntry[] {
    if (!Number.isFinite(bucket)) throw new Error(`Zoom invalide: ${bucket}`);
    if (bucket >= APERO_DETAIL_MIN_BUCKET) {
        return composeDetailEntries(points, bucket, index, projection);
    }
    const clusters = index.compose(
        points.map((point) => point.coordinates),
        bucket,
    );
    const byIdMap = new Map(points.map((point) => [point.id, point]));
    return clusters.map((cluster) => {
        if (cluster.members.length === 1) {
            const member = byIdMap.get(cluster.members[0]);
            if (!member) throw new Error(`Apéro inconnu: ${cluster.members[0]}`);
            return {kind: 'single', id: member.id, call: member.call, coordinates: member.coordinates};
        }
        const calls = cluster.members.map((id) => {
            const member = byIdMap.get(id);
            if (!member) throw new Error(`Apéro inconnu: ${id}`);
            return member.call;
        });
        const statuses = [...new Set(calls.map((call) => displayStatus(call.status)))].sort(
            (a, b) => statusRank(a) - statusRank(b),
        );
        return {
            kind: 'group',
            id: cluster.id,
            calls,
            coordinates: cluster.coordinates,
            statuses,
            dominantStatus: statuses[0],
            canExpand: bucket < APERO_EXPAND_MAX_ZOOM && !allSameAperoPoint(calls),
        };
    });
}

/** Coins `[[minLng, minLat], [maxLng, maxLat]]` pour `cameraForBounds`, sans déplacer personne. */
export function boundsOfCalls(calls: readonly BeerCall[]): [[number, number], [number, number]] {
    let minLng = Number.POSITIVE_INFINITY;
    let minLat = Number.POSITIVE_INFINITY;
    let maxLng = Number.NEGATIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;
    for (const call of calls) {
        const lng = Number(call.longitude);
        const lat = Number(call.latitude);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
        minLng = Math.min(minLng, lng);
        minLat = Math.min(minLat, lat);
        maxLng = Math.max(maxLng, lng);
        maxLat = Math.max(maxLat, lat);
    }
    if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) {
        throw new Error('Bornes d’apéros indisponibles');
    }
    return [
        [minLng, minLat],
        [maxLng, maxLat],
    ];
}

/** Vrai quand tous les membres sont au même point (coordonnées inséparables). */
export function allSameAperoPoint(
    calls: readonly BeerCall[],
    epsilon: number = APERO_SAME_POINT_EPSILON,
): boolean {
    const valid = calls.filter(
        (call) => Number.isFinite(Number(call.longitude)) && Number.isFinite(Number(call.latitude)),
    );
    if (valid.length < 2) return true;
    // Comparer l'étendue entière : la proximité au seul premier membre dépend
    // de l'ordre et peut masquer deux extrêmes séparés de presque 2 × epsilon.
    const [[minLng, minLat], [maxLng, maxLat]] = boundsOfCalls(valid);
    return maxLng - minLng <= epsilon && maxLat - minLat <= epsilon;
}
