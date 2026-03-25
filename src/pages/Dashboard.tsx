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
import {Check, Copy, Key, User as UserIcon} from 'lucide-react';
import {useSquadDetails} from '../hooks/useSquadDetails';
import {useProfile} from '../hooks/useProfile';
import AvatarCanvas from '../components/3D/AvatarCanvas';
import {BellRing} from 'lucide-react';
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

    return (
        <div className="h-full w-full relative flex flex-col...">

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
                                    <div onClick={openCamera}
                                         className="relative flex flex-col items-center cursor-pointer group">
                                        <div className="relative w-24 h-32 flex items-end justify-center pb-2">
                                            <div
                                                className="absolute bottom-1 w-12 h-3 bg-beer/50 rounded-full animate-ping blur-[2px]"/>
                                            <div
                                                className="absolute bottom-1 w-8 h-2 bg-beer/80 rounded-full blur-[1px]"/>
                                            <div className="absolute inset-0 pointer-events-none">
                                                {profile?.avatar ? (
                                                    <AvatarCanvas config={profile.avatar}/>
                                                ) : (
                                                    <UserIcon size={32}
                                                              className="text-beer drop-shadow-xl m-auto mt-10"/>
                                                )}
                                            </div>
                                        </div>
                                        <div
                                            className="absolute bottom-full mb-0 left-1/2 -translate-x-1/2 bg-gray-900/90 backdrop-blur text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                            📸 Lancer l'Appel
                                        </div>
                                    </div>
                                </Marker>
                            )}

                            {/* MARQUEURS DES ANCIENS APÉROS */}
                            {squadDetails?.past_beer_calls?.map((call) => (
                                <Marker key={call.id} longitude={call.longitude} latitude={call.latitude}
                                        anchor="bottom" style={{zIndex: 30}}>
                                    <div
                                        className="bg-gray-300 text-white p-2 rounded-full shadow-sm border-2 border-white flex items-center justify-center text-sm opacity-60">
                                        👻
                                    </div>
                                </Marker>
                            ))}
                        </Map>

                        {/* TIMELINE DES APÉROS */}
                        <div className="absolute bottom-[170px] w-full px-4 z-10 pointer-events-none">
                            <div
                                className="flex gap-4 overflow-x-auto pb-4 pt-2 px-2 snap-x snap-mandatory hide-scrollbar pointer-events-auto">

                                {/* CARTE DE L'APÉRO EN COURS */}
                                {squadDetails?.active_beer_call?.map((call) => (
                                    <div
                                        onClick={() => focusOnLocation(call!.longitude, call!.latitude)}
                                        className={`min-w-[220px] bg-white rounded-3xl p-5 shadow-xl border-4 snap-center flex-shrink-0 cursor-pointer hover:scale-105 active:scale-95 transition-transform ${call.has_responded ? 'border-blue-500' : 'border-beer'}`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <span
                                                className={`text-white text-[10px] font-black px-3 py-1 rounded-full animate-pulse tracking-widest ${call.has_responded ? 'bg-blue-500' : 'bg-red-500'}`}>
                                                {call.has_responded ? "REJOINT" : "EN COURS"}
                                            </span>
                                            <span
                                                className="text-gray-400 text-xs font-bold">{timeAgo(call.started_at)}</span>
                                        </div>
                                        <h3 className="font-black text-gray-800 text-lg uppercase italic mt-2 truncate">{call.location_name}</h3>
                                        <p className="text-xs text-gray-500 font-bold mt-1 tracking-widest">{call.participants_count} PARTICIPANTS</p>
                                    </div>
                                ))}

                                {/* CARTES DES ANCIENS APÉROS */}
                                {squadDetails?.past_beer_calls?.map((call) => (
                                    <div
                                        key={call.id}
                                        onClick={() => focusOnLocation(call.longitude, call.latitude)}
                                        className="min-w-[220px] bg-white/90 backdrop-blur-sm rounded-3xl p-5 shadow-sm border border-gray-100 snap-center flex-shrink-0 grayscale opacity-70 cursor-pointer hover:opacity-100 transition-opacity"
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <span
                                                className="bg-gray-200 text-gray-600 text-[10px] font-black px-3 py-1 rounded-full tracking-widest">TERMINÉ</span>
                                            <span
                                                className="text-gray-400 text-xs font-bold">{timeAgo(call.started_at)}</span>
                                        </div>
                                        <h3 className="font-black text-gray-800 text-lg uppercase italic mt-2 truncate">{call.location_name}</h3>
                                        <p className="text-xs text-gray-500 font-bold mt-1 tracking-widest">{call.participants_count} PARTICIPANTS</p>
                                    </div>
                                ))}

                                {(!squadDetails?.active_beer_call || squadDetails.active_beer_call.length === 0) && (!squadDetails?.past_beer_calls || squadDetails.past_beer_calls.length === 0) && (
                                    <div
                                        className="min-w-[220px] bg-white/80 backdrop-blur-sm rounded-3xl p-5 shadow-sm border border-dashed border-gray-300 snap-center flex-shrink-0">
                                        <p className="text-sm font-bold text-gray-400 text-center mt-4">Aucun apéro pour
                                            le moment.<br/>Lance le premier !</p>
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