import React, { Suspense } from 'react';
import {createPortal} from 'react-dom';
import Map, { Marker, NavigationControl, type MapRef, type MapLayerMouseEvent, type MapLayerTouchEvent } from 'react-map-gl/maplibre';
import { motion } from 'framer-motion';
import { User as UserIcon, RefreshCw } from 'lucide-react';
import { ScheduledMarkerCountdown } from '../UI/ScheduledMarkerCountdown';
import AvatarLoadingIndicator from './AvatarLoadingIndicator';
import type { BeerCall, SquadDetails, Profile } from '../../types/dashboard';
import { QueryClientContext } from '@tanstack/react-query';
import { useLocationStore } from '../../store/useLocationStore';
import { recordSceneSignal, registerSceneInstance, unregisterSceneInstance, invalidateSceneInstance, allocateSceneInstanceId } from '../../lib/sceneMetrics';
import SafeAvatar from '../3D/SafeAvatar';

interface NativeMap {
    on?: (event: string, fn: (evt?: unknown) => void) => void;
    off?: (event: string, fn: (evt?: unknown) => void) => void;
    resize?: () => void;
    triggerRepaint?: () => void;
    stop?: () => void;
    getCenter?: () => {lng: number; lat: number};
    getZoom?: () => number;
    getBearing?: () => number;
    getPitch?: () => number;
}
type MapView = {longitude: number; latitude: number; zoom: number; bearing: number; pitch: number};
function readMapView(map: NativeMap | null): MapView | undefined {
    try {
        const center = map?.getCenter?.();
        const view = {longitude: center?.lng, latitude: center?.lat, zoom: map?.getZoom?.(), bearing: map?.getBearing?.(), pitch: map?.getPitch?.()};
        return Object.values(view).every(value => typeof value === 'number' && Number.isFinite(value)) ? view as MapView : undefined;
    } catch { return undefined; }
}

// MapLibre retire son style pendant contextlost. react-map-gl ne protège pas
// setProps contre ce style null : ne pas rerendre l'adaptateur avant restored
// puis idle. Le slot de contexte garde les enfants à jour sans rerendre Map.
const MapContentsContext = React.createContext<React.ReactNode>(null);
function MapContents() {
    return React.useContext(MapContentsContext);
}
const RetainedNativeMap = React.memo(function RetainedNativeMap({ element }: {
    element: React.ReactElement;
    frozen: boolean;
}) {
    return element;
}, (previous, next) => next.frozen && previous.element.key === next.element.key);

interface MapSectionProps {
    mapRef: React.RefObject<MapRef | null>;
    userLocation: { lat: number; lng: number } | null;
    canCreateFromLocation?: boolean;
    isNightMode: boolean;
    isMapReady?: boolean;
    handleMapLoaded?: () => void;
    active?: boolean;
    visible?: boolean;
    squadDetails: SquadDetails | null | undefined;
    profile: Profile | null | undefined;
    handleMapPointerDown: (event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement> | unknown) => void;
    cancelLongPress: (event?: unknown) => void;
    handleMapPointerMove: (event: MapLayerMouseEvent) => void;
    handleManualRecenter: () => void;
    handleBeerCallClick: (beerCall: BeerCall) => void;
    openCamera: (location?: { lng: number; lat: number }, apero?: BeerCall) => void;
    setIsWorldsModalOpen: (id: string) => void;
}

export const MapSection: React.FC<MapSectionProps> = React.memo(({
    mapRef,
    userLocation,
    canCreateFromLocation = false,
    isNightMode,
    isMapReady,
    handleMapLoaded,
    active = true,
    visible = true,
    squadDetails,
    profile,
    handleMapPointerDown,
    cancelLongPress,
    handleMapPointerMove,
    handleManualRecenter,
    handleBeerCallClick,
    openCamera,
    setIsWorldsModalOpen
}) => {
    const mapStyle = isNightMode
        ? "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
        : "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
    const startTracking = useLocationStore(state => state.startTracking);
    const hasLiveLocation = canCreateFromLocation && userLocation !== null;
    const [hasHadLiveLocation, setHasHadLiveLocation] = React.useState(hasLiveLocation);
    // Ne jamais monter le joueur à partir du cache seul. Après un vrai fix,
    // conserver son Canvas en pause pendant le renouvellement au retour de route.
    if (hasLiveLocation && !hasHadLiveLocation) setHasHadLiveLocation(true);

    // Avec un fix live, le bouton recentre la carte ; sans fix, il relance
    // explicitement l'acquisition GPS sans boucle automatique.
    const handleLocateClick = React.useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (hasLiveLocation) {
            handleManualRecenter();
            return;
        }
        startTracking();
    }, [hasLiveLocation, handleManualRecenter, startTracking]);

    const handlePlayerClick = React.useCallback(() => {
        openCamera();
    }, [openCamera]);

    const handlePointerMove = React.useCallback((event: MapLayerMouseEvent | MapLayerTouchEvent) => {
        handleMapPointerMove?.(event as MapLayerMouseEvent);
    }, [handleMapPointerMove]);

    // WebGL absent (jsdom, navigateur bridé) : inutile de télécharger le chunk 3D.
    const canWarm3d = React.useMemo(
        () => typeof WebGL2RenderingContext !== 'undefined' || typeof WebGLRenderingContext !== 'undefined',
        []
    );
    const queryClient = React.useContext(QueryClientContext);

    // Prépare les FBX pendant l'initialisation de la carte : sans cela, le
    // Canvas attend `onLoad`, puis télécharge et parse encore les modèles.
    React.useEffect(() => {
        if (!visible || !canWarm3d || !profile?.avatar) return;
        let cancelled = false;
        // Loading code/Idle can overlap map style/tiles, not start after onLoad.
        if (queryClient) void import('../../hooks/useAvatarAnimations')
            .then(module => { if (!cancelled) void module.preloadAvatarAnimations(queryClient); })
            .catch(() => {});
        void import('../3D/warmupAvatar')
            .then(module => {
                if (!cancelled) module.warmAvatarModels(profile.avatar);
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [visible, canWarm3d, profile?.avatar, queryClient]);

    const [mapId] = React.useState(() => allocateSceneInstanceId('map'));
    // Avatar bootstrap is independent from current map readiness. A tile/style
    // error must invalidate map metrics, not tear down an already-loaded avatar.
    const [hasMapLoaded, setHasMapLoaded] = React.useState(false);
    const [isMapContextLost, setIsMapContextLost] = React.useState(false);
    const [mapEpoch, setMapEpoch] = React.useState(0);
    const [rebuilding, setRebuilding] = React.useState(false);
    const [initialMapView, setInitialMapView] = React.useState<MapView>(() => ({
        longitude: userLocation?.lng ?? 2.3522, latitude: userLocation?.lat ?? 48.8566,
        zoom: userLocation ? 14 : 12, pitch: 45, bearing: 0,
    }));
    const mapInstanceRef = React.useRef<NativeMap | null>(null);
    const retiredMaps = React.useRef(new WeakSet<object>());
    const savedView = React.useRef<MapView | undefined>(undefined);
    const listeners = React.useRef<{map: NativeMap; epoch: number; lost: () => void; restored: () => void} | null>(null);

    const lifecycle = React.useRef<{ generation?: number; mounted: boolean; loaded: boolean; everLoaded: boolean; submitted: boolean;
        suspended: boolean; epoch: number; recovery: 'normal' | 'lost' | 'restoring' | 'rebuilding' }>({
        mounted: false, loaded: false, everLoaded: false, submitted: false, suspended: false, epoch: 0, recovery: 'normal',
    });
    React.useLayoutEffect(() => {
        const state = lifecycle.current;
        state.mounted = true;
        state.generation = registerSceneInstance('dashboard', mapId);
        return () => {
            if (state.generation !== undefined) unregisterSceneInstance('dashboard', mapId, state.generation);
            state.generation = undefined; state.mounted = false; state.loaded = false; state.submitted = false;
            setHasMapLoaded(false);
        };
    }, [mapId]);

    const handleContextLost = React.useCallback(() => {
        const state = lifecycle.current;
        if (!state.mounted || state.recovery === 'lost' || state.recovery === 'rebuilding') return;
        savedView.current = readMapView(mapInstanceRef.current) ?? savedView.current;
        state.recovery = 'lost';
        setIsMapContextLost(true);
        if (state.generation !== undefined) {
            invalidateSceneInstance('dashboard', mapId, state.generation);
        }
        state.submitted = false;
        state.loaded = false;
    }, [mapId]);

    const handleContextRestored = React.useCallback(() => {
        const state = lifecycle.current;
        if (!state.mounted || state.recovery !== 'lost') return;
        state.recovery = 'restoring';
        try {
            mapInstanceRef.current?.resize?.();
            mapInstanceRef.current?.triggerRepaint?.();
        } catch {
            // Tolérance environnements de simulation
        }
        // Réarmer la vérification pour certification au prochain idle valide
        state.loaded = state.everLoaded;
        if (state.loaded && state.generation === undefined) state.generation = registerSceneInstance('dashboard', mapId);
        state.submitted = false;
    }, [mapId]);

    const detachMapInstance = React.useCallback(() => {
        const current = listeners.current;
        current?.map.off?.('webglcontextlost', current.lost);
        current?.map.off?.('webglcontextrestored', current.restored);
        listeners.current = null;
        mapInstanceRef.current = null;
    }, []);
    const attachMapInstance = React.useCallback((map: NativeMap | null) => {
        if (!map || retiredMaps.current.has(map) || map === mapInstanceRef.current) return;
        detachMapInstance();
        mapInstanceRef.current = map;
        const current = () => lifecycle.current.mounted && lifecycle.current.epoch === mapEpoch && mapInstanceRef.current === map;
        const lost = () => { if (current()) handleContextLost(); };
        const restored = () => { if (current()) handleContextRestored(); };
        listeners.current = {map, epoch: mapEpoch, lost, restored};
        map.on?.('webglcontextlost', lost);
        map.on?.('webglcontextrestored', restored);
    }, [detachMapInstance, mapEpoch, handleContextLost, handleContextRestored]);

    const retryMap = React.useCallback(() => {
        const state = lifecycle.current;
        if (!state.mounted || state.recovery !== 'lost') return;
        const map = mapInstanceRef.current;
        const camera = readMapView(map) ?? savedView.current;
        if (camera) setInitialMapView(camera);
        if (map) retiredMaps.current.add(map);
        detachMapInstance();
        state.epoch++;
        state.loaded = false; state.everLoaded = false; state.submitted = false; state.recovery = 'rebuilding';
        setRebuilding(true);
        setMapEpoch(state.epoch);
    }, [detachMapInstance]);

    React.useEffect(() => {
        const map = mapRef.current?.getMap?.() as NativeMap | undefined;
        if (map) attachMapInstance(map);
        return () => {
            if (listeners.current?.epoch === mapEpoch) detachMapInstance();
        };
    }, [mapRef, attachMapInstance, mapEpoch, detachMapInstance]);

    React.useLayoutEffect(() => {
        const update = () => {
            const state = lifecycle.current;
            const suspended = !visible || document.hidden;
            if (suspended && !state.suspended) {
                if (state.generation !== undefined) invalidateSceneInstance('dashboard', mapId, state.generation);
                state.submitted = false;
                mapRef.current?.getMap?.().stop();
            } else if (!suspended && state.suspended) {
                // Keep the same WebGL context/viewport; certify only the next real idle.
                mapRef.current?.resize?.();
                mapRef.current?.getMap?.().triggerRepaint();
            }
            state.suspended = suspended;
        };
        update();
        document.addEventListener('visibilitychange', update);
        return () => document.removeEventListener('visibilitychange', update);
    }, [visible, mapId, mapRef]);
    const handleMapLoad = React.useCallback((event?: { target?: unknown }) => {
        const state = lifecycle.current;
        if (!state.mounted || state.epoch !== mapEpoch || state.recovery === 'lost') return;
        const targetMap = (event?.target ?? mapRef.current?.getMap?.()) as NativeMap | undefined;
        if ((targetMap && retiredMaps.current.has(targetMap)) || (state.recovery === 'rebuilding' && !targetMap)) return;
        if (targetMap) {
            attachMapInstance(targetMap);
        }
        if (state.generation === undefined) state.generation = registerSceneInstance('dashboard', mapId);
        state.loaded = true;
        state.everLoaded = true;
        if (state.recovery === 'rebuilding') state.recovery = 'restoring';
        setHasMapLoaded(true);
        handleMapLoaded?.();
    }, [mapId, mapEpoch, handleMapLoaded, mapRef, attachMapInstance]);
    const handleMapIdle = React.useCallback((event?: {target?: unknown}) => {
        const state = lifecycle.current;
        if (state.epoch !== mapEpoch || (event?.target && event.target !== mapInstanceRef.current)) return;
        if (state.mounted && state.loaded && state.recovery !== 'lost' && state.recovery !== 'rebuilding' && !state.suspended && !document.hidden && state.generation !== undefined) {
            if (!state.submitted) {
                state.submitted = !!recordSceneSignal('mapInteractive', { view: 'dashboard', instanceId: mapId, generation: state.generation });
            }
            setIsMapContextLost(false);
            setRebuilding(false);
            state.recovery = 'normal';
        }
    }, [mapId, mapEpoch]);
    const handleMapError = React.useCallback(() => {
        const state = lifecycle.current;
        if (state.epoch !== mapEpoch) return;
        if (state.generation !== undefined) unregisterSceneInstance('dashboard', mapId, state.generation);
        state.generation = undefined; state.loaded = false; state.submitted = false;
    }, [mapId, mapEpoch]);

    // Sur iPhone (DPR 3), MapLibre rendrait sinon 9 fois plus de pixels que le
    // nécessaire. On plafonne le ratio comme les Canvas 3D et on supprime les
    // fondus de tuiles qui relancent des rendus après chaque interaction.
    const mapRuntimeOptions = React.useMemo(() => ({
        pixelRatio: typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 1.5),
        fadeDuration: 0,
        renderWorldCopies: false,
        refreshExpiredTiles: false,
    }), []);

    const mapElement = (
        <Map key={mapEpoch} ref={mapRef}
            {...mapRuntimeOptions}
            initialViewState={initialMapView}
            mapStyle={mapStyle} interactive={true}
            onLoad={handleMapLoad}
            onIdle={handleMapIdle}
            onError={handleMapError}
            onMouseDown={handleMapPointerDown} onMouseUp={cancelLongPress}
            onMouseMove={handlePointerMove}
            onMouseLeave={cancelLongPress}
            onTouchStart={handleMapPointerDown} onTouchMove={handlePointerMove}
            onTouchEnd={cancelLongPress} onTouchCancel={cancelLongPress}
            onDragStart={cancelLongPress}
            onZoomStart={cancelLongPress}
            onMoveStart={cancelLongPress}>
            <MapContents/>
        </Map>
    );

    return (
        <>
        {visible && isMapContextLost && typeof document !== 'undefined' && createPortal(
            <div role="status" aria-label="Statut carte"
                className="fixed inset-x-4 bottom-[calc(80px+env(safe-area-inset-bottom))] z-[110] flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-950 shadow-lg">
                <p>Carte momentanément indisponible</p>
                <button type="button" disabled={rebuilding}
                    onClick={event => { event.stopPropagation(); retryMap(); }} onKeyDown={event => event.stopPropagation()}
                    className="min-h-11 rounded-lg bg-amber-700 px-3 text-white disabled:opacity-50">Réessayer la carte</button>
            </div>, document.body)}
        <MapContentsContext.Provider value={<>
            {/* BOUTON RECENTRER / RELANCER LA LOCALISATION */}
            <div className="absolute top-[calc(100px+env(safe-area-inset-top))] right-[20px] z-10">
                <button onClick={handleLocateClick}
                        aria-label={hasLiveLocation ? 'Me recentrer' : 'Relancer la localisation'}
                        aria-describedby={hasLiveLocation ? undefined : 'geoloc-retry-hint'}
                        title={hasLiveLocation ? 'Me recentrer' : 'Relancer la localisation'}
                        className={`relative w-[29px] h-[29px] rounded flex items-center justify-center shadow-[0_0_0_2px_rgba(0,0,0,0.1)] active:scale-95 transition-all ${hasLiveLocation ? 'bg-white hover:bg-gray-50' : 'bg-gray-100'}`}>
                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor"
                            strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"
                            className={hasLiveLocation ? 'text-gray-700' : 'text-gray-400'}>
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="16"></line>
                        <line x1="8" y1="12" x2="16" y2="12"></line>
                    </svg>
                    {!hasLiveLocation && (
                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-white flex items-center justify-center shadow-sm">
                            <RefreshCw size={10} className="text-beer-light" aria-hidden="true"/>
                        </span>
                    )}
                </button>
                {!hasLiveLocation && <span id="geoloc-retry-hint" className="sr-only">Relance la recherche GPS</span>}
            </div>

            <NavigationControl position="top-right" style={{
                marginTop: 'calc(135px + env(safe-area-inset-top))',
                marginRight: '20px'
            }}/>

            {/* MARQUEURS ACTIFS */}
            {squadDetails?.active_beer_call?.map((call: BeerCall) => {
                const numLng = Number(call.longitude);
                const numLat = Number(call.latitude);
                if (isNaN(numLng) || isNaN(numLat)) return null;

                return (
                    <Marker key={`active-${call.id}`} longitude={numLng} latitude={numLat}
                            anchor="bottom" style={{zIndex: 60}}>
                        <div onClick={(e) => {
                            e.stopPropagation();
                            handleBeerCallClick(call);
                        }}
                                className="relative flex items-center justify-center cursor-pointer group pb-2">

                            {/* L'onde radar orange */}
                            <div
                                className="absolute top-1 w-8 h-8 rounded-full animate-ping opacity-60 z-0 bg-amber-500"/>

                            {/* La pastille */}
                            <motion.div whileHover={{scale: 1.1, y: -4}} whileTap={{scale: 0.9}}
                                        className="relative z-10 w-10 h-10 rounded-full shadow-lg flex items-center justify-center border-2 backdrop-blur-md transition-all bg-amber-500 text-white border-white shadow-amber-500/40">
                                <span className="text-lg drop-shadow-sm leading-none">🍻</span>
                                {/* Petit point de notification (pour dire 'c'est en cours') */}
                                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                    <span
                                        className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-300 opacity-75"></span>
                                    <span
                                        className="relative inline-flex rounded-full h-3 w-3 bg-amber-200"></span>
                                </span>
                            </motion.div>

                            {/* Le pointeur GPS */}
                            <div
                                className="absolute -bottom-1 w-3 h-3 rotate-45 rounded-sm shadow-sm transition-all z-0 bg-amber-500 border-r border-b border-white"/>
                        </div>
                    </Marker>
                );
            })}

            {/* MARQUEURS PROGRAMMÉS */}
            {squadDetails?.scheduled_beer_calls?.map((call: BeerCall) => {
                const lng = Number(call.longitude), lat = Number(call.latitude);
                if (isNaN(lng) || isNaN(lat)) return null;
                return <Marker key={`scheduled-${call.id}`} longitude={lng} latitude={lat}
                                anchor="bottom" style={{zIndex: 55}}>
                    <ScheduledMarkerCountdown
                        scheduledFor={call.scheduled_for || ''}
                        onClick={(e) => {
                            e.stopPropagation();
                            openCamera({ lat, lng }, call);
                        }}
                    />
                </Marker>;
            })}

            {/* Joueur utilisable uniquement sur fix live ; Canvas conservé en pause sinon. */}
            {hasHadLiveLocation && userLocation && (
                <Marker longitude={userLocation.lng} latitude={userLocation.lat} anchor="bottom"
                        style={{zIndex: 50}}>
                    <div onClick={hasLiveLocation ? handlePlayerClick : undefined}
                         role={hasLiveLocation ? 'button' : undefined} tabIndex={hasLiveLocation ? 0 : -1}
                         aria-label={hasLiveLocation ? 'Créer un Beer Call' : undefined}
                         aria-hidden={!hasLiveLocation} inert={!hasLiveLocation}
                         onKeyDown={(event) => {
                             if (!hasLiveLocation) return;
                             if (event.key === 'Enter' || event.key === ' ') {
                                 event.preventDefault();
                                 handlePlayerClick();
                             }
                         }}
                            className={`relative flex flex-col items-center cursor-pointer group rounded-full p-2 after:content-[''] after:absolute after:inset-1 after:rounded-full after:animate-soft-pulse after:z-[-1] animate-in fade-in zoom-in-50 duration-500 delay-300 fill-mode-both ${hasLiveLocation ? '' : 'invisible pointer-events-none'}`}>
                        <div
                            className="absolute -top-7 px-3 py-1 bg-white/70 backdrop-blur-sm rounded-full shadow-sm border border-gray-100 transition-opacity opacity-100 group-hover:opacity-100 group-hover:scale-105 group-hover:bg-white group-hover:border-beer pointer-events-none whitespace-nowrap">
                            <span
                                className="text-[10px] font-black uppercase tracking-widest text-gray-500 group-hover:text-beer transition-colors">📸🍻</span>
                        </div>
                        <div className="relative w-24 h-32 flex items-end justify-center pb-2">
                            <div className="absolute inset-0 pointer-events-none">
                                {profile?.avatar ? (
                                    (hasMapLoaded || Boolean(isMapReady)) ? (
                                        <Suspense fallback={<AvatarLoadingIndicator phase="canvas-suspense"/>}>
                                            <SafeAvatar config={profile.avatar} renderMode="shared" disableZoom={true} disablePan={true} view="dashboard" active={active && hasLiveLocation}/>
                                        </Suspense>
                                    ) : (
                                        <AvatarLoadingIndicator phase="map-bootstrap"/>
                                    )
                                ) : (
                                    <UserIcon size={32} className="text-beer drop-shadow-xl m-auto mt-10"/>
                                )}
                            </div>
                        </div>
                    </div>
                </Marker>
            )}

            {/* MARQUEURS PASSÉS */}
            {squadDetails?.past_beer_calls?.map((call: BeerCall) => {
                const numLng = Number(call.longitude);
                const numLat = Number(call.latitude);
                if (isNaN(numLng) || isNaN(numLat)) return null;

                return (
                    <Marker key={`past-${call.id}`} longitude={numLng} latitude={numLat}
                            anchor="bottom" style={{zIndex: 30}}>
                        <div onClick={(e) => {
                            e.stopPropagation();
                            setIsWorldsModalOpen(call.id);
                        }}
                                className="relative flex items-center justify-center cursor-pointer group pb-2 opacity-60 hover:opacity-100 transition-opacity">
                            <motion.div whileHover={{scale: 1.1, y: -4}} whileTap={{scale: 0.9}}
                                        className="relative z-10 w-8 h-8 rounded-full shadow-sm flex items-center justify-center border-2 backdrop-blur-sm transition-all bg-gray-400 text-white border-white">
                                <span className="text-sm drop-shadow-sm leading-none">👻</span>
                            </motion.div>
                            <div
                                className="absolute -bottom-1 w-2.5 h-2.5 rotate-45 rounded-sm shadow-sm transition-all z-0 bg-gray-400 border-r border-b border-white"/>
                        </div>
                    </Marker>
                );
            })}
        </>}>
            <RetainedNativeMap element={mapElement} frozen={isMapContextLost}/>
        </MapContentsContext.Provider>
        </>
    );
});
