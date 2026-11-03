import {useCallback, useEffect, useRef, useState} from 'react';
import {Layer, Source, useMap} from 'react-map-gl/maplibre';
import type {LayerProps} from 'react-map-gl/maplibre';
import type {SnapFeatureCollection, SnapPerson} from '../../map/snap/types';
import {ClusterIndex, zoomBucket} from '../../map/snap/clusters';
import {buildSnapFeatures, labelText} from '../../map/snap/mapLabels';
import {
    CLUSTER_MAX_STACK,
    CLUSTER_RADIUS_PX,
    SNAP_LAYER_IDS,
    SNAP_SOURCE_ID,
    createSnapLayers,
} from '../../map/snap/mapScenario';
import {SnapIconRegistry, type SnapImageMap} from '../../map/snap/avatarIcons';
import {UpdatePump, type PumpMetrics} from '../../map/snap/updatePump';

/** B09c — couche Snap autonome : une source GeoJSON, trois layers, zéro DOM par membre. */
export interface SnapAvatarLayerProps {
    people: readonly SnapPerson[];
    enabled?: boolean;
    onSelectUser?: (id: string) => void;
    /** Un tap sur un groupe multi doit annuler un éventuel appui long. */
    onClusterClick?: () => void;
    /** Observabilité optionnelle (tests, diagnostic). */
    onMetrics?: (metrics: PumpMetrics) => void;
}

interface SourceLike {
    setData?: (data: SnapFeatureCollection, options?: boolean) => void;
}

interface SnapMapEvent {
    features?: Array<{properties?: Record<string, unknown> | null; geometry?: {coordinates?: number[]}}>;
    lngLat?: {lng: number; lat: number};
    sourceId?: string;
    id?: string;
}

interface NativeSnapMap extends SnapImageMap {
    getSource: (id: string) => SourceLike | undefined;
    on: {
        (event: string, handler: (event: SnapMapEvent) => void): void;
        (event: string, layer: string, handler: (event: SnapMapEvent) => void): void;
    };
    off: {
        (event: string, handler: (event: SnapMapEvent) => void): void;
        (event: string, layer: string, handler: (event: SnapMapEvent) => void): void;
    };
    getZoom?: () => number;
    easeTo?: (options: {center: [number, number]; zoom: number; duration?: number}) => void;
}

const EMPTY: SnapFeatureCollection = {type: 'FeatureCollection', features: []};
const SNAP_LAYERS = createSnapLayers();

function parseMembers(properties: Record<string, unknown> | null | undefined): string[] {
    const raw = properties?.members;
    if (typeof raw !== 'string') return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
        return [];
    }
}

function pointsSignature(people: readonly SnapPerson[]): string {
    return people.map((person) => [
        person.id,
        person.bodyKey,
        person.coordinates[0],
        person.coordinates[1],
    ].join(':')).join('|');
}

export function SnapAvatarLayer({
    people,
    enabled = true,
    onSelectUser,
    onClusterClick,
    onMetrics,
}: SnapAvatarLayerProps) {
    const maps = useMap();
    const mapRef = maps.current ?? Object.values(maps).find((entry) => entry != null);
    const native = (mapRef?.getMap?.() ?? null) as NativeSnapMap | null;
    const registryRef = useRef<SnapIconRegistry | null>(null);
    const pumpRef = useRef<UpdatePump<SnapFeatureCollection> | null>(null);
    const pendingRef = useRef<SnapFeatureCollection | null>(null);
    const indexRef = useRef<{signature: string; index: ClusterIndex} | null>(null);
    const aliveRef = useRef(true);
    const [styleEpoch, setStyleEpoch] = useState(0);

    const commit = useCallback(async () => {
        const map = native;
        const registry = registryRef.current;
        const pump = pumpRef.current;
        if (!map || !registry || !pump) return;

        const signature = pointsSignature(people);
        if (!indexRef.current || indexRef.current.signature !== signature) {
            const points = people.map((person) => ({
                id: person.id,
                key: person.bodyKey,
                coordinates: person.coordinates,
            }));
            indexRef.current = {signature, index: new ClusterIndex(points, CLUSTER_RADIUS_PX, CLUSTER_MAX_STACK)};
        }

        const bucket = zoomBucket(map.getZoom?.() ?? 16);
        const clusters = indexRef.current.index.compose(people.map((person) => person.coordinates), bucket);
        if (clusters.length === 0 && people.length > 0) return;
        const meta = new Map(people.map((person) => [person.id, person]));
        const data = buildSnapFeatures(clusters, meta, bucket);
        const labels = clusters.map((cluster) => labelText(cluster, meta));

        try {
            await registry.ensure(people, labels);
        } catch {
            // Le registre gère déjà les erreurs par image (initiale de repli).
        }
        if (!aliveRef.current || registryRef.current !== registry) return;
        pump.push(data);
        registry.prune();
        onMetrics?.(pump.metrics);
    }, [native, people, onMetrics]);

    // Cycle de vie du registre et de la pompe (une seule par map).
    useEffect(() => {
        aliveRef.current = true;
        if (!native || !enabled) return;
        const registry = new SnapIconRegistry(native);
        const pump = new UpdatePump<SnapFeatureCollection>((data) => {
            const source = native.getSource(SNAP_SOURCE_ID);
            if (!source?.setData) {
                pendingRef.current = data;
                return;
            }
            source.setData(data, true);
        });
        registryRef.current = registry;
        pumpRef.current = pump;
        return () => {
            aliveRef.current = false;
            pump.stop();
            registry.dispose();
            registryRef.current = null;
            pumpRef.current = null;
            pendingRef.current = null;
            indexRef.current = null;
        };
    }, [native, enabled]);

    // Style rechargé : époque invalidée, pompe réinitialisée, source remontée.
    useEffect(() => {
        if (!native || !enabled) return;
        const onStyle = () => {
            setStyleEpoch((value) => value + 1);
            pendingRef.current = null;
            pumpRef.current?.stop();
            pumpRef.current = new UpdatePump<SnapFeatureCollection>((data) => {
                const source = native.getSource(SNAP_SOURCE_ID);
                if (!source?.setData) {
                    pendingRef.current = data;
                    return;
                }
                source.setData(data, true);
            });
            registryRef.current?.invalidate();
            void commit();
        };
        const onMissing = () => { void commit(); };
        const onSourceData = (event: SnapMapEvent) => {
            if (event.sourceId !== SNAP_SOURCE_ID) return;
            const pending = pendingRef.current;
            if (!pending) return;
            pendingRef.current = null;
            pumpRef.current?.push(pending);
        };
        native.on('style.load', onStyle);
        native.on('styleimagemissing', onMissing);
        native.on('sourcedata', onSourceData);
        return () => {
            native.off('style.load', onStyle);
            native.off('styleimagemissing', onMissing);
            native.off('sourcedata', onSourceData);
        };
    }, [native, enabled, commit]);

    // Recompositions : données, caméra stabilisée, et une fois par minute pour les durées.
    useEffect(() => {
        if (!native || !enabled) return;
        void commit();
        const refresh = () => { void commit(); };
        native.on('zoomend', refresh);
        native.on('moveend', refresh);
        const timer = setInterval(refresh, 60_000);
        return () => {
            native.off('zoomend', refresh);
            native.off('moveend', refresh);
            clearInterval(timer);
        };
    }, [native, enabled, commit]);

    // Tap groupe → zoom + 1 ; tap individu → profil. Jamais de lancement d'apéro.
    useEffect(() => {
        if (!native || !enabled) return;
        const onClick = (event: SnapMapEvent) => {
            const feature = event.features?.[0];
            const properties = feature?.properties ?? null;
            const cluster = String(properties?.cluster ?? '');
            if (!cluster) return;
            const members = parseMembers(properties);
            if (members.length > 1) {
                onClusterClick?.();
                const coordinates = feature?.geometry?.coordinates;
                const lng = event.lngLat?.lng ?? coordinates?.[0];
                const lat = event.lngLat?.lat ?? coordinates?.[1];
                if (typeof lng === 'number' && typeof lat === 'number') {
                    native.easeTo?.({
                        center: [lng, lat],
                        zoom: (native.getZoom?.() ?? 16) + 1,
                        duration: 400,
                    });
                }
                return;
            }
            const id = String(properties?.id ?? '');
            if (id) onSelectUser?.(id);
        };
        native.on('click', SNAP_LAYER_IDS.avatars, onClick);
        native.on('click', SNAP_LAYER_IDS.labels, onClick);
        return () => {
            native.off('click', SNAP_LAYER_IDS.avatars, onClick);
            native.off('click', SNAP_LAYER_IDS.labels, onClick);
        };
    }, [native, enabled, onSelectUser, onClusterClick]);

    if (!enabled) return null;
    return (
        <Source key={styleEpoch} id={SNAP_SOURCE_ID} type="geojson" data={EMPTY}>
            {SNAP_LAYERS.map((layer) => <Layer key={layer.id} {...layer as LayerProps}/>)}
        </Source>
    );
}

export default SnapAvatarLayer;
