import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Marker, useMap} from 'react-map-gl/maplibre';
import type {BeerCall, SquadDetails} from '../../types/dashboard';
import {ScheduledMarkerCountdown} from '../UI/ScheduledMarkerCountdown';
import {
    APERO_EXPAND_DURATION_MS,
    APERO_EXPAND_MAX_ZOOM,
    APERO_EXPAND_MIN_ADVANCE,
    APERO_EXPAND_PADDING,
    APERO_GROUP_Z_INDEX,
    allSameAperoPoint,
    boundsOfCalls,
    buildAperoPoints,
    composeAperoEntries,
    createAperoIndex,
} from '../../map/snap/aperoClusters';
import type {AperoEntry} from '../../map/snap/aperoClusters';
import {zoomBucket} from '../../map/snap/clusters';
import {AperoGroupMarker} from './AperoGroupMarker';
import {AperoMarkerBadge} from './AperoMarkerVisual';
import {squadAccent, timeAgoLabel} from './aperoMarkerStyle';
import {AperoMemberSheet, type AperoCallKind} from './AperoMemberSheet';

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

/**
 * 14b-2 — couche DOM des apéros : groupes au dézoom, marqueurs individuels au
 * zoom, appui de groupe = caméra ou feuille, aucune fusion métier.
 */
export function AperoMarkerLayer(props: AperoMarkerLayerProps) {
    // La portée de sélection ne survit ni à un changement de squad, ni à une
    // sortie de carte. Seule cette couche DOM est remontée, jamais la carte.
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
    const native = mapRef?.getMap?.() ?? null;

    const [bucket, setBucket] = useState(() => zoomBucket(native?.getZoom?.() ?? 14));
    const bucketRef = useRef(bucket);

    // Un seul abonnement caméra : le handler est O(1) et ne rend qu'au demi-niveau.
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
    // L'index suit l'identité des points, elle-même dérivée de `squadDetails` :
    // pas de cache ref, donc aucun accès à une ref pendant le rendu.
    const index = useMemo(() => createAperoIndex(points), [points]);
    const entries = useMemo(
        () => composeAperoEntries(points, bucket, index),
        [points, bucket, index],
    );

    // Provenance d'affichage : l'action individuelle reste celle du tableau d'origine.
    const sourceById = useMemo(() => {
        const sources = new Map<string, AperoCallKind>();
        const selected = new Map(points.map((point) => [point.id, point.call]));
        const add = (calls: readonly BeerCall[] | null | undefined, kind: AperoCallKind) => {
            for (const call of calls ?? []) {
                // buildAperoPoints peut rejeter un doublon prioritaire invalide.
                // Seul l'objet réellement retenu porte l'action du marqueur.
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
    // Toujours rendre les données courantes, jamais une copie d'apéros conservée
    // à l'ouverture (statut, autorisations, disparition, coordonnées peuvent changer).
    const sheetIds = new Set(sheet?.ids);
    const sheetCalls = points.filter((point) => sheetIds.has(point.id)).map((point) => point.call);
    if (sheet && sheetCalls.length !== sheet.ids.length) {
        // Réconciliation conditionnelle avant commit : un membre retiré ne
        // réapparaît pas dans une ancienne sélection s'il est ajouté plus tard.
        setSheet(sheetCalls.length ? {...sheet, ids: sheetCalls.map((call) => call.id)} : null);
    }

    const expandGroup = (entry: AperoGroupEntry, trigger: HTMLElement | null) => {
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
    };

    const color = squadAccent(squadDetails?.color);

    return (
        <>
            {entries.map((entry) => {
                if (entry.kind === 'group') {
                    return (
                        <Marker key={`group-${entry.id}`} longitude={entry.coordinates[0]}
                                latitude={entry.coordinates[1]} anchor="bottom"
                                style={{zIndex: APERO_GROUP_Z_INDEX}}>
                            <AperoGroupMarker
                                count={entry.calls.length}
                                color={color}
                                statuses={entry.statuses}
                                dominantStatus={entry.dominantStatus}
                                canExpand={entry.canExpand}
                                onPointerDown={(event) => {
                                    cancelLongPress();
                                    event.stopPropagation();
                                }}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    expandGroup(entry, event.currentTarget);
                                }}
                            />
                        </Marker>
                    );
                }

                const call = entry.call;
                const kind = kindOf(call);

                if (kind === 'scheduled') {
                    return (
                        <Marker key={`scheduled-${entry.id}`} longitude={entry.coordinates[0]}
                                latitude={entry.coordinates[1]} anchor="bottom"
                                style={{zIndex: 55}}>
                            <ScheduledMarkerCountdown
                                scheduledFor={call.scheduled_for || ''}
                                color={color}
                                label={call.location_name}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    openCamera({lat: entry.coordinates[1], lng: entry.coordinates[0]}, call);
                                }}
                            />
                        </Marker>
                    );
                }

                if (kind === 'past') {
                    return (
                        <Marker key={`past-${entry.id}`} longitude={entry.coordinates[0]}
                                latitude={entry.coordinates[1]} anchor="bottom"
                                style={{zIndex: 30}}>
                            <button
                                type="button"
                                data-apero-marker="single"
                                data-apero-status="past"
                                aria-label={`Voir le monde de ${call.location_name}`}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setIsWorldsModalOpen(call.id);
                                }}
                                className="group relative flex touch-manipulation items-center justify-center rounded-full opacity-90 transition-all duration-200 hover:scale-105 hover:opacity-100 active:scale-95 motion-reduce:hover:scale-100 motion-reduce:active:scale-100 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/80"
                            >
                                <AperoMarkerBadge
                                    variant="past"
                                    color={color}
                                    pillText={timeAgoLabel(call.ended_at ?? call.started_at)}
                                    pillKind="past"
                                />
                            </button>
                        </Marker>
                    );
                }

                return (
                    <Marker key={`active-${entry.id}`} longitude={entry.coordinates[0]}
                            latitude={entry.coordinates[1]} anchor="bottom"
                            style={{zIndex: 60}}>
                        <button
                            type="button"
                            data-apero-marker="single"
                            data-apero-status="active"
                            aria-label={`Voir l'apéro ${call.location_name}`}
                            onClick={(event) => {
                                event.stopPropagation();
                                handleBeerCallClick(call);
                            }}
                            className="group relative flex touch-manipulation items-center justify-center rounded-full transition-transform duration-200 hover:scale-105 active:scale-95 motion-reduce:hover:scale-100 motion-reduce:active:scale-100 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/80"
                        >
                            <AperoMarkerBadge
                                variant="active"
                                color={color}
                                pillText="EN COURS"
                                pillKind="navy"
                            />
                        </button>
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
