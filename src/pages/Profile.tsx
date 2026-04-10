import {useState, useEffect} from 'react';
import {useParams, useNavigate} from 'react-router-dom';
import {ChevronLeft, Check, Medal, Users} from 'lucide-react';
import {useQueryClient} from '@tanstack/react-query';
import {useProfile} from '../hooks/useProfile';
import {api} from '../lib/api';
import AvatarCanvas from '../components/3D/AvatarCanvas';
import VestiairePanel from '../components/Profile/VestiairePanel';
import {motion, AnimatePresence} from 'framer-motion';
import {toast} from "../store/useToastStore.ts";

export default function Profile() {
    const {id} = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const isOwnProfile = !id || id === 'me';
    const profileId = isOwnProfile ? 'me' : id;

    const {data: profile, isLoading} = useProfile(profileId);

    const [previewAvatar, setPreviewAvatar] = useState<any>(null);
    const [isSaving, setIsSaving] = useState(false);

    // 🚀 AJOUT DE L'ÉTAT POUR LE SWITCH VESTIAIRE / TROPHÉES
    const [activeView, setActiveView] = useState<'vestiaire' | 'infos'>('vestiaire');

    const [availableAnimations, setAvailableAnimations] = useState<string[]>([]);

    const [purchaseIntent, setPurchaseIntent] = useState<{
        itemId: string,
        price: number,
        itemName: string
    } | null>(null);

    useEffect(() => {
        if (profile?.avatar && !previewAvatar) {
            setPreviewAvatar(profile.avatar);
        }
    }, [profile]);

    const handleBuyItem = (itemId: string, price: number, itemName: string) => {
        if (!isOwnProfile || !profile) return;
        if (profile.caps < price) {
            toast.error("Fonds insuffisants", "Pas assez de capsules, retourne picoler ! 🍻");
            return;
        }
        setPurchaseIntent({itemId, price, itemName});
    };

    const confirmPurchase = async () => {
        if (!purchaseIntent) return;
        setIsSaving(true);
        try {
            await api.post('/auth/buy/', {item_id: purchaseIntent.itemId});
            queryClient.invalidateQueries({queryKey: ['profile', profileId]});
            toast.success("Achat validé", `Félicitations ! "${purchaseIntent.itemName}" acheté. 🛍️`);
        } catch (e) {
            toast.error("Erreur", "Le serveur est sûrement ivre.");
        } finally {
            setIsSaving(false);
            setPurchaseIntent(null);
        }
    };

    const handleSaveOutfit = async () => {
        if (!isOwnProfile) return;
        setIsSaving(true);
        try {
            await api.put('/auth/equip/', previewAvatar);
            queryClient.invalidateQueries({queryKey: ['profile', profileId]});
            toast.success("Succès", "Tenue sauvegardée avec succès ! ✨");
        } catch (e) {
            toast.error("Erreur", "Erreur lors de la sauvegarde.");
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading || !profile || !previewAvatar) return (
        <div className="h-full flex flex-col items-center justify-center bg-[#f8fafc]">
            <div className="w-12 h-12 border-4 border-beer border-t-transparent rounded-full animate-spin"></div>
        </div>
    );

    return (
        <div className="h-full w-full bg-[#f8fafc] flex flex-col relative overflow-hidden">

            <AnimatePresence>
                {purchaseIntent && (
                    <>
                        <motion.div initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}}
                                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
                                    onClick={() => setPurchaseIntent(null)}/>
                        <motion.div initial={{scale: 0.9, opacity: 0, y: "50%", x: "-50%"}}
                                    animate={{scale: 1, opacity: 1, y: "-50%", x: "-50%"}}
                                    exit={{scale: 0.9, opacity: 0, y: "50%", x: "-50%"}}
                                    className="fixed top-1/2 left-1/2 w-[85%] max-w-sm bg-white rounded-3xl p-6 z-[101] shadow-2xl flex flex-col items-center text-center">
                            <div
                                className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center text-amber-500 mb-4 shadow-inner">
                                <span className="text-2xl">💊</span></div>
                            <h3 className="text-xl font-black text-gray-900 uppercase italic tracking-tighter mb-2">Confirmation</h3>
                            <p className="text-sm font-bold text-gray-500 mb-6">Acheter <span
                                className="text-gray-900">"{purchaseIntent.itemName}"</span> pour <span
                                className="text-amber-500">{purchaseIntent.price} CAPS</span> ?</p>
                            <div className="flex gap-3 w-full">
                                <button onClick={() => setPurchaseIntent(null)}
                                        className="flex-1 bg-gray-100 text-gray-500 p-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-200 transition-colors">Annuler
                                </button>
                                <button onClick={confirmPurchase} disabled={isSaving}
                                        className="flex-1 bg-beer text-white p-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-beer/30 active:scale-95 transition-transform flex justify-center items-center gap-2 disabled:opacity-50">{isSaving ? '...' : 'Acheter'}
                                    <Check size={16}/></button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            <div
                className="absolute top-[calc(0px+env(safe-area-inset-top))] left-0 right-0 z-20 px-4 py-3 flex justify-between items-center pointer-events-none">

                <button onClick={() => navigate(-1)}
                        className="p-2.5 bg-white/90 backdrop-blur-md rounded-full shadow-sm border border-gray-100 pointer-events-auto hover:scale-105 active:scale-95 transition-all shrink-0">
                    <ChevronLeft size={22} className="text-gray-700"/>
                </button>

                <div className="flex flex-col items-center flex-1 px-3 pointer-events-none overflow-hidden">
                    <span
                        className="bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm border border-amber-200 mb-0.5 leading-none whitespace-nowrap">
                        {profile.title}
                    </span>
                    <h1 className="text-xl sm:text-2xl font-black text-gray-900 uppercase italic tracking-tight drop-shadow-sm truncate w-full text-center leading-none">
                        {profile.username}
                    </h1>
                </div>

                <div
                    className="bg-gray-900/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-md border-[1.5px] border-amber-500 pointer-events-auto flex items-center gap-1 shrink-0">
                    <span className="text-base leading-none">💊</span>
                    <span className="text-amber-500 font-black tracking-widest text-xs pt-0.5">{profile.caps}</span>
                </div>
            </div>

            <div
                className="flex-1 flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-500">

                <div className="h-[50vh] w-full pt-[calc(50px+env(safe-area-inset-top))] relative shrink-0">

                    {/* 🚀 LE SWITCH DÉPLACÉ EN BAS : Aux pieds de l'avatar, juste au-dessus du panneau ! */}
                    {isOwnProfile && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 bg-gray-200/80 backdrop-blur-md p-1 rounded-full flex shadow-sm border border-white/50 pointer-events-auto">
                            <button
                                onClick={() => setActiveView('vestiaire')}
                                className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${activeView === 'vestiaire' ? 'bg-white text-beer shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                            >
                                Vestiaire
                            </button>
                            <button
                                onClick={() => setActiveView('infos')}
                                className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${activeView === 'infos' ? 'bg-white text-beer shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                            >
                                Trophées
                            </button>
                        </div>
                    )}

                    <AvatarCanvas config={previewAvatar} onAnimationsLoaded={setAvailableAnimations}/>
                </div>

                {/* 🚀 LOGIQUE CORRIGÉE : Si c'est ton profil ET que tu es sur "vestiaire", on affiche le vestiaire. Sinon, on affiche les infos. */}
                {isOwnProfile && activeView === 'vestiaire' ? (
                    <VestiairePanel
                        shopItems={profile.shop_items || []}
                        avatarConfig={previewAvatar}
                        setAvatarConfig={setPreviewAvatar}
                        gender={profile.avatar.gender}
                        badges={profile.unlocked_badges}
                        onBuy={handleBuyItem}
                        onEquipAndSave={handleSaveOutfit}
                        isSubmitting={isSaving}
                        readonly={false}
                        availableAnimations={availableAnimations}
                    />
                ) : (
                    <div
                        className="flex-1 bg-white rounded-t-[3rem] shadow-[0_-20px_50px_rgba(0,0,0,0.1)] flex flex-col p-8 overflow-hidden z-20 relative">
                        <div className="flex-1 overflow-y-auto space-y-8 hide-scrollbar pb-10">
                            <div>
                                {/* 🚀 TEXTE DYNAMIQUE (Mes Squads vs Ses Squads) */}
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                    <Users size={14}/> {isOwnProfile ? 'Mes Squads' : 'Ses Squads'}
                                </h3>
                                <div className="flex flex-wrap gap-3">
                                    {profile.squads?.map(squad => (
                                        <div key={squad.id}
                                             className="flex items-center gap-2 px-4 py-2 rounded-2xl border-2 border-gray-100 bg-gray-50">
                                            <span className="text-lg">🍻</span><span
                                            className="font-black text-gray-700 uppercase italic tracking-tighter text-sm">{squad.name}</span>
                                        </div>
                                    ))}
                                    {(!profile.squads || profile.squads.length === 0) &&
                                        <p className="text-xs font-bold text-gray-300 italic uppercase">Aucune squad
                                            rejointe</p>}
                                </div>
                            </div>
                            <div>
                                {/* 🚀 TEXTE DYNAMIQUE (Mes Trophées vs Ses Trophées) */}
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                    <Medal size={14}/> {isOwnProfile ? 'Mes Trophées' : 'Ses Trophées'}
                                </h3>
                                <div className="space-y-3">
                                    {profile.unlocked_badges?.map(badge => (
                                        <div key={badge.id}
                                             className="bg-gradient-to-br from-amber-100 to-amber-50 p-4 rounded-2xl border-2 border-amber-200 flex items-center gap-4 shadow-sm">
                                            <div
                                                className="w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center text-white shadow-inner flex-shrink-0 text-lg">{badge.icon}</div>
                                            <div>
                                                <h4 className="font-black text-amber-900 uppercase italic tracking-tighter text-sm leading-tight">{badge.name}</h4>
                                                <p className="text-[10px] font-bold text-amber-700/70 mt-0.5 uppercase tracking-wide">{badge.description}</p>
                                            </div>
                                        </div>
                                    ))}
                                    {(!profile.unlocked_badges || profile.unlocked_badges.length === 0) && <div
                                        className="text-center py-6 border-2 border-dashed border-gray-100 rounded-2xl">
                                        <p className="text-xs font-bold text-gray-300 uppercase tracking-widest">Aucun
                                            trophée pour le moment</p></div>}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}