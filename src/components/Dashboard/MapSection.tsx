import React, { Suspense } from 'react';
import Map, { Marker, NavigationControl, type MapRef, type MapLayerMouseEvent, type MapLayerTouchEvent } from 'react-map-gl/maplibre';
import { motion } from 'framer-motion';
import { User as UserIcon, RefreshCw } from 'lucide-react';
import { ScheduledMarkerCountdown } from '../UI/ScheduledMarkerCountdown';
import AvatarLoadingIndicator from './AvatarLoadingIndicator';
import type { BeerCall, SquadDetails, Profile } from '../../types/dashboard';
import { QueryClientContext } from '@tanstack/react-query';
import { useLocationStore } from '../../store/useLocationStore';
import { recordSceneSignal, registerSceneInstance, unregisterSceneInstance, invalidateSceneInstance, allocateSceneInstanceId } from '../../lib/sceneMetrics';
import SafeAvatar, { preloadAvatarCanvas } from '../3D/SafeAvatar';

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
}, (_previous, next) => next.frozen);

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
        void preloadAvatarCanvas().catch(() => {});
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
    const mapInstanceRef = React.useRef<{
        on?: (event: string, fn: (evt?: unknown) => void) => void;
        off?: (event: string, fn: (evt?: unknown) => void) => void;
        resize?: () => void;
        triggerRepaint?: () => void;
        stop?: () => void;
    } | null>(null);

    const lifecycle = React.useRef<{ generation?: number; mounted: boolean; loaded: boolean; submitted: boolean; suspended: boolean }>({ mounted: false, loaded: false, submitted: false, suspended: false });
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
        setIsMapContextLost(true);
        const state = lifecycle.current;
        if (state.generation !== undefined) {
            invalidateSceneInstance('dashboard', mapId, state.generation);
        }
        state.submitted = false;
        state.loaded = false;
    }, [mapId]);

    const handleContextRestored = React.useCallback(() => {
        const state = lifecycle.current;
        try {
            mapInstanceRef.current?.resize?.();
            mapInstanceRef.current?.triggerRepaint?.();
        } catch {
            // Tolérance environnements de simulation
        }
        // Réarmer la vérification pour certification au prochain idle valide
        state.loaded = true;
        state.submitted = false;
    }, []);

    const attachMapInstance = React.useCallback((map: {
        on?: (event: string, fn: (evt?: unknown) => void) => void;
        off?: (event: string, fn: (evt?: unknown) => void) => void;
        resize?: () => void;
        triggerRepaint?: () => void;
        stop?: () => void;
    } | null) => {
        if (!map || map === mapInstanceRef.current) return;
        if (mapInstanceRef.current) {
            mapInstanceRef.current.off?.('webglcontextlost', handleContextLost);
            mapInstanceRef.current.off?.('webglcontextrestored', handleContextRestored);
        }
        mapInstanceRef.current = map;
        map.on?.('webglcontextlost', handleContextLost);
        map.on?.('webglcontextrestored', handleContextRestored);
    }, [handleContextLost, handleContextRestored]);

    React.useEffect(() => {
        const map = mapRef.current?.getMap?.() as {
            on?: (event: string, fn: (evt?: unknown) => void) => void;
            off?: (event: string, fn: (evt?: unknown) => void) => void;
            resize?: () => void;
            triggerRepaint?: () => void;
            stop?: () => void;
        } | undefined;
        if (map) attachMapInstance(map);
        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.off?.('webglcontextlost', handleContextLost);
                mapInstanceRef.current.off?.('webglcontextrestored', handleContextRestored);
                mapInstanceRef.current = null;
            }
        };
    }, [mapRef, attachMapInstance, handleContextLost, handleContextRestored]);

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
        if (!state.mounted) return;
        const targetMap = (event?.target ?? mapRef.current?.getMap?.()) as {
            on?: (event: string, fn: (evt?: unknown) => void) => void;
            off?: (event: string, fn: (evt?: unknown) => void) => void;
            resize?: () => void;
            triggerRepaint?: () => void;
            stop?: () => void;
        } | undefined;
        if (targetMap) {
            attachMapInstance(targetMap);
        }
        if (state.generation === undefined) state.generation = registerSceneInstance('dashboard', mapId);
        state.loaded = true;
        setHasMapLoaded(true);
        handleMapLoaded?.();
    }, [mapId, handleMapLoaded, mapRef, attachMapInstance]);
    const handleMapIdle = React.useCallback(() => {
        const state = lifecycle.current;
        if (state.mounted && state.loaded && !state.suspended && !document.hidden && state.generation !== undefined) {
            if (!state.submitted) {
                state.submitted = !!recordSceneSignal('mapInteractive', { view: 'dashboard', instanceId: mapId, generation: state.generation });
            }
            setIsMapContextLost(false);
        }
    }, [mapId]);
    const handleMapError = React.useCallback(() => {
        const state = lifecycle.current;
        if (state.generation !== undefined) unregisterSceneInstance('dashboard', mapId, state.generation);
        state.generation = undefined; state.loaded = false; state.submitted = false;
    }, [mapId]);

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
        <Map ref={mapRef}
            {...mapRuntimeOptions}
            initialViewState={{
                longitude: userLocation?.lng || 2.3522,
                latitude: userLocation?.lat || 48.8566,
                zoom: userLocation ? 14 : 12,
                pitch: 45
            }}
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
        <MapContentsContext.Provider value={<>
            
            {/* STATUT CONTEXTE WEBGL PERDU */}
            {isMapContextLost && (
                <div
                    role="status"
                    aria-label="Statut carte"
                    className="absolute inset-x-4 top-[calc(60px+env(safe-area-inset-top))] z-30 p-3 bg-amber-500/95 text-white text-xs font-bold text-center rounded-xl shadow-lg backdrop-blur-sm pointer-events-none transition-all"
                >
                    Carte momentanément indisponible
                </div>
            )}

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
                                            <SafeAvatar config={profile.avatar} disableZoom={true} disablePan={true} view="dashboard" active={active && hasLiveLocation}/>
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
    );
});
