import {useState, useEffect} from 'react';
import {useNavigate, Link} from 'react-router-dom';
import {ChevronLeft, ArrowRight, User, Lock} from 'lucide-react';
import {useUserStore} from '../store/useUserStore';
import {api} from '../lib/api';
import AvatarCanvas from '../components/3D/AvatarCanvas';
import VestiairePanel, {type Gender, type ShopItem} from '../components/Profile/VestiairePanel';
import {useQuery} from '@tanstack/react-query';
import {toast} from "../store/useToastStore.ts";

export default function SignUp() {
    const navigate = useNavigate();
    const loginAction = useUserStore((state) => state.login);
    const [step, setStep] = useState<1 | 2>(1);
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({username: '', password: ''});
    const [gender, setGender] = useState<Gender>('Men');

    // On initialise à 'none' en attendant le chargement du backend
    const [avatarConfig, setAvatarConfig] = useState({
        head: 'none',
        body: 'none',
        legs: 'none',
        feet: 'none',
        accessory: 'none'
    });

    // 📡 Requête sur le profil anonyme pour récupérer le shop_items
    const {data: publicProfile} = useQuery({
        queryKey: ['public-profile'],
        queryFn: async () => {
            const res = await api.get('/auth/profile/');
            return res.data;
        }
    });

    const publicShopItems: ShopItem[] = publicProfile?.shop_items || [];

    // 🪄 MAGIE DYNAMIQUE : On sélectionne le 1er item de chaque catégorie selon le genre
    useEffect(() => {
        if (publicShopItems.length > 0) {
            // Fonction utilitaire pour trouver le 1er item dispo
            const getFirstItem = (cat: string) => {
                const item = publicShopItems.find(i => i.category === cat && (i.gender === gender || i.gender === 'Unisex'));
                return item ? item.id : 'none';
            };

            setAvatarConfig({
                head: getFirstItem('head'),
                body: getFirstItem('body'),
                legs: getFirstItem('legs'),
                feet: getFirstItem('feet'),
                accessory: getFirstItem('accessory')
            });
        }
    }, [publicShopItems, gender]); // Se déclenche au chargement des items ET quand on change de sexe

    const handleGenderChange = (newGender: Gender) => {
        setGender(newGender);
        // Plus besoin de modifier setAvatarConfig ici, le useEffect s'en charge automatiquement !
    };

    const handleSignup = async () => {
        setIsLoading(true);
        try {
            const res = await api.post('/auth/signup/', {
                ...formData,
                avatar: {...avatarConfig, gender}
            });
            if (res.data.access_token) {
                localStorage.setItem('token', res.data.access_token);
                loginAction(res.data.username);
                navigate('/dashboard');
            }
        } catch (err: any) {
            console.error("Erreur lors de l'inscription:", err);
            const errorMessage = err.response?.data?.detail || "Erreur serveur inattendue";
            toast.error("Erreur lors de l'inscription.", errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="h-full w-full bg-[#f8fafc] flex flex-col overflow-hidden">
            {step === 1 ? (
                <div
                    className="flex-1 flex flex-col px-8 justify-center font-sans relative overflow-hidden animate-in fade-in duration-500">

                    {/* 1. ON REPREND LE MÊME DECOR DE FOND QUE LE LOGIN */}
                    <div
                        className="absolute top-[-5%] right-[-10%] w-64 h-64 bg-beer opacity-10 rounded-full blur-3xl"/>
                    <div
                        className="absolute bottom-[-5%] left-[-10%] w-64 h-64 bg-beer opacity-5 rounded-full blur-3xl"/>

                    {/* 2. ON HARMONISE LE HEADER / LOGO */}
                    <div className="text-center mb-12 relative z-10">
                        <div
                            className="w-20 h-20 bg-white rounded-[2rem] shadow-xl mx-auto mb-6 flex items-center justify-center border-4 border-beer transform -rotate-6">
                            <span className="text-4xl">🍻</span>
                        </div>
                        <h1 className="text-4xl font-black text-gray-900 tracking-tighter uppercase italic">Nouvelle
                            Recrue</h1>
                        <p className="text-[10px] font-black text-gray-400 mt-2 uppercase tracking-[0.2em]">Crée ton
                            profil</p>
                    </div>

                    {/* 3. ON HARMONISE LES INPUTS (Même radius, même ombre, ajout des icônes) */}
                    <div className="space-y-4 relative z-10">
                        <div className="relative">
                            <User className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300" size={20}/>
                            <input
                                type="text"
                                placeholder="Pseudo"
                                maxLength={14}
                                value={formData.username}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (/^[a-zA-Z0-9]*$/.test(val)) {
                                        setFormData({...formData, username: val});
                                    }
                                }}
                                className="w-full bg-white p-5 pl-14 rounded-[2rem] shadow-inner text-lg font-bold focus:outline-none border-4 border-transparent focus:border-beer transition-all"
                            />
                        </div>

                        <div className="relative">
                            <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300" size={20}/>
                            <input
                                type="password"
                                placeholder="Mot de passe"
                                maxLength={50}
                                value={formData.password}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (/^\S*$/.test(val)) {
                                        setFormData({...formData, password: val});
                                    }
                                }}
                                className="w-full bg-white p-5 pl-14 rounded-[2rem] shadow-inner text-lg font-bold focus:outline-none border-4 border-transparent focus:border-beer transition-all"
                            />
                        </div>
                    </div>

                    {/* 4. ON HARMONISE LE BOUTON (rounded-[2.5rem]) */}
                    <button
                        disabled={!formData.username || formData.password.length < 4}
                        onClick={() => setStep(2)}
                        className="relative z-10 w-full bg-gray-900 text-white p-6 rounded-[2.5rem] font-black text-xl shadow-2xl flex items-center justify-center gap-3 active:scale-95 transition-all mt-8 disabled:opacity-30"
                    >
                        CRÉER L'AVATAR <ArrowRight size={24}/>
                    </button>

                    <div className="mt-12 text-center relative z-10">
                        <p className="text-gray-400 font-bold text-xs uppercase tracking-tighter">
                            Déjà inscrit ?
                        </p>
                        <Link to="/login"
                              className="mt-2 inline-flex items-center gap-2 text-beer font-black text-lg hover:underline decoration-4">
                            <ChevronLeft size={20}/> SE CONNECTER
                        </Link>
                    </div>
                </div>
            ) : (
                <div
                    className="flex-1 flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-500">
                    <div className="h-[35vh] w-full relative shrink-0">
                        <button onClick={() => setStep(1)}
                                className="absolute top-6 left-6 z-20 p-3 bg-white shadow-xl rounded-full border border-gray-100 hover:scale-110 active:scale-90 transition-transform">
                            <ChevronLeft size={20}/></button>
                        <AvatarCanvas config={avatarConfig}/>
                    </div>
                    <VestiairePanel
                        shopItems={publicShopItems}
                        avatarConfig={avatarConfig}
                        setAvatarConfig={setAvatarConfig}
                        gender={gender}
                        setGender={handleGenderChange}
                        onEquipAndSave={handleSignup}
                        isSubmitting={isLoading}
                        hideTabs={true}
                    />
                </div>
            )}
        </div>
    );
}