import type {Feature, FeatureCollection, Point} from 'geojson';

/** B09a — types partagés de la carte Snap (GeoJSON réel, compatible MapLibre). */
export type Coordinates = [number, number];

export interface PersonMeta {
    id: string;
    bodyKey: string;
    name: string;
    since: string;
}

export interface ClusterPoint {
    id: string;
    key: string;
    coordinates: Coordinates;
}

export interface Cluster {
    /** Membre unique, ou `group-<firstId>-<size>`. */
    id: string;
    members: string[];
    /** Membres réellement dessinés (au plus `maxStack`), même ordre que `keys`. */
    shown: string[];
    keys: string[];
    coordinates: Coordinates;
}

export type SnapKind = 'base' | 'avatar' | 'label';

export interface SnapProperties {
    kind: SnapKind;
    id: string;
    cluster: string;
    /** Liste JSON complète des membres du groupe (pas seulement la pile). */
    members?: string;
    size?: number;
    avatarKey?: string;
    slot?: string;
    sort?: number;
    bucket?: number;
    baseScale?: number;
    label?: string;
    /** Identifiant de l'image de pastille, comme dans MapLibre. */
    pill?: string;
    [key: string]: unknown;
}

export type SnapFeature = Feature<Point, SnapProperties>;
export type SnapFeatureCollection = FeatureCollection<Point, SnapProperties>;

export interface SnapPerson extends PersonMeta {
    coordinates: Coordinates;
    /** URL du corps publié (null = initiale). */
    bodyUrl?: string | null;
    /** Hash de tenue, partagé par plusieurs membres. */
    hash?: string | null;
}
