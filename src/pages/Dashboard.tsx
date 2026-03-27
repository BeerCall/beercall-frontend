import {useState, useEffect, useRef} from 'react';
import {usePushNotifications} from '../hooks/usePushNotifications';
import {useParams} from 'react-router-dom';
import Navbar from '../components/UI/Navbar';
import CreateSquadModal from '../components/Modals/CreateSquadModal';
import CreateBeerCallModal from '../components/Modals/CreateBeerCallModal';
import JoinSquadModal from '../components/Modals/JoinSquadModal';
import RespondBeerCallModal from '../components/Modals/RespondBeerCallModal';
import SelectWorldModal from '../components/Modals/SelectWorldModal';
import Map, {Marker, NavigationControl, type MapRef} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Check, Copy, Key, User as UserIcon, BellRing, LocateFixed, MapPin, Users} from 'lucide-react';
import {useSquadDetails} from '../hooks/useSquadDetails';
import {useProfile} from '../hooks/useProfile';
import AvatarCanvas from '../components/3D/AvatarCanvas';
import {toast} from "../store/useToastStore.ts";

const timeAgo = (dateString: string) => {
    const diff = Date.now() - new Date(dateString).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `Il y a ${days} j`;
    if (hours > 0) return `Il y a ${hours} h`;
    if (minutes > 0) return `Il y a ${minutes} min`;
    return 'À l\'instant';
};

export default function Dashboard() {
    const {id} = useParams();

    // États des Modales de gestion
    const [isSquadModalOpen, setIsSquadModalOpen] = useState(false);
    const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);

    // États de l'apéro
    const [selectedBeerCall, setSelectedBeerCall] = useState<any | null>(null); // Pour répondre
    const [isWorldsModalOpen, setIsWorldsModalOpen] = useState<string | null>(null); // 👈 NOUVEL ÉTAT pour les mondes

    const [isNightMode, setIsNightMode] = useState(false);

    const {data: profile} = useProfile();
    const {data: squadDetails} = useSquadDetails(id);

    const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | null>(null);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const mapRef = useRef<MapRef>(null);

    const [copied, setCopied] = useState(false);

    const {subscribeToNotifications} = usePushNotifications();

    // État pour savoir si on doit afficher la bannière
    const [showPushBanner, setShowPushBanner] = useState(false);

    useEffect(() => {
        // Si le navigateur supporte les notifs ET que l'utilisateur n'a pas encore fait de choix
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

    const openCamera = () => {
        if (fileInputRef.current) fileInputRef.current.click();
    };

    const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setPhotoFile(e.target.files[0]);
        }
    };

    // 🚁 L'ANIMATION DE VOL (FLYTO)
    const focusOnLocation = (lng: number, lat: number) => {
        if (mapRef.current) {
            mapRef.current.flyTo({
                center: [lng, lat],
                zoom: 16,
                pitch: 60, // Bel angle 3D
                duration: 1500, // Animation fluide
                essential: true
            });
        }
    };

    useEffect(() => {
        const currentHour = new Date().getHours();
        setIsNightMode(currentHour >= 19 || currentHour < 6);

        if (id && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const newLocation = {lat: pos.coords.latitude, lng: pos.coords.longitude};
                    setUserLocation(newLocation);

                    if (mapRef.current) {
                        mapRef.current.flyTo({center: [newLocation.lng, newLocation.lat], zoom: 14, duration: 1000});
                    }
                },
                (err) => console.error("Erreur géoloc:", err),
                {enableHighAccuracy: true}
            );
        }
    }, [id]);

    const mapStyle = isNightMode
        ? "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
        : "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

    // 🚦 LA FONCTION D'AIGUILLAGE CORRIGÉE
    const handleBeerCallClick = (beerCall: any) => {
        if (beerCall.has_responded) {
            // On stocke l'ID de l'apéro pour que React Query puisse faire sa requête !
            setIsWorldsModalOpen(beerCall.id);
        } else {
            setSelectedBeerCall(beerCall);
        }
    };

    const handleCopyCode = () => {
        if (squadDetails?.invite_code) {
            navigator.clipboard.writeText(squadDetails.invite_code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000); // Remet l'icône normale après 2s
        }
    };
// 🎯 LA FONCTION DE LOCALISATION MANUELLE
    const handleLocateMe = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const newLocation = {lat: pos.coords.latitude, lng: pos.coords.longitude};
                    setUserLocation(newLocation);

                    if (mapRef.current) {
                        mapRef.current.flyTo({
                            center: [newLocation.lng, newLocation.lat],
                            zoom: 16,
                            pitch: 60,
                            duration: 1500
                        });
                    }
                    // Si on a l'utilitaire toast (Optionnel)
                    // toast.success("Localisation", "Te voilà sur la carte !");
                },
                (err) => {
                    console.error("Erreur géoloc:", err);
                    // Si tu as gardé le store de Toasts :
                    // toast.error("Erreur GPS", "Active ta localisation pour trouver l'apéro !");
                },
                {enableHighAccuracy: true}
            );
        }
    };
    return (
        <div className="h-full w-full relative flex flex-col bg-purple-500">
            {/* 🌟 LE SOFT PROMPT (Bannière UX) 🌟 */}
            {showPushBanner && (
                <div
                    className="absolute top-0 left-0 right-0 z-50 bg-gray-900 text-white p-4 flex items-center justify-between shadow-xl">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-beer rounded-full flex items-center justify-center animate-bounce">
                            <BellRing size={20} className="text-white"/>
                        </div>
                        <div className="flex flex-col">
                            <span className="font-black text-sm uppercase italic">Ne rate aucun apéro !</span>
                            <span className="text-xs text-gray-300 font-bold">Active les alertes de la squad.</span>
                        </div>
                    </div>
                    <button
                        onClick={handleEnableNotifications} // 👈 Déclenche la popup native !
                        className="bg-white text-gray-900 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest active:scale-95"
                    >
                        Activer
                    </button>
                </div>
            )}
            <input
                type="file" accept="image/jpeg, image/png, image/jpg" capture="environment"
                ref={fileInputRef} onChange={handlePhotoCapture} className="hidden"
            />

            <div className="absolute inset-0 z-0">
                {id ? (
                    <div className="w-full h-full relative animate-in fade-in duration-500">

                        <div className="absolute top-12 w-full flex justify-center z-10 pointer-events-none">
                            {/* BADGE UNIQUE : Nom en haut, Code en bas */}
                            <div
                                className="bg-white/95 backdrop-blur-md px-8 py-3 rounded-[2rem] shadow-xl pointer-events-auto border-2 flex flex-col items-center gap-2 transition-all"
                                style={{borderColor: squadDetails?.color ? `${squadDetails.color}40` : 'rgba(217, 119, 6, 0.25)'}}
                            >
                                {/* LIGNE 1 : SQUAD NAME */}
                                <h2 className="font-black tracking-widest uppercase italic text-xl leading-none"
                                    style={{color: squadDetails?.color || '#D97706'}}>
                                    {squadDetails?.name || `Squad #${id}`}
                                </h2>

                                {/* LIGNE 2 : INVITE CODE */}
                                {squadDetails?.invite_code && (
                                    <button
                                        onClick={handleCopyCode}
                                        className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 px-4 py-1.5 rounded-full transition-all group active:scale-95"
                                        title="Copier le code d'invitation"
                                    >
                                        <Key size={12} style={{color: squadDetails?.color || '#D97706'}}/>
                                        <span className="font-black tracking-[0.25em] text-gray-700 text-xs pt-[2px]">
                    {squadDetails.invite_code}
                </span>
                                        {copied ? (
                                            <Check size={14}
                                                   className="text-green-500 animate-in zoom-in duration-300"/>
                                        ) : (
                                            <Copy size={12}
                                                  className="text-gray-400 group-hover:text-gray-700 transition-colors"/>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                        <Map
                            ref={mapRef}
                            initialViewState={{longitude: 2.3522, latitude: 48.8566, zoom: 12, pitch: 45}}
                            mapStyle={mapStyle}
                            interactive={true}
                        >
                            <NavigationControl position="top-right" style={{marginTop: '100px', marginRight: '20px'}}/>

                            {/* 1. MARQUEUR DE L'APÉRO EN COURS */}
                            {squadDetails?.active_beer_call?.map((call) => (
                                <Marker
                                    longitude={call.longitude}
                                    latitude={call.latitude}
                                    anchor="bottom"
                                    style={{zIndex: 60}}
                                >
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            // 🚦 ON UTILISE NOTRE AIGUILLAGE ICI
                                            handleBeerCallClick(call);
                                        }}
                                        className="relative group cursor-pointer animate-bounce"
                                    >
                                        <div
                                            className="bg-beer text-white p-3 rounded-full shadow-xl border-4 border-white flex items-center justify-center text-xl hover:scale-110 transition-transform">
                                            🍻
                                        </div>
                                    </div>
                                </Marker>
                            ))}

                            {/* 2. TON MARQUEUR : LE VOXEL AVATAR 3D */}
                            {userLocation && (
                                <Marker longitude={userLocation.lng} latitude={userLocation.lat} anchor="bottom"
                                        style={{zIndex: 50}}>

                                    {/* 🚀 MICRO-INTERACTION & HALO : Ajout de soft-pulse et de l'effet after: */}
                                    <div onClick={openCamera}
                                         className="relative flex flex-col items-center cursor-pointer group rounded-full p-2
                                                    after:content-[''] after:absolute after:inset-1 after:rounded-full after:animate-soft-pulse after:z-[-1]
                                                    animate-in fade-in zoom-in-50 duration-500 delay-300 fill-mode-both">

                                        <div
                                            className="absolute -top-7 px-3 py-1 bg-white/70 backdrop-blur-sm rounded-full shadow-sm border border-gray-100 transition-opacity opacity-100 group-hover:opacity-100 group-hover:scale-105 group-hover:bg-white group-hover:border-beer pointer-events-none whitespace-nowrap">
                                            <span
                                                className="text-[10px] font-black uppercase tracking-widest text-gray-500 group-hover:text-beer transition-colors">
                                                📸🍻
                                            </span>
                                        </div>

                                        <div className="relative w-24 h-32 flex items-end justify-center pb-2">
                                            {/* Suppression de l'ancien effet ping, remplacé par l'halo global */}
                                            <div className="absolute inset-0 pointer-events-none">
                                                {profile?.avatar ? (
                                                    <AvatarCanvas config={profile.avatar}/>
                                                ) : (
                                                    <UserIcon size={32}
                                                              className="text-beer drop-shadow-xl m-auto mt-10"/>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </Marker>
                            )}

                            {/* MARQUEURS DES ANCIENS APÉROS */}
                            {squadDetails?.past_beer_calls?.map((call) => (
                                <Marker key={call.id} longitude={call.longitude} latitude={call.latitude}
                                        anchor="bottom" style={{zIndex: 30}}>
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            // 🌍 Ouvre la modale des mondes avec l'ID de cet ancien apéro
                                            setIsWorldsModalOpen(call.id);
                                        }}
                                        className="bg-gray-300 text-white p-2 rounded-full shadow-sm border-2 border-white flex items-center justify-center text-sm opacity-60 cursor-pointer hover:opacity-100 hover:scale-125 transition-all"
                                        title="Voir les mondes"
                                    >
                                        👻
                                    </div>
                                </Marker>
                            ))}
                        </Map>

                        {/* TIMELINE DES APÉROS */}
                        <div className="absolute bottom-[130px] w-full px-4 z-[70] pointer-events-none">
                            <div
                                className="flex gap-4 overflow-x-auto pb-6 pt-2 px-2 snap-x snap-mandatory hide-scrollbar pointer-events-auto">
                                {/* 🟢 CARTE DE L'APÉRO EN COURS */}
                                {squadDetails?.active_beer_call?.map((call) => (
                                    <div
                                        key={call.id}
                                        onClick={() => focusOnLocation(call!.longitude, call!.latitude)}
                                        className={`w-[220px] relative overflow-hidden rounded-3xl p-3.5 snap-center flex-shrink-0 cursor-pointer active:scale-95 transition-all duration-300 hover:-translate-y-1 flex flex-col justify-center ${
                                            call.has_responded
                                                ? 'bg-gradient-to-br from-blue-50 to-white border border-blue-100 shadow-[0_8px_20px_rgb(59,130,246,0.15)]'
                                                : 'bg-gradient-to-br from-orange-50 to-white border border-orange-100 shadow-[0_8px_20px_rgb(217,119,6,0.15)]'
                                        }`}
                                    >
                                        <div className="flex justify-between items-center mb-1.5">
                                            <span
                                                className={`flex items-center gap-1 text-[9px] font-black px-2 py-1 rounded-full tracking-widest leading-none ${
                                                    call.has_responded ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-beer'
                                                }`}>
                                                <span
                                                    className={`w-1.5 h-1.5 rounded-full ${call.has_responded ? 'bg-blue-600' : 'bg-beer animate-pulse'}`}></span>
                                                {call.has_responded ? "REJOINT" : "EN COURS"}
                                            </span>
                                            <span
                                                className="text-gray-400 text-[9px] font-bold uppercase tracking-wider bg-gray-100 px-1.5 py-0.5 rounded-md leading-none">
                                                {timeAgo(call.started_at)}
                                            </span>
                                        </div>

                                        <h3 className="font-black text-gray-900 text-sm uppercase italic mt-0.5 truncate flex items-center gap-1.5 leading-tight">
                                            <MapPin size={14}
                                                    className={call.has_responded ? 'text-blue-500' : 'text-beer'}/>
                                            {call.location_name}
                                        </h3>

                                        <p className="text-[10px] text-gray-500 font-bold mt-1.5 tracking-widest flex items-center gap-1.5 leading-none">
                                            <Users size={12} className="text-gray-400"/>
                                            {call.participants_count} PARTICIPANT{call.participants_count > 1 ? 'S' : ''}
                                        </p>
                                    </div>
                                ))}

                                {/* 👻 CARTES DES ANCIENS APÉROS */}
                                {squadDetails?.past_beer_calls?.map((call) => (
                                    <div
                                        key={call.id}
                                        onClick={() => focusOnLocation(call.longitude, call.latitude)}
                                        className="w-[220px] bg-white/80 backdrop-blur-xl rounded-3xl p-3.5 shadow-md border border-white/50 snap-center flex-shrink-0 cursor-pointer hover:-translate-y-1 hover:bg-white/95 transition-all duration-300 flex flex-col justify-between group"
                                    >
                                        <div>
                                            <div className="flex justify-between items-center mb-1.5">
                                                <span
                                                    className="bg-gray-100/80 text-gray-500 text-[9px] font-black px-2 py-1 rounded-full tracking-widest flex items-center gap-1 leading-none">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                                                    TERMINÉ
                                                </span>
                                                <span
                                                    className="text-gray-400 text-[9px] font-bold uppercase tracking-wider leading-none">
                                                    {timeAgo(call.started_at)}
                                                </span>
                                            </div>
                                            <h3 className="font-black text-gray-700 text-sm uppercase italic mt-0.5 truncate flex items-center gap-1.5 leading-tight">
                                                <MapPin size={14} className="text-gray-400"/>
                                                {call.location_name}
                                            </h3>
                                        </div>

                                        {/* Ligne du bas ultra compacte */}
                                        <div
                                            className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200/50">
                                            <p className="text-[10px] text-gray-500 font-bold tracking-widest flex items-center gap-1 leading-none">
                                                <Users size={12} className="text-gray-400"/>
                                                {call.participants_count}
                                            </p>

                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setIsWorldsModalOpen(call.id);
                                                }}
                                                className="bg-white text-gray-800 text-[9px] px-2.5 py-1.5 rounded-lg font-black uppercase tracking-wider hover:bg-gray-800 hover:text-white active:scale-95 transition-all shadow-sm border border-gray-200 flex items-center gap-1 group-hover:border-gray-800 leading-none"
                                            >
                                                Mondes 🌍
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {/* 📭 EMPTY STATE */}
                                {(!squadDetails?.active_beer_call || squadDetails.active_beer_call.length === 0) && (!squadDetails?.past_beer_calls || squadDetails.past_beer_calls.length === 0) && (
                                    <div
                                        className="w-[220px] bg-white/60 backdrop-blur-md rounded-3xl p-4 shadow-sm border-2 border-dashed border-gray-300/50 snap-center flex-shrink-0 flex flex-col items-center justify-center">
                                        <div
                                            className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center mb-2">
                                            <BellRing size={16} className="text-gray-400"/>
                                        </div>
                                        <p className="text-xs font-bold text-gray-500 text-center uppercase tracking-wider leading-tight">
                                            Aucun apéro.<br/>Lance le premier !
                                        </p>
                                    </div>
                                )}

                            </div>
                        </div>
                        {/* BOUTON RECENTRER */}
                        {/* 🚀 Change z-20 par z-[70] ici pour qu'il ne se fasse pas manger non plus */}
                        <div className="absolute top-[190px] right-4 z-[70]">
                            <button
                                onClick={handleLocateMe}
                                className="bg-white/90 backdrop-blur-md text-gray-700 p-3 rounded-2xl shadow-xl border-2 border-gray-100 hover:scale-110 active:scale-95 transition-all group"
                                title="Me localiser"
                            >
                                <LocateFixed size={24} className="group-hover:text-beer transition-colors"/>
                            </button>
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

            <Navbar
                onCreateClick={() => setIsSquadModalOpen(true)}
                onJoinClick={() => setIsJoinModalOpen(true)}
            />

            <CreateSquadModal isOpen={isSquadModalOpen} onClose={() => setIsSquadModalOpen(false)}/>
            <JoinSquadModal isOpen={isJoinModalOpen} onClose={() => setIsJoinModalOpen(false)}/>
            <CreateBeerCallModal squadId={id || ''} photoFile={photoFile} location={userLocation}
                                 onClose={() => setPhotoFile(null)}/>

            {/* L'AIGUILLAGE OUVRE L'UNE DES DEUX MODALES */}
            <RespondBeerCallModal
                isOpen={!!selectedBeerCall}
                onClose={() => setSelectedBeerCall(null)}
                beerCall={selectedBeerCall}
                squadId={id || ''}
                location={userLocation}
            />

            <SelectWorldModal
                isOpen={!!isWorldsModalOpen}
                onClose={() => setIsWorldsModalOpen(null)}
                squadId={id || ''}
                beerCallId={isWorldsModalOpen || ''}
            />
        </div>
    );
}