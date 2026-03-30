import {useState, useEffect} from 'react';
import {useParams, useNavigate} from 'react-router-dom';
import {ChevronLeft, Check, AlertCircle, Medal, Users} from 'lucide-react';
import {useQueryClient} from '@tanstack/react-query';
import {useProfile} from '../hooks/useProfile';
import {api} from '../lib/api';
import AvatarCanvas from '../components/3D/AvatarCanvas';
import VestiairePanel from '../components/Profile/VestiairePanel';
import {motion, AnimatePresence} from 'framer-motion';

export default function Profile() {
    const {id} = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const isOwnProfile = !id || id === 'me';
    const profileId = isOwnProfile ? 'me' : id;

    const {data: profile, isLoading} = useProfile(profileId);

    const [previewAvatar, setPreviewAvatar] = useState<any>(null);
    const [isSaving, setIsSaving] = useState(false);

    // 🚀 AJOUT DE L'ÉTAT POUR LES ANIMATIONS
    const [availableAnimations, setAvailableAnimations] = useState<string[]>([]);

    const [notification, setNotification] = useState<{ message: string, isError: boolean } | null>(null);
    const [purchaseIntent, setPurchaseIntent] = useState<{
        itemId: string,
        price: number,
        itemName: string
    } | null>(null);

    const showToast = (message: string, isError = false) => {
        setNotification({message, isError});
        setTimeout(() => setNotification(null), 3500);
    };

    useEffect(() => {
        if (profile?.avatar && !previewAvatar) {
            setPreviewAvatar(profile.avatar);
        }
    }, [profile]);

    const handleBuyItem = (itemId: string, price: number, itemName: string) => {
        if (!isOwnProfile || !profile) return;
        if (profile.caps < price) {
            showToast("Pas assez de capsules, retourne picoler ! 🍻", true);
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
            showToast(`Félicitations ! "${purchaseIntent.itemName}" acheté. 🛍️`, false);
        } catch (e) {
            showToast("Erreur d'achat. Le serveur est sûrement ivre.", true);
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
            showToast("Tenue sauvegardée avec succès ! ✨", false);
        } catch (e) {
            showToast("Erreur lors de la sauvegarde.", true);
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading || !profile || !previewAvatar) return (
        <div className="h-screen flex flex-col items-center justify-center bg-[#f8fafc]">
            <div className="w-12 h-12 border-4 border-beer border-t-transparent rounded-full animate-spin"></div>
        </div>
    );

    return (
        <div className="h-screen w-full bg-[#f8fafc] flex flex-col relative overflow-hidden">

            <AnimatePresence>
                {notification && (
                    <motion.div initial={{y: -100, opacity: 0, x: "-50%"}} animate={{y: 0, opacity: 1, x: "-50%"}}
                                exit={{y: -100, opacity: 0, x: "-50%"}}
                                className={`absolute top-24 left-1/2 z-50 px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border-2 whitespace-nowrap ${notification.isError ? 'bg-red-500 border-red-400 text-white' : 'bg-gray-900 border-gray-700 text-white'}`}>
                        {notification.isError ? <AlertCircle size={18}/> : <Check size={18} className="text-beer"/>}
                        <span
                            className="font-black tracking-widest uppercase text-xs pt-0.5">{notification.message}</span>
                    </motion.div>
                )}
            </AnimatePresence>

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
                className="absolute top-0 left-0 right-0 z-20 p-6 flex justify-between items-start pointer-events-none">
                <button onClick={() => navigate(-1)}
                        className="p-3 bg-white/90 backdrop-blur-md rounded-full shadow-lg pointer-events-auto hover:scale-105 transition-transform">
                    <ChevronLeft size={24} className="text-gray-700"/></button>
                <div
                    className="bg-gray-900/90 backdrop-blur-md px-4 py-2 rounded-full shadow-xl border-2 border-amber-500 pointer-events-auto flex items-center gap-2">
                    <span className="text-xl">💊</span>
                    <span className="text-amber-500 font-black tracking-widest">{profile.caps} CAPS</span>
                </div>
            </div>

            <div
                className="absolute top-24 left-0 right-0 z-20 flex flex-col items-center pointer-events-none text-center px-6">
                <span
                    className="bg-amber-100 text-amber-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm border border-amber-200 mb-2">{profile.title}</span>
                <h1 className="text-4xl font-black text-gray-900 uppercase italic tracking-tighter drop-shadow-md break-all leading-none">{profile.username}</h1>
            </div>

            <div className="flex-1 w-full relative -mt-10">
                {/* 🚀 LIAISON DU CALLBACK ANIMATIONS */}
                <AvatarCanvas config={previewAvatar} onAnimationsLoaded={setAvailableAnimations}/>
            </div>

            <div className="h-[50vh] flex-shrink-0 flex flex-col relative z-30">
                {isOwnProfile ? (
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
                        className="flex-1 bg-white rounded-t-[3rem] shadow-[0_-20px_50px_rgba(0,0,0,0.1)] flex flex-col p-8 overflow-hidden">
                        <div className="flex-1 overflow-y-auto space-y-8 hide-scrollbar">
                            <div>
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                    <Users size={14}/> Ses Squads</h3>
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
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                    <Medal size={14}/> Ses Trophées</h3>
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