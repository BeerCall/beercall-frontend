import React, { Suspense } from 'react';
import Map, { Marker, NavigationControl, type MapRef } from 'react-map-gl/maplibre';
import { motion } from 'framer-motion';
import { User as UserIcon } from 'lucide-react';
import { ScheduledMarkerCountdown } from '../UI/ScheduledMarkerCountdown';
import type { BeerCall, SquadDetails, Profile } from '../../types/dashboard';
const AvatarCanvas = React.lazy(() => import('../3D/AvatarCanvas'));

interface MapSectionProps {
    mapRef: React.RefObject<MapRef | null>;
    userLocation: { lat: number; lng: number } | null;
    isNightMode: boolean;
    isMapReady: boolean;
    squadDetails: SquadDetails | null | undefined;
    profile: Profile | null | undefined;
    handleMapPointerDown: (event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement> | unknown) => void;
    cancelLongPress: (event?: unknown) => void;
    handleManualRecenter: () => void;
    handleBeerCallClick: (beerCall: BeerCall) => void;
    openCamera: (location?: { lng: number; lat: number }, apero?: BeerCall) => void;
    setIsWorldsModalOpen: (id: string) => void;
}

export const MapSection: React.FC<MapSectionProps> = React.memo(({
    mapRef,
    userLocation,
    isNightMode,
    isMapReady,
    squadDetails,
    profile,
    handleMapPointerDown,
    cancelLongPress,
    handleManualRecenter,
    handleBeerCallClick,
    openCamera,
    setIsWorldsModalOpen
}) => {
    const mapStyle = isNightMode
        ? "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
        : "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

    const handleRecenterClick = React.useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        handleManualRecenter();
    }, [handleManualRecenter]);

    const handlePlayerClick = React.useCallback(() => {
        openCamera();
    }, [openCamera]);

    return (
        <Map ref={mapRef}
            initialViewState={{
                longitude: userLocation?.lng || 2.3522,
                latitude: userLocation?.lat || 48.8566,
                zoom: userLocation ? 14 : 12,
                pitch: 45
            }}
            mapStyle={mapStyle} interactive={true}
            onMouseDown={handleMapPointerDown} onMouseUp={cancelLongPress}
            onMouseLeave={cancelLongPress}
            onTouchStart={handleMapPointerDown} onTouchMove={cancelLongPress}
            onTouchEnd={cancelLongPress}
            onDragStart={cancelLongPress}
            onZoomStart={cancelLongPress}
            onMoveStart={cancelLongPress}>
            
            {/* BOUTON RECENTRER */}
            <div className="absolute top-[calc(100px+env(safe-area-inset-top))] right-[20px] z-10">
                <button onClick={handleRecenterClick}
                        className="w-[29px] h-[29px] bg-white rounded flex items-center justify-center shadow-[0_0_0_2px_rgba(0,0,0,0.1)] hover:bg-gray-50 active:scale-95 transition-all"
                        title="Me recentrer">
                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor"
                            strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"
                            className={userLocation ? "text-gray-700" : "text-gray-300 animate-pulse"}>
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="16"></line>
                        <line x1="8" y1="12" x2="16" y2="12"></line>
                    </svg>
                </button>
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

            {/* MARQUEUR JOUEUR */}
            {userLocation && (
                <Marker longitude={userLocation.lng} latitude={userLocation.lat} anchor="bottom"
                        style={{zIndex: 50}}>
                    <div onClick={handlePlayerClick}
                            className="relative flex flex-col items-center cursor-pointer group rounded-full p-2 after:content-[''] after:absolute after:inset-1 after:rounded-full after:animate-soft-pulse after:z-[-1] animate-in fade-in zoom-in-50 duration-500 delay-300 fill-mode-both">
                        <div
                            className="absolute -top-7 px-3 py-1 bg-white/70 backdrop-blur-sm rounded-full shadow-sm border border-gray-100 transition-opacity opacity-100 group-hover:opacity-100 group-hover:scale-105 group-hover:bg-white group-hover:border-beer pointer-events-none whitespace-nowrap">
                            <span
                                className="text-[10px] font-black uppercase tracking-widest text-gray-500 group-hover:text-beer transition-colors">📸🍻</span>
                        </div>
                        <div className="relative w-24 h-32 flex items-end justify-center pb-2">
                            <div className="absolute inset-0 pointer-events-none">
                                {profile?.avatar ? (
                                    isMapReady ? (
                                        <Suspense fallback={<div className="flex h-full items-center justify-center"><div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-beer"></div></div>}>
                                            <AvatarCanvas config={profile.avatar} disableZoom={true} disablePan={true}/>
                                        </Suspense>
                                    ) : (
                                        <div className="flex h-full items-center justify-center"><div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-beer"></div></div>
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
        </Map>
    );
});
