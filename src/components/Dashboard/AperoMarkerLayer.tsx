import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Marker, useMap} from 'react-map-gl/maplibre';
import type {BeerCall, SquadDetails} from '../../types/dashboard';
import {SNAP_LAYER_IDS} from '../../map/snap/mapScenario';
import {
    APERO_EXPAND_DURATION_MS,
    APERO_EXPAND_MAX_ZOOM,
    APERO_EXPAND_MIN_ADVANCE,
    APERO_EXPAND_PADDING,
    allSameAperoPoint,
    boundsOfCalls,
    buildAperoPoints,
    composeAperoEntries,
    createAperoIndex,
} from '../../map/snap/aperoClusters';
import type {AperoEntry} from '../../map/snap/aperoClusters';
import {zoomBucket} from '../../map/snap/clusters';
import {AperoMemberSheet, type AperoCallKind} from './AperoMemberSheet';
import {
    activeLabel,
    activeTotemAnimation,
    clockLabel,
    groupLive,
    groupTotemSpec,
    pastLabel,
    pastTotemSpec,
    scheduledTotemAnimation,
    totemPalette,
    TOTEM_ANIMATION_FPS,
    type TotemSpec,
} from './aperoTotems';
import type {AperoStatus} from '../../types/api';

export interface AperoMarkerLayerProps {
    /** Une feuille portée dans body ne doit pas survivre à la carte masquée. */
    enabled?: boolean;
    squadDetails: SquadDetails | null | undefined;
    handleBeerCallClick: (call: BeerCall) => void;
    openCamera: (location?: {lng: number; lat: number}, apero?: BeerCall) => void;
    setIsWorldsModalOpen: (id: string) => void;
    cancelLongPress: () => void;
}

type AperoGroupEntry = Extract<AperoEntry, {kind: 'group'}>;

interface SheetState {
    ids: string[];
    trigger: HTMLElement | null;
}

interface Blueprint {
    entry: AperoEntry;
    key: string;
    frames: TotemSpec[];
    animated: boolean;
}

interface MapEvent {
    sourceId?: string;
    point?: {x: number; y: number};
    features?: Array<{properties?: Record<string, unknown> | null}>;
}

interface NativeTotemMap {
    on(event: string, handler: (event: MapEvent) => void): void;
    on(event: string, layer: string, handler: (event: MapEvent) => void): void;
    off(event: string, handler: (event: MapEvent) => void): void;
    off(event: string, layer: string, handler: (event: MapEvent) => void): void;
    getZoom(): number;
    getBearing(): number;
    easeTo(options: Record<string, unknown>): void;
    cameraForBounds(bounds: unknown, options: Record<string, unknown>):
        {center?: [number, number]; zoom?: number} | null | undefined;
    getCanvas?: () => {style: {cursor: string}};
    getStyle?: () => {layers?: Array<{id: string}>} | undefined;
    getSource: (id: string) => {setData?: (data: unknown) => void} | undefined;
    addSource: (id: string, source: unknown) => void;
    removeSource: (id: string) => void;
    getLayer: (id: string) => unknown;
    addLayer: (layer: unknown, before?: string) => void;
    moveLayer: (id: string, before?: string) => void;
    removeLayer: (id: string) => void;
    addImage: (id: string, image: unknown, options?: {pixelRatio?: number}) => void;
    hasImage: (id: string) => boolean;
    removeImage: (id: string) => void;
    updateImage: (id: string, image: unknown) => void;
    triggerRepaint: () => void;
    queryRenderedFeatures: (point: unknown, options?: {layers?: string[]}) => unknown[];
    isStyleLoaded?: () => boolean;
}

const SOURCE_ID = 'apero-totems';
const LAYER_ID = 'apero-totems';

/** Map.remove() détruit le style avant certains cleanups React enfants. */
function hasTotemStyle(map: NativeTotemMap): boolean {
    return !map.getStyle || Boolean(map.getStyle());
}

function loadTotemImage(svg: string): Promise<ImageData> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => {
            try {
                // Rasterisation hors de la boucle d'animation : updateImage
                // reçoit ensuite un tampon RGBA, sans canvas/readback par tick.
                const canvas = document.createElement('canvas');
                canvas.width = image.naturalWidth;
                canvas.height = image.naturalHeight;
                const context = canvas.getContext('2d', {willReadFrequently: true});
                if (!context) throw new Error('Décodage 2D des totems indisponible');
                context.drawImage(image, 0, 0);
                resolve(context.getImageData(0, 0, canvas.width, canvas.height));
            } catch (error) { reject(error); }
        };
        image.onerror = () => reject(new Error('Image de totem illisible'));
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
}

const STATUS_WORD: Record<AperoStatus, string> = {
    active: 'actif',
    scheduled: 'programmé',
    ended: 'passé',
    cancelled: 'passé',
};

function displayStatus(status: AperoStatus): AperoStatus {
    return status === 'active' || status === 'scheduled' ? status : 'ended';
}

function groupAriaLabel(entry: AperoGroupEntry): string {
    const display = [...new Set(entry.statuses.map(displayStatus))];
    const words = display.map((status) => STATUS_WORD[status] ?? STATUS_WORD.ended);
    const joined = words.length <= 1
        ? words[0] ?? ''
        : `${words.slice(0, -1).join(', ')} et ${words[words.length - 1]}`;
    const summary = display.length ? ` Dont ${joined}.` : '';
    return `${entry.calls.length} apéros regroupés.${entry.canExpand
        ? ' Appuyer pour agrandir.'
        : ' Appuyer pour choisir un apéro.'}${summary}`;
}

/**
 * 14e — totems d'apéros dessinés dans la carte, **sous** la couche avatars.
 *
 * Les boutons DOM restants sont des proxys transparents : ils portent les
 * libellés accessibles et le focus clavier, jamais les clics pointeur (qui
 * passent par les features de la carte, donc après les avatars au-dessus).
 */
export function AperoMarkerLayer(props: AperoMarkerLayerProps) {
    return <AperoMarkerContents key={`${props.squadDetails?.id ?? 'none'}:${props.enabled ?? true}`} {...props} />;
}

function AperoMarkerContents({
    enabled = true,
    squadDetails,
    handleBeerCallClick,
    openCamera,
    setIsWorldsModalOpen,
    cancelLongPress,
}: AperoMarkerLayerProps) {
    const maps = useMap();
    const mapRef = maps.current ?? Object.values(maps).find((entry) => entry != null);
    const native = (mapRef?.getMap?.() ?? null) as NativeTotemMap | null;

    const [bucket, setBucket] = useState(() => zoomBucket(native?.getZoom?.() ?? 14));
    const bucketRef = useRef(bucket);
    const [styleEpoch, setStyleEpoch] = useState(0);

    useEffect(() => {
        if (!native) return;
        const update = () => {
            const next = zoomBucket(native.getZoom());
            if (next === bucketRef.current) return;
            bucketRef.current = next;
            setBucket(next);
        };
        update();
        native.on('zoom', update);
        native.on('moveend', update);
        return () => {
            native.off('zoom', update);
            native.off('moveend', update);
        };
    }, [native]);

    const points = useMemo(() => buildAperoPoints(squadDetails ?? {}), [squadDetails]);
    const index = useMemo(() => createAperoIndex(points), [points]);
    const entries = useMemo(
        () => composeAperoEntries(points, bucket, index),
        [points, bucket, index],
    );

    const sourceById = useMemo(() => {
        const sources = new Map<string, AperoCallKind>();
        const selected = new Map(points.map((point) => [point.id, point.call]));
        const add = (calls: readonly BeerCall[] | null | undefined, kind: AperoCallKind) => {
            for (const call of calls ?? []) {
                if (selected.get(call.id) === call && !sources.has(call.id)) sources.set(call.id, kind);
            }
        };
        add(squadDetails?.active_beer_call, 'active');
        add(squadDetails?.scheduled_beer_calls, 'scheduled');
        add(squadDetails?.past_beer_calls, 'past');
        return sources;
    }, [squadDetails, points]);

    const kindOf = useCallback((call: BeerCall): AperoCallKind => {
        const known = sourceById.get(call.id);
        if (known) return known;
        if (call.status === 'active') return 'active';
        if (call.status === 'scheduled') return 'scheduled';
        return 'past';
    }, [sourceById]);

    const activate = useCallback((call: BeerCall) => {
        const kind = kindOf(call);
        if (kind === 'active') {
            handleBeerCallClick(call);
            return;
        }
        if (kind === 'scheduled') {
            openCamera({lng: Number(call.longitude), lat: Number(call.latitude)}, call);
            return;
        }
        setIsWorldsModalOpen(call.id);
    }, [kindOf, handleBeerCallClick, openCamera, setIsWorldsModalOpen]);

    const [sheet, setSheet] = useState<SheetState | null>(null);
    const closeSheet = useCallback(() => setSheet(null), []);
    const sheetIds = new Set(sheet?.ids);
    const sheetCalls = points.filter((point) => sheetIds.has(point.id)).map((point) => point.call);
    if (sheet && sheetCalls.length !== sheet.ids.length) {
        setSheet(sheetCalls.length ? {...sheet, ids: sheetCalls.map((call) => call.id)} : null);
    }

    const expandGroup = useCallback((entry: AperoGroupEntry, trigger: HTMLElement | null) => {
        if (!enabled) return;
        const openSheet = () => setSheet({ids: entry.calls.map((call) => call.id), trigger});
        const currentZoom = native?.getZoom?.() ?? bucket;
        if (!native || currentZoom >= APERO_EXPAND_MAX_ZOOM || allSameAperoPoint(entry.calls)) {
            openSheet();
            return;
        }
        const camera = native.cameraForBounds?.(boundsOfCalls(entry.calls), {
            padding: APERO_EXPAND_PADDING,
            maxZoom: APERO_EXPAND_MAX_ZOOM,
            bearing: native.getBearing(),
        });
        const targetZoom = Math.min(APERO_EXPAND_MAX_ZOOM, camera?.zoom ?? currentZoom + 1);
        if (!camera || targetZoom <= currentZoom + APERO_EXPAND_MIN_ADVANCE) {
            openSheet();
            return;
        }
        const reduced = typeof window !== 'undefined'
            && typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        native.easeTo({
            center: camera.center ?? entry.coordinates,
            zoom: targetZoom,
            duration: reduced ? 0 : APERO_EXPAND_DURATION_MS,
            essential: false,
        });
    }, [bucket, enabled, native]);

    const entriesRef = useRef(entries);
    const activateRef = useRef(activate);
    const expandRef = useRef(expandGroup);
    useEffect(() => {
        entriesRef.current = entries;
    }, [entries]);
    useEffect(() => {
        activateRef.current = activate;
    }, [activate]);
    useEffect(() => {
        expandRef.current = expandGroup;
    }, [expandGroup]);
    const proxyRefs = useRef(new Map<string, HTMLButtonElement>());
    const imageKeysRef = useRef(new Set<string>());
    const frameImagesRef = useRef(new Map<string, ImageData[]>());
    const [failedEntries, setFailedEntries] = useState<Set<string>>(() => new Set());

    // Source + couche de totems, placées sous la première couche d'avatars.
    useEffect(() => {
        if (!native || !enabled) return;
        const map = native;
        let disposed = false;
        let orderVerified = false;
        const ensure = (): boolean => {
            if (disposed || !hasTotemStyle(map)) return false;
            if (map.isStyleLoaded && !map.isStyleLoaded()) return false;
            let added = false;
            if (!map.getSource(SOURCE_ID)) {
                map.addSource(SOURCE_ID, {
                    type: 'geojson',
                    data: {type: 'FeatureCollection', features: []},
                });
                added = true;
            }
            const before = map.getLayer(SNAP_LAYER_IDS.bases) ? SNAP_LAYER_IDS.bases : undefined;
            if (!map.getLayer(LAYER_ID)) {
                map.addLayer({
                    id: LAYER_ID,
                    type: 'symbol',
                    source: SOURCE_ID,
                    layout: {
                        'icon-image': ['get', 'icon'],
                        'icon-anchor': 'bottom',
                        'icon-allow-overlap': true,
                        'icon-ignore-placement': true,
                    },
                    paint: {'icon-opacity': 1},
                }, before);
                added = true;
            } else if (before) {
                const layers = map.getStyle?.()?.layers ?? [];
                const index = layers.findIndex((layer) => layer.id === LAYER_ID);
                const beforeIndex = layers.findIndex((layer) => layer.id === before);
                if (index >= 0 && beforeIndex >= 0 && index > beforeIndex) map.moveLayer(LAYER_ID, before);
            }
            orderVerified = Boolean(before);
            return added;
        };
        const ensureAndNotify = () => {
            if (ensure()) setStyleEpoch((value) => value + 1);
        };
        const onStyle = () => {
            orderVerified = false;
            ensureAndNotify();
        };
        const onIdle = () => { if (!orderVerified) ensureAndNotify(); };
        const onRender = () => {
            if (ensure()) {
                setStyleEpoch((value) => value + 1);
            }
            if (hasTotemStyle(map) && map.getLayer(LAYER_ID)) map.off('render', onRender);
        };
        const onClick = (event: MapEvent) => {
            const id = event.features?.[0]?.properties?.entryId;
            if (typeof id !== 'string') return;
            // Seules les couches dotées du handler de profil doivent gagner
            // le tap ; une ombre/base seule n'a pas d'action de sélection.
            const avatarLayers = [SNAP_LAYER_IDS.avatars, SNAP_LAYER_IDS.labels]
                .filter((layer) => map.getLayer(layer));
            if (avatarLayers.length && event.point
                && map.queryRenderedFeatures(event.point, {layers: avatarLayers}).length) {
                return;
            }
            const entry = entriesRef.current.find((item) => item.id === id);
            if (!entry) return;
            if (entry.kind === 'group') {
                expandRef.current(entry, proxyRefs.current.get(entry.id) ?? null);
            } else {
                activateRef.current(entry.call);
            }
        };
        const onEnter = () => {
            const canvas = map.getCanvas?.();
            if (canvas) canvas.style.cursor = 'pointer';
        };
        const onLeave = () => {
            const canvas = map.getCanvas?.();
            if (canvas) canvas.style.cursor = '';
        };
        const added = ensure();
        if (!added) map.on('render', onRender);
        map.on('styledata', onStyle);
        map.on('idle', onIdle);
        map.on('click', LAYER_ID, onClick);
        map.on('mouseenter', LAYER_ID, onEnter);
        map.on('mouseleave', LAYER_ID, onLeave);
        return () => {
            disposed = true;
            map.off('styledata', onStyle);
            map.off('idle', onIdle);
            map.off('render', onRender);
            map.off('click', LAYER_ID, onClick);
            map.off('mouseenter', LAYER_ID, onEnter);
            map.off('mouseleave', LAYER_ID, onLeave);
        };
    }, [native, enabled]);

    // Images des totems et données de la source, sans jamais créer de DOM visible.
    useEffect(() => {
        if (!native || !enabled || !hasTotemStyle(native)) return;
        const map = native;
        if (!map.getSource(SOURCE_ID) || !map.getLayer(LAYER_ID)) return;
        let cancelled = false;
        const blueprints = entries.map((entry): Blueprint => {
            if (entry.kind === 'group') {
                const live = groupLive(entry.statuses);
                const palette = totemPalette(squadDetails?.color, !live);
                const spec = groupTotemSpec(entry.calls.length, palette);
                return {entry, key: spec.key, frames: [spec], animated: false};
            }
            const kind = kindOf(entry.call);
            const palette = totemPalette(squadDetails?.color, kind === 'past');
            if (kind === 'active') {
                const animation = activeTotemAnimation(palette);
                return {entry, key: animation.key, frames: animation.frames, animated: true};
            }
            if (kind === 'scheduled') {
                const animation = scheduledTotemAnimation(palette);
                return {entry, key: animation.key, frames: animation.frames, animated: true};
            }
            const spec = pastTotemSpec();
            return {entry, key: spec.key, frames: [spec], animated: false};
        });

        const run = async () => {
            for (const {key, frames} of blueprints) {
                try {
                    const images = frameImagesRef.current.get(key)
                        ?? await Promise.all(frames.map((frame) => loadTotemImage(frame.svg)));
                    if (cancelled || !hasTotemStyle(map)) return;
                    if (!map.hasImage(key)) {
                        map.addImage(key, images[0], {pixelRatio: 2});
                    }
                    frameImagesRef.current.set(key, images);
                } catch (error) {
                    if (cancelled) return;
                    console.warn('[apero-totems] Image indisponible, bouton de secours affiché', key, error);
                }
            }
            if (cancelled || !hasTotemStyle(map)) return;
            const source = map.getSource(SOURCE_ID);
            source?.setData?.({
                type: 'FeatureCollection',
                features: blueprints.filter(({key}) => map.hasImage(key)).map(({entry, key}) => ({
                    type: 'Feature',
                    id: entry.id,
                    properties: {entryId: entry.id, icon: key},
                    geometry: {type: 'Point', coordinates: entry.coordinates},
                })),
            });
            const used = new Set(blueprints.map(({key}) => key));
            for (const key of imageKeysRef.current) {
                if (!used.has(key)) {
                    if (map.hasImage(key)) map.removeImage(key);
                    frameImagesRef.current.delete(key);
                    imageKeysRef.current.delete(key);
                }
            }
            for (const key of used) imageKeysRef.current.add(key);
            const failed = new Set(blueprints.filter(({key}) => !map.hasImage(key)).map(({entry}) => entry.id));
            setFailedEntries((previous) => previous.size === failed.size && [...failed].every((id) => previous.has(id)) ? previous : failed);
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [native, enabled, entries, kindOf, squadDetails?.color, styleEpoch]);

    // Une horloge bornée pour les seules icônes animées rendues dans le viewport.
    // Aucun état React ni rasterisation par frame ; un seul repaint par tick.
    useEffect(() => {
        if (!native || !enabled) return;
        const keys = new Set<string>();
        for (const entry of entries) {
            if (entry.kind === 'group') continue;
            const kind = kindOf(entry.call);
            if (kind === 'active') {
                keys.add(activeTotemAnimation(totemPalette(squadDetails?.color)).key);
            } else if (kind === 'scheduled') {
                keys.add(scheduledTotemAnimation(totemPalette(squadDetails?.color)).key);
            }
        }
        if (keys.size === 0) return;
        const media = typeof window.matchMedia === 'function'
            ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
        let phase = 0;
        let timer: number | undefined;
        let visibleKeys = new Set<string>();
        let dirty = true;
        let forceRefresh = true;
        let lastVisibilityCheck = Number.NEGATIVE_INFINITY;
        const written = new Map<string, number>();
        const ready = () => native.isStyleLoaded ? native.isStyleLoaded() : hasTotemStyle(native);
        const stop = () => {
            if (timer !== undefined) window.clearInterval(timer);
            timer = undefined;
        };
        const updateFrames = () => {
            if (!ready()) return;
            let changed = false;
            for (const key of visibleKeys) {
                const images = frameImagesRef.current.get(key);
                if (!images || images.length < 2 || !native.hasImage(key)) continue;
                const frame = phase % images.length;
                if (written.get(key) === frame) continue;
                native.updateImage(key, images[frame]);
                written.set(key, frame);
                changed = true;
            }
            // updateImage ne programme pas lui-même le prochain rendu MapLibre.
            if (changed) native.triggerRepaint();
        };
        const refreshVisibility = () => {
            dirty = false;
            forceRefresh = false;
            lastVisibilityCheck = performance.now();
            if (document.hidden || !ready() || !native.getLayer(LAYER_ID)) {
                // Le layer ou le style peut arriver après ce passage : la
                // prochaine frame doit retenter au lieu de consommer l'essai.
                dirty = true;
                visibleKeys.clear();
                stop();
                return;
            }
            const features = native.queryRenderedFeatures(undefined, {layers: [LAYER_ID]}) as NonNullable<MapEvent['features']>;
            visibleKeys = new Set(features.map((feature) => feature.properties?.icon)
                .filter((key): key is string => typeof key === 'string' && keys.has(key)));
            if (!visibleKeys.size || media?.matches) {
                stop();
                phase = 0;
                if (visibleKeys.size) updateFrames();
                return;
            }
            if (timer === undefined) {
                timer = window.setInterval(() => { phase += 1; updateFrames(); }, 1000 / TOTEM_ANIMATION_FPS);
            }
        };
        const onRender = () => {
            if (dirty && (forceRefresh || performance.now() - lastVisibilityCheck >= 100)) refreshVisibility();
        };
        const onMove = () => { dirty = true; };
        const onMoveEnd = () => {
            dirty = true;
            forceRefresh = true;
            refreshVisibility();
        };
        const onSource = (event: MapEvent) => {
            if (event.sourceId === SOURCE_ID) { dirty = true; forceRefresh = true; }
        };
        // MapLibre passe `idle` juste après le rendu des nouvelles données :
        // c'est le moment fiable pour mesurer les totems réellement placés,
        // même sans le moindre geste de caméra.
        const onIdle = () => {
            if (timer === undefined) {
                dirty = true;
                forceRefresh = true;
                refreshVisibility();
            }
        };
        const sync = () => {
            refreshVisibility();
            // Une dernière frame force la mesure après placement, sans boucle
            // permanente lorsque les totems sont tous hors écran.
            dirty = true;
            forceRefresh = true;
            if (!document.hidden) native.triggerRepaint();
        };
        native.on('render', onRender);
        native.on('move', onMove);
        native.on('moveend', onMoveEnd);
        native.on('sourcedata', onSource);
        native.on('idle', onIdle);
        media?.addEventListener?.('change', sync);
        document.addEventListener('visibilitychange', sync);
        sync();
        return () => {
            stop();
            native.off('render', onRender);
            native.off('move', onMove);
            native.off('moveend', onMoveEnd);
            native.off('sourcedata', onSource);
            native.off('idle', onIdle);
            media?.removeEventListener?.('change', sync);
            document.removeEventListener('visibilitychange', sync);
        };
    }, [native, enabled, entries, kindOf, squadDetails?.color, styleEpoch]);

    useEffect(() => () => {
        if (native && hasTotemStyle(native)) {
            if (native.getLayer(LAYER_ID)) native.removeLayer(LAYER_ID);
            if (native.getSource(SOURCE_ID)) native.removeSource(SOURCE_ID);
            for (const key of imageKeysRef.current) {
                if (native.hasImage(key)) native.removeImage(key);
            }
        }
        imageKeysRef.current.clear();
        frameImagesRef.current.clear();
    }, [native]);

    return (
        <>
            {enabled && entries.map((entry) => {
                const isGroup = entry.kind === 'group';
                const kind = isGroup ? 'group' : kindOf(entry.call);
                const label = isGroup
                    ? groupAriaLabel(entry)
                    : kind === 'active'
                        ? `Voir l'apéro ${entry.call.location_name} · ${activeLabel(entry.call.participants_count)}`
                        : kind === 'scheduled'
                            ? `Participer à l'apéro ${entry.call.location_name} à ${clockLabel(entry.call.scheduled_for)}`
                            : `Voir le monde de ${entry.call.location_name} · ${pastLabel(entry.call.ended_at ?? entry.call.started_at)}`;
                const zIndex = isGroup ? 58 : kind === 'scheduled' ? 55 : kind === 'past' ? 30 : 60;
                return (
                    <Marker key={`proxy-${entry.id}`} longitude={entry.coordinates[0]}
                            latitude={entry.coordinates[1]} anchor="bottom"
                            style={{zIndex, pointerEvents: failedEntries.has(entry.id) ? 'auto' : 'none'}}>
                        <button
                            ref={(element) => {
                                if (element) proxyRefs.current.set(entry.id, element);
                                else proxyRefs.current.delete(entry.id);
                            }}
                            type="button"
                            data-apero-marker={isGroup ? 'group' : 'single'}
                            data-apero-status={isGroup ? undefined : kind}
                            data-apero-proxy={entry.id}
                            data-apero-fallback={failedEntries.has(entry.id) || undefined}
                            aria-label={label}
                            className={`apero-proxy${failedEntries.has(entry.id) ? ' apero-proxy--fallback' : ''}`}
                            onPointerDown={(event) => { cancelLongPress(); event.stopPropagation(); }}
                            onClick={(event) => {
                                event.stopPropagation();
                                if (isGroup) {
                                    expandGroup(entry, proxyRefs.current.get(entry.id) ?? null);
                                } else {
                                    activate(entry.call);
                                }
                            }}
                        >{failedEntries.has(entry.id) ? isGroup ? entry.calls.length : '🍺' : null}</button>
                    </Marker>
                );
            })}

            {enabled && sheet && sheetCalls.length > 0 && (
                <AperoMemberSheet
                    calls={sheetCalls}
                    kindOf={kindOf}
                    returnFocus={sheet.trigger}
                    onClose={closeSheet}
                    onSelect={(call) => {
                        activate(call);
                        closeSheet();
                    }}
                />
            )}
        </>
    );
}
