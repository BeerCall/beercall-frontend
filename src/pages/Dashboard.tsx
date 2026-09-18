import {useState, useEffect, useRef} from 'react';
import {usePushNotifications} from '../hooks/usePushNotifications';
import {useParams, useNavigate} from 'react-router-dom';
import Navbar from '../components/UI/Navbar';
import CreateSquadModal from '../components/Modals/CreateSquadModal';
import CreateBeerCallModal from '../components/Modals/CreateBeerCallModal';
import JoinSquadModal from '../components/Modals/JoinSquadModal';
import RespondBeerCallModal from '../components/Modals/RespondBeerCallModal';
import SelectWorldModal from '../components/Modals/SelectWorldModal';
import ScheduleAperoModal from '../components/Modals/ScheduleAperoModal';
import {ScheduledMarkerCountdown} from '../components/UI/ScheduledMarkerCountdown';
import Map, {Marker, NavigationControl, type MapRef} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Check, Copy, Key, User as UserIcon, BellRing, MapPin, Users, MessageCircle, Clock, Camera} from 'lucide-react';
import {useSquadDetails} from '../hooks/useSquadDetails';
import {useProfile} from '../hooks/useProfile';
import AvatarCanvas from '../components/3D/AvatarCanvas';
import {toast} from "../store/useToastStore";
import {useGameUIStore} from '../store/useGameUIStore';

// 🚀 NOUVEAUX IMPORTS POUR LE JEU
import {motion, AnimatePresence} from 'framer-motion';
import GameScreen from './GameScreen';

const timeAgo = (dateString?: string) => {
    if (!dateString) return 'À venir';
    const diff = Date.now() - new Date(dateString).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `Il y a ${days} j`;
    if (hours > 0) return `Il y a ${hours} h`;
    if (minutes > 0) return `Il y a ${minutes} min`;
    return 'À l\'instant';
};

const formatCountdown = (dateString: string | undefined, now: number) => {
    if (!dateString) return 'Date inconnue';

    const remaining = new Date(dateString).getTime() - now;
    if (remaining <= 0) return 'Imminent';

    const totalSeconds = Math.floor(remaining / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) return `Dans ${days}j ${hours}h ${minutes}m`;
    return `Dans ${hours}h ${minutes}m ${seconds.toString().padStart(2, '0')}s`;
};

export default function Dashboard() {
    const {id} = useParams();
    const navigate = useNavigate();

    // États des Modales de gestion
    const [isSquadModalOpen, setIsSquadModalOpen] = useState(false);
    const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);

    // États de l'apéro
    const [selectedBeerCall, setSelectedBeerCall] = useState<any | null>(null);
    const [isWorldsModalOpen, setIsWorldsModalOpen] = useState<string | null>(null);
    const [scheduleCoordinates, setScheduleCoordinates] = useState<{ lat: number; lng: number } | null>(null);
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

    const [isNightMode, setIsNightMode] = useState(false);

    const {data: profile} = useProfile();
    const {data: squadDetails} = useSquadDetails(id);
    const {isGameScreenOpen, currentAperoId, closeGameScreen} = useGameUIStore();
    const isActiveApero = squadDetails?.active_beer_call?.some((call: any) => call.id === isWorldsModalOpen);

    // Fermer l'écran de jeu quand on change de squad
    useEffect(() => {
        if (isGameScreenOpen) {
            closeGameScreen();
        }
    }, [id, isGameScreenOpen, closeGameScreen]);

    const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | null>(null);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [startingScheduledApero, setStartingScheduledApero] = useState<any>(null);
    const [photoLocation, setPhotoLocation] = useState<{ lat: number, lng: number } | null>(null);
    const [countdownNow, setCountdownNow] = useState(() => Date.now());
    const fileInputRef = useRef<HTMLInputElement>(null);
    const mapRef = useRef<MapRef>(null);
    const longPressTimer = useRef<number | null>(null);
    const longPressStart = useRef<{ x: number; y: number } | null>(null);

    const handleMapPointerDown = (event: any) => {
        if (event.originalEvent?.target?.closest?.('button, a, input, [role="button"]')) return;
        longPressStart.current = {x: event.point?.x || 0, y: event.point?.y || 0};
        longPressTimer.current = window.setTimeout(() => {
            const [lng, lat] = event.lngLat.toArray();
            setScheduleCoordinates({lng, lat});
            setIsScheduleModalOpen(true);
        }, 700);
    };
    const cancelLongPress = (event?: any) => {
        if (event && longPressStart.current && event.point) {
            const dx = event.point.x - longPressStart.current.x;
            const dy = event.point.y - longPressStart.current.y;
            if (Math.hypot(dx, dy) > 12) longPressTimer.current && window.clearTimeout(longPressTimer.current);
        } else if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
    };

    const hasCentered = useRef(false);
    const [copied, setCopied] = useState(false);

    const {subscribeToNotifications} = usePushNotifications();
    const [showPushBanner, setShowPushBanner] = useState(false);

    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            setShowPushBanner(true);
        }
    }, []);

    const handleEnableNotifications = async () => {
        const success = await subscribeToNotifications();
        setShowPushBanner(false);
        if (success) {
            toast.success("Radar Activé ! 🍻", "Ton téléphone vibrera au prochain appel.");
        }
    };

    const openCamera = (location = userLocation, apero: any = null) => {
        setPhotoLocation(location);
        setStartingScheduledApero(apero);
        if (fileInputRef.current) fileInputRef.current.click();
    };

    const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setPhotoFile(e.target.files[0]);
        }
        e.target.value = '';
    };

    const focusOnLocation = (lng: any, lat: any) => {
        const numLng = Number(lng);
        const numLat = Number(lat);
        if (mapRef.current && !isNaN(numLng) && !isNaN(numLat)) {
            mapRef.current.flyTo({
                center: [numLng, numLat],
                zoom: 16,
                pitch: 60,
                duration: 1500,
                essential: true
            });
        }
    };

    const handleManualRecenter = () => {
        if (userLocation && mapRef.current) {
            mapRef.current.flyTo({
                center: [userLocation.lng, userLocation.lat],
                zoom: 16,
                pitch: 60,
                duration: 1000,
                essential: true
            });
        } else if (!userLocation) {
            toast.error("Recherche en cours", "Le GPS cherche encore votre position... 📡");
        }
    };

    useEffect(() => {
        const currentHour = new Date().getHours();
        setIsNightMode(currentHour >= 19 || currentHour < 6);
    }, []);

    useEffect(() => {
        const intervalId = window.setInterval(() => setCountdownNow(Date.now()), 1000);
        return () => window.clearInterval(intervalId);
    }, []);

    useEffect(() => {
        if (!navigator.geolocation) return;

        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const newLocation = {lat: pos.coords.latitude, lng: pos.coords.longitude};
                setUserLocation(newLocation);
            },
            (err) => console.warn("Erreur géoloc (ignorée):", err),
            {
                enableHighAccuracy: true,
                maximumAge: 10000,
                timeout: 10000
            }
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, []);

    useEffect(() => {
        if (id && userLocation && mapRef.current && !hasCentered.current) {
            mapRef.current.flyTo({
                center: [userLocation.lng, userLocation.lat],
                zoom: 14,
                duration: 1500,
                essential: true
            });
            hasCentered.current = true;
        }
    }, [userLocation, id]);

    const mapStyle = isNightMode
        ? "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
        : "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

    const handleBeerCallClick = (beerCall: any) => {
        if (beerCall.has_responded) {
            setIsWorldsModalOpen(beerCall.id);
        } else {
            setSelectedBeerCall(beerCall);
        }
    };

    const handleCopyCode = () => {
        if (squadDetails?.invite_code) {
            navigator.clipboard.writeText(squadDetails.invite_code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className="h-full w-full relative flex flex-col bg-[#f8fafc] overflow-hidden font-sans">

            {/* 🎮 1. L'ÉCRAN DE JEU (S'affiche par-dessus la carte si une partie est en cours) */}
            <AnimatePresence>
                {isGameScreenOpen && currentAperoId && (
                    <motion.div
                        initial={{opacity: 0, y: "100%"}}
                        animate={{opacity: 1, y: 0}}
                        exit={{opacity: 0, y: "100%"}}
                        transition={{type: "spring", damping: 25, stiffness: 200}}
                        className="absolute inset-0 z-[100] bg-gray-950"
                    >
                        <GameScreen aperoIdProp={currentAperoId}/>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 🌍 2. LE RESTE DU DASHBOARD (Carte, timeline, modals...) */}
            <div className={`w-full h-full relative ${isGameScreenOpen ? 'hidden' : ''}`}>

                {/* BANNIÈRE PUSH */}
                {showPushBanner && (
                    <div
                        className="absolute top-[env(safe-area-inset-top)] left-0 right-0 z-50 bg-gray-900 text-white p-4 flex items-center justify-between shadow-xl">
                        <div className="flex items-center gap-3">
                            <div
                                className="w-10 h-10 bg-beer rounded-full flex items-center justify-center animate-bounce">
                                <BellRing size={20} className="text-white"/>
                            </div>
                            <div className="flex flex-col">
                                <span className="font-black text-sm uppercase italic">Ne rate aucun apéro !</span>
                                <span className="text-xs text-gray-300 font-bold">Active les alertes de la squad.</span>
                            </div>
                        </div>
                        <button onClick={handleEnableNotifications}
                                className="bg-white text-gray-900 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest active:scale-95">
                            Activer
                        </button>
                    </div>
                )}

                <input type="file" accept="image/*" capture="environment" ref={fileInputRef}
                       onChange={handlePhotoCapture} className="hidden"/>

                <div className="absolute inset-0 z-0">
                    {id ? (
                        <div className="w-full h-full relative animate-in fade-in duration-500">
                            {/* BADGE SQUAD */}
                            <div
                                className="absolute top-[calc(15px+env(safe-area-inset-top))] w-full flex justify-center z-10 pointer-events-none">
                                <div
                                    className="bg-white/95 backdrop-blur-md px-8 py-3 rounded-[2rem] shadow-xl pointer-events-auto border-2 flex flex-col items-center gap-2 transition-all"
                                    style={{borderColor: squadDetails?.color ? `${squadDetails.color}40` : 'rgba(217, 119, 6, 0.25)'}}
                                >
                                    <h2 className="font-black tracking-widest uppercase italic text-xl leading-none"
                                        style={{color: squadDetails?.color || '#D97706'}}>
                                        {squadDetails?.name || `Squad #${id}`}
                                    </h2>
                                    {squadDetails?.invite_code && (
                                        <button onClick={handleCopyCode}
                                                className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 px-4 py-1.5 rounded-full transition-all group active:scale-95"
                                                title="Copier le code">
                                            <Key size={12} style={{color: squadDetails?.color || '#D97706'}}/>
                                            <span
                                                className="font-black tracking-[0.25em] text-gray-700 text-xs pt-[2px]">{squadDetails.invite_code}</span>
                                            {copied ? <Check size={14}
                                                             className="text-green-500 animate-in zoom-in duration-300"/> :
                                                <Copy size={12}
                                                      className="text-gray-400 group-hover:text-gray-700 transition-colors"/>}
                                        </button>
                                    )}
                                </div>
                            </div>

                            <Map ref={mapRef}
                                 initialViewState={{longitude: 2.3522, latitude: 48.8566, zoom: 12, pitch: 45}}
                                 mapStyle={mapStyle} interactive={true}
                                 onMouseDown={handleMapPointerDown} onMouseUp={() => cancelLongPress()}
                                 onMouseLeave={() => cancelLongPress()}
                                 onTouchStart={handleMapPointerDown} onTouchMove={cancelLongPress}
                                 onTouchEnd={() => cancelLongPress()}>
                                {/* BOUTON RECENTRER */}
                                <div className="absolute top-[calc(100px+env(safe-area-inset-top))] right-[20px] z-10">
                                    <button onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleManualRecenter();
                                    }}
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
                                {squadDetails?.active_beer_call?.map((call) => {
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
                                {squadDetails?.scheduled_beer_calls?.map((call) => {
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
                                        <div onClick={() => openCamera()}
                                             className="relative flex flex-col items-center cursor-pointer group rounded-full p-2 after:content-[''] after:absolute after:inset-1 after:rounded-full after:animate-soft-pulse after:z-[-1] animate-in fade-in zoom-in-50 duration-500 delay-300 fill-mode-both">
                                            <div
                                                className="absolute -top-7 px-3 py-1 bg-white/70 backdrop-blur-sm rounded-full shadow-sm border border-gray-100 transition-opacity opacity-100 group-hover:opacity-100 group-hover:scale-105 group-hover:bg-white group-hover:border-beer pointer-events-none whitespace-nowrap">
                                                <span
                                                    className="text-[10px] font-black uppercase tracking-widest text-gray-500 group-hover:text-beer transition-colors">📸🍻</span>
                                            </div>
                                            <div className="relative w-24 h-32 flex items-end justify-center pb-2">
                                                <div className="absolute inset-0 pointer-events-none">
                                                    {profile?.avatar ? (
                                                        <AvatarCanvas config={profile.avatar} disableZoom={true}
                                                                      disablePan={true}/>
                                                    ) : (
                                                        <UserIcon size={32}
                                                                  className="text-beer drop-shadow-xl m-auto mt-10"/>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </Marker>
                                )}

                                {/* MARQUEURS PASSÉS */}
                                {squadDetails?.past_beer_calls?.map((call) => {
                                    const numLng = Number(call.longitude);
                                    const numLat = Number(call.latitude);
                                    if (isNaN(numLng) || isNaN(numLat)) return null;

                                    return (
                                        <Marker key={`past-${call.id}`} longitude={numLng} latitude={numLat}
                                                anchor="bottom" style={{zIndex: 30}}>
                                            {/* Plus petit et semi-transparent pour ne pas polluer la carte */}
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

                            {/* TIMELINE */}
                            <div
                                className="absolute bottom-[calc(130px_+_env(safe-area-inset-top))] w-full px-4 z-[70] pointer-events-none">
                                <div
                                    className="flex gap-4 overflow-x-auto pb-6 pt-2 px-2 snap-x snap-mandatory hide-scrollbar pointer-events-auto items-center">

                                    {/* 1. CARTE PROGRAMMÉE (Dynamique : Indigo -> Rose si Imminent) */}
                                    {squadDetails?.scheduled_beer_calls?.map((call) => {
                                        const remaining = call.scheduled_for ? new Date(call.scheduled_for).getTime() - countdownNow : 0;
                                        // On considère l'apéro imminent 30 minutes (1800000 ms) avant le début officiel
                                        const isImminent = remaining <= 1800000;

                                        return (
                                            <div key={call.id} onClick={() => focusOnLocation(call.longitude, call.latitude)}
                                                 className={`w-[220px] h-[130px] relative overflow-hidden rounded-3xl p-3.5 snap-center flex-shrink-0 cursor-pointer active:scale-95 transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between border shadow-[0_8px_20px_rgba(0,0,0,0.05)] group ${
                                                     isImminent
                                                         ? 'bg-gradient-to-br from-rose-50 to-white border-rose-200'
                                                         : 'bg-gradient-to-br from-indigo-50 to-white border-indigo-100'
                                                 }`}>
                                                <div>
                                                    <div className="flex justify-between items-center mb-1.5">
                                                        <span className={`flex items-center gap-1 text-[9px] font-black px-2 py-1 rounded-full tracking-widest leading-none ${
                                                            isImminent ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'
                                                        }`}>
                                                            <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                                                                isImminent ? 'bg-rose-500' : 'bg-indigo-500'
                                                            }`}></span>
                                                            {isImminent ? "C'EST L'HEURE" : "PROGRAMMÉ"}
                                                        </span>
                                                        <Clock size={14} className={isImminent ? 'text-rose-400 animate-bounce' : 'text-indigo-400'} />
                                                    </div>
                                                    <h3 className="font-black text-gray-900 text-sm uppercase italic mt-0.5 truncate flex items-center gap-1.5 leading-tight">
                                                        <MapPin size={14} className={isImminent ? 'text-rose-500' : 'text-indigo-500'} />
                                                        {call.location_name}
                                                    </h3>
                                                </div>
                                                <div className={`mt-auto pt-2 border-t flex flex-col gap-1.5 ${isImminent ? 'border-rose-100/50' : 'border-indigo-100/50'}`}>
                                                    <p className={`text-[10px] font-mono font-bold tracking-widest text-center rounded-lg py-1 ${
                                                        isImminent ? 'text-rose-700 bg-rose-500/10' : 'text-indigo-700 bg-indigo-500/10'
                                                    }`}>
                                                        {formatCountdown(call.scheduled_for, countdownNow)}
                                                    </p>

                                                    {/* BOUTONS DYNAMIQUES */}
                                                    <div className="flex items-center gap-1.5">
                                                        <button onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigate(`/squad/${id}/beer-call/${call.id}/chat`);
                                                        }}
                                                                className={`flex-1 flex items-center justify-center gap-1 text-[9px] px-2.5 py-1.5 rounded-xl font-black uppercase tracking-wider active:scale-95 transition-all shadow-sm leading-none ${isImminent ? 'bg-white border border-rose-200 text-rose-600 hover:bg-rose-50' : 'bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50'}`}>
                                                            <MessageCircle size={11}/> Chat
                                                        </button>
                                                        <button onClick={(e) => {
                                                            e.stopPropagation();
                                                            openCamera({ lat: Number(call.latitude), lng: Number(call.longitude) }, call);
                                                        }}
                                                                className={`flex-[1.5] text-white text-[9px] px-2.5 py-1.5 rounded-xl font-black uppercase tracking-wider active:scale-95 transition-all shadow-sm flex items-center justify-center gap-1 leading-none ${isImminent ? 'bg-rose-500 hover:bg-rose-600' : 'bg-indigo-500 hover:bg-indigo-600'}`}>
                                                            Lancer 📸
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* 2. CARTE ACTIVE (En cours) */}
                                    {squadDetails?.active_beer_call?.map((call) => (
                                        <div key={call.id}
                                             onClick={() => focusOnLocation(call.longitude, call.latitude)}
                                             className={`w-[220px] h-[130px] relative overflow-hidden rounded-3xl p-3.5 snap-center flex-shrink-0 cursor-pointer active:scale-95 transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between ${call.has_responded ? 'bg-gradient-to-br from-blue-50 to-white border border-blue-100 shadow-[0_8px_20px_rgb(59,130,246,0.15)]' : 'bg-gradient-to-br from-orange-50 to-white border border-orange-100 shadow-[0_8px_20px_rgb(217,119,6,0.15)]'} group`}>
                                            <div>
                                                <div className="flex justify-between items-center mb-1.5">
                                                    <span
                                                        className={`flex items-center gap-1 text-[9px] font-black px-2 py-1 rounded-full tracking-widest leading-none ${call.has_responded ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-beer'}`}>
                                                        <span
                                                            className={`w-1.5 h-1.5 rounded-full ${call.has_responded ? 'bg-blue-600' : 'bg-beer animate-pulse'}`}></span>
                                                        {call.has_responded ? "REJOINT" : "EN COURS"}
                                                    </span>
                                                    <span
                                                        className="text-gray-400 text-[9px] font-bold uppercase tracking-wider bg-gray-100 px-1.5 py-0.5 rounded-md leading-none">{timeAgo(call.started_at)}</span>
                                                </div>
                                                <h3 className="font-black text-gray-900 text-sm uppercase italic mt-0.5 truncate flex items-center gap-1.5 leading-tight">
                                                    <MapPin size={14}
                                                            className={call.has_responded ? 'text-blue-500' : 'text-beer'}/>
                                                    {call.location_name}
                                                </h3>
                                            </div>
                                            <div
                                                className="mt-auto pt-2 border-t border-gray-200/50 flex flex-col gap-1.5">
                                                <p className="text-[10px] text-gray-500 font-bold tracking-widest flex items-center justify-center gap-1 leading-none py-1">
                                                    <Users size={12} className="text-gray-400"/>
                                                    {call.participants_count} Participant{call.participants_count > 1 ? 's' : ''}
                                                </p>
                                                {!call.has_responded ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <button onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigate(`/squad/${id}/beer-call/${call.id}/chat`);
                                                        }}
                                                                className="flex-1 bg-amber-100 text-amber-700 text-[9px] px-2.5 py-1.5 rounded-xl font-black uppercase tracking-wider hover:bg-amber-200 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-1 leading-none">
                                                            <MessageCircle size={11}/> Chat
                                                        </button>
                                                        <button onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedBeerCall(call);
                                                        }}
                                                                className="flex-[1.5] flex items-center justify-center gap-1 bg-amber-500 text-white text-[9px] px-2.5 py-1.5 rounded-xl font-black uppercase tracking-widest shadow-sm shadow-amber-500/30 hover:bg-amber-600 active:scale-95 transition-all leading-none">
                                                            <Camera size={11}/> Répondre 📸
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1.5">
                                                        <button onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigate(`/squad/${id}/beer-call/${call.id}/chat`);
                                                        }}
                                                                className="flex-1 bg-blue-100 text-blue-600 text-[9px] px-2.5 py-1.5 rounded-xl font-black uppercase tracking-wider hover:bg-blue-200 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-1 leading-none">
                                                            <MessageCircle size={11}/> Chat
                                                        </button>
                                                        <button onClick={(e) => {
                                                            e.stopPropagation();
                                                            setIsWorldsModalOpen(call.id);
                                                        }}
                                                                className="flex-1 bg-blue-600 text-white text-[9px] px-2.5 py-1.5 rounded-xl font-black uppercase tracking-wider hover:bg-blue-700 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-1 leading-none">
                                                            Mondes 🌍
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}

                                    {/* 3. CARTE TERMINÉE */}
                                    {squadDetails?.past_beer_calls?.map((call) => (
                                        <div key={call.id}
                                             onClick={() => focusOnLocation(call.longitude, call.latitude)}
                                             className="w-[220px] h-[130px] bg-white/80 backdrop-blur-xl rounded-3xl p-3.5 shadow-md border border-gray-100 snap-center flex-shrink-0 cursor-pointer hover:-translate-y-1 hover:bg-white/95 transition-all duration-300 flex flex-col justify-between group">
                                            <div>
                                                <div className="flex justify-between items-center mb-1.5">
                                                    <span
                                                        className="bg-gray-100 text-gray-500 text-[9px] font-black px-2 py-1 rounded-full tracking-widest flex items-center gap-1 leading-none">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span> TERMINÉ
                                                    </span>
                                                    <span
                                                        className="text-gray-400 text-[9px] font-bold uppercase tracking-wider leading-none">{timeAgo(call.started_at)}</span>
                                                </div>
                                                <h3 className="font-black text-gray-700 text-sm uppercase italic mt-0.5 truncate flex items-center gap-1.5 leading-tight">
                                                    <MapPin size={14} className="text-gray-400"/> {call.location_name}
                                                </h3>
                                            </div>
                                            <div
                                                className="mt-auto pt-2 border-t border-gray-200/50 flex flex-col gap-1.5">
                                                <p className="text-[10px] text-gray-500 font-bold tracking-widest flex items-center justify-center gap-1 leading-none py-1">
                                                    <Users size={12}
                                                           className="text-gray-400"/> {call.participants_count} Participant{call.participants_count > 1 ? 's' : ''}
                                                </p>
                                                <div className="flex items-center gap-1.5">
                                                    <button onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(`/squad/${id}/beer-call/${call.id}/chat`);
                                                    }}
                                                            className="flex-1 bg-gray-100 text-gray-600 text-[9px] px-2.5 py-1.5 rounded-xl font-black uppercase tracking-wider hover:bg-gray-200 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-1 leading-none">
                                                        <MessageCircle size={11}/> Chat
                                                    </button>
                                                    <button onClick={(e) => {
                                                        e.stopPropagation();
                                                        setIsWorldsModalOpen(call.id);
                                                    }}
                                                            className="flex-1 bg-gray-800 text-white text-[9px] px-2.5 py-1.5 rounded-xl font-black uppercase tracking-wider hover:bg-black active:scale-95 transition-all shadow-sm flex items-center justify-center gap-1 leading-none">
                                                        Mondes 🌍
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    {/* CARTE VIDE (Si aucun apéro) */}
                                    {(!squadDetails?.active_beer_call || squadDetails.active_beer_call.length === 0) && (!squadDetails?.past_beer_calls || squadDetails.past_beer_calls.length === 0) && (!squadDetails?.scheduled_beer_calls || squadDetails.scheduled_beer_calls.length === 0) && (
                                        <div
                                            className="w-[220px] h-[130px] bg-white/60 backdrop-blur-md rounded-3xl p-4 shadow-sm border-2 border-dashed border-gray-300/50 snap-center flex-shrink-0 flex flex-col items-center justify-center">
                                            <div
                                                className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center mb-2">
                                                <BellRing size={16} className="text-gray-400"/>
                                            </div>
                                            <p className="text-xs font-bold text-gray-500 text-center uppercase tracking-wider leading-tight">
                                                Aucun événement.<br/>Lance le premier !
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div
                            className="w-full h-full flex flex-col items-center justify-center bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:24px_24px] opacity-80 pt-10">
                            <h1 className="text-4xl font-black text-gray-900 tracking-tighter italic uppercase text-center">Salut {profile?.username || 'Soldat'} !</h1>
                            <p className="mt-4 text-gray-400 font-bold uppercase tracking-widest">Choisis une squad en
                                bas</p>
                        </div>
                    )}
                </div>

                <Navbar onCreateClick={() => setIsSquadModalOpen(true)} onJoinClick={() => setIsJoinModalOpen(true)}/>
            </div>

            {/* MODALES CLASSIQUES */}
            <CreateSquadModal isOpen={isSquadModalOpen} onClose={() => setIsSquadModalOpen(false)}/>
            <JoinSquadModal isOpen={isJoinModalOpen} onClose={() => setIsJoinModalOpen(false)}/>
            <CreateBeerCallModal squadId={id || ''} photoFile={photoFile} location={photoLocation}
                                 scheduledApero={startingScheduledApero}
                                 onClose={() => {
                                     setPhotoFile(null);
                                     setPhotoLocation(null);
                                     setStartingScheduledApero(null);
                                 }}/>

            <RespondBeerCallModal isOpen={!!selectedBeerCall} onClose={() => setSelectedBeerCall(null)}
                                  beerCall={selectedBeerCall} squadId={id || ''} location={userLocation}/>

            <ScheduleAperoModal isOpen={isScheduleModalOpen} onClose={() => setIsScheduleModalOpen(false)}
                                squadId={id || ''} coordinates={scheduleCoordinates}/>


            <SelectWorldModal
                isOpen={!!isWorldsModalOpen}
                onClose={() => setIsWorldsModalOpen(null)}
                squadId={id || ''}
                beerCallId={isWorldsModalOpen || ''}
                isActiveApero={!!isActiveApero}
            />
        </div>
    );
}