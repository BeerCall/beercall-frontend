import {useState} from 'react';
import {User as UserIcon, Shirt, Component, Footprints, Shield, Check, Lock, Medal, ShoppingCart} from 'lucide-react';

export type ItemCategory = 'head' | 'body' | 'legs' | 'feet' | 'accessory';
export type Gender = 'Men' | 'Women' | 'Unisex';

export interface ShopItem {
    id: string;
    name: string;
    category: ItemCategory;
    gender: Gender;
    price: number;
    is_owned: boolean;
}

interface VestiairePanelProps {
    shopItems: ShopItem[];
    avatarConfig: any;
    setAvatarConfig?: (config: any) => void;
    gender: Gender;
    setGender?: (gender: Gender) => void;
    badges?: any[];
    // 🛠️ Ajout du paramètre "itemName" pour la popup de confirmation
    onBuy?: (itemId: string, price: number, itemName: string) => void;
    onEquipAndSave?: () => void;
    isSubmitting?: boolean;
    hideTabs?: boolean;
    readonly?: boolean;
}

export default function VestiairePanel({
                                           shopItems, avatarConfig, setAvatarConfig, gender, setGender, badges = [],
                                           onBuy, onEquipAndSave, isSubmitting, hideTabs = false, readonly = false
                                       }: VestiairePanelProps) {
    const [activeTab, setActiveTab] = useState<'vestiaire' | 'badges'>('vestiaire');
    const [subTab, setSubTab] = useState<ItemCategory>('head');

    const currentItems = shopItems.filter(item =>
        item.category === subTab && (item.gender === gender || item.gender === 'Unisex')
    );

    // 🛡️ SÉCURITÉ UX : Vérifier si l'utilisateur essaie des items non possédés
    const hasUnownedItemsEquipped = ['head', 'body', 'legs', 'feet', 'accessory'].some(cat => {
        const equippedItemId = avatarConfig[cat];
        if (!equippedItemId || equippedItemId === 'none') return false;

        const shopItem = shopItems.find(i => i.id === equippedItemId);
        return shopItem ? !shopItem.is_owned : false;
    });

    return (
        <div
            className="flex-1 bg-white rounded-t-[3rem] shadow-[0_-20px_50px_rgba(0,0,0,0.1)] flex flex-col z-10 relative overflow-hidden min-h-0">

            {!hideTabs && (
                <div className="flex p-2 bg-gray-50 mx-6 mt-6 rounded-2xl flex-shrink-0">
                    <button onClick={() => setActiveTab('vestiaire')}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all ${activeTab === 'vestiaire' ? 'bg-white shadow-md text-gray-900' : 'text-gray-400'}`}>
                        <Shirt size={16}/> Vestiaire
                    </button>
                    <button onClick={() => setActiveTab('badges')}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all ${activeTab === 'badges' ? 'bg-white shadow-md text-gray-900' : 'text-gray-400'}`}>
                        <Medal size={16}/> Trophées
                    </button>
                </div>
            )}

            {activeTab === 'vestiaire' ? (
                <>
                    <div className="flex-shrink-0 px-6 pt-4">
                        {setGender && (
                            <div className="flex bg-gray-100 p-1 rounded-full mb-4">
                                {['Men', 'Women'].map(g => (
                                    <button key={g} onClick={() => setGender(g as Gender)}
                                            className={`flex-1 py-2.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${gender === g ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}>
                                        {g === 'Men' ? 'Homme' : 'Femme'}
                                    </button>
                                ))}
                            </div>
                        )}
                        <nav className="flex justify-around px-5 py-4 border-b border-gray-50">
                            {[{t: 'head', i: <UserIcon size={22}/>}, {t: 'body', i: <Shirt size={22}/>}, {
                                t: 'legs',
                                i: <Component size={22}/>
                            }, {t: 'feet', i: <Footprints size={22}/>}, {
                                t: 'accessory',
                                i: <Shield size={22}/>
                            }].map(item => (
                                <button key={item.t} onClick={() => setSubTab(item.t as ItemCategory)}
                                        className={`p-3 rounded-2xl transition-all ${subTab === item.t ? 'bg-beer text-white shadow-lg' : 'text-gray-300 hover:bg-gray-50'}`}>
                                    {item.i}
                                </button>
                            ))}
                        </nav>
                    </div>

                    <div className="flex-1 overflow-y-auto px-6 py-4 pb-32">
                        {readonly ? (
                            <div className="text-center py-10">
                                <Lock size={48} className="mx-auto text-gray-200 mb-4"/>
                                <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Vestiaire
                                    verrouillé.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4 animate-in fade-in duration-300">
                                {currentItems.map(item => {
                                    const isEquipped = avatarConfig[subTab] === item.id;

                                    return (
                                        <div key={item.id}
                                             className={`rounded-2xl p-4 border-4 flex flex-col transition-all ${isEquipped ? 'border-beer bg-amber-50' : 'border-gray-50 bg-gray-50'}`}>
                                            <h4 className="font-bold text-gray-800 text-sm mb-4">{item.name}</h4>

                                            <div className="mt-auto">
                                                {item.is_owned ? (
                                                    <button
                                                        onClick={() => setAvatarConfig && setAvatarConfig({
                                                            ...avatarConfig,
                                                            [subTab]: item.id
                                                        })}
                                                        className={`w-full py-2 rounded-lg text-xs font-black uppercase tracking-widest flex items-center justify-center gap-1 transition-colors ${isEquipped ? 'bg-beer text-white' : 'bg-gray-900 text-white hover:bg-gray-700'}`}
                                                    >
                                                        {isEquipped ? <><Check size={14}/> Équipé</> : 'Mettre'}
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => {
                                                            if (isEquipped) {
                                                                // Clic 2 : L'item est déjà essayé, on déclenche l'achat !
                                                                onBuy && onBuy(item.id, item.price, item.name);
                                                            } else {
                                                                // Clic 1 : L'item n'est pas équipé, on l'essaie !
                                                                setAvatarConfig && setAvatarConfig({
                                                                    ...avatarConfig,
                                                                    [subTab]: item.id
                                                                });
                                                            }
                                                        }}
                                                        className={`w-full py-2 rounded-lg text-xs font-black uppercase tracking-widest flex items-center justify-center gap-1 transition-colors ${isEquipped ? 'bg-amber-500 text-white shadow-md hover:bg-amber-600' : 'bg-amber-100 text-amber-600 hover:bg-amber-200'}`}
                                                    >
                                                        {/* Le texte change dynamiquement si on est en train de l'essayer */}
                                                        {isEquipped ? (
                                                            <>Acheter ({item.price} 💊)</>
                                                        ) : (
                                                            <>Essayer <Lock size={12} className="ml-1"/></>
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </>
            ) : (
                /* ONGLET TROPHÉES (BADGES) */
                <div className="flex-1 overflow-y-auto px-6 py-4 pb-32 space-y-4 animate-in fade-in duration-300">
                    {badges && badges.length > 0 ? (
                        badges.map(badge => (
                            <div key={badge.id} className="bg-gradient-to-br from-amber-100 to-amber-50 p-4 rounded-2xl border-2 border-amber-200 flex items-center gap-4 shadow-sm hover:scale-[1.02] transition-transform">
                                <div className="w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center text-white shadow-inner flex-shrink-0 text-xl">
                                    {badge.icon}
                                </div>
                                <div>
                                    <h4 className="font-black text-amber-900 uppercase italic tracking-tighter">{badge.name}</h4>
                                    <p className="text-xs font-bold text-amber-700/70 mt-0.5">{badge.description}</p>
                                </div>
                            </div>
                        ))
                    ) : (
                        /* AFFICHAGE SI AUCUN BADGE */
                        <div className="text-center py-10 opacity-60">
                            <Medal size={48} className="mx-auto text-gray-300 mb-4" />
                            <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Aucun trophée remporté.</p>
                            <p className="text-gray-300 text-[10px] font-bold mt-2">Participe à des apéros pour en gagner !</p>
                        </div>
                    )}
                </div>
            )}

            {!readonly && activeTab === 'vestiaire' && (
                <div
                    className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-white via-white/95 to-transparent pt-12 z-20 pointer-events-none">
                    <button
                        onClick={onEquipAndSave}
                        // On bloque la sauvegarde si le mec essaie de voler des sapes !
                        disabled={isSubmitting || hasUnownedItemsEquipped}
                        className="w-full bg-beer text-white p-5 rounded-[2rem] font-black text-lg shadow-xl shadow-beer/30 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50 disabled:bg-gray-400 pointer-events-auto"
                    >
                        {isSubmitting ? 'EN COURS...' : (
                            hasUnownedItemsEquipped
                                ? 'ACHÈTE LES ITEMS ESSAYÉS'
                                : (setGender ? 'VALIDER MON PERSONNAGE' : 'SAUVEGARDER LA TENUE')
                        )}
                        {hasUnownedItemsEquipped ? <ShoppingCart size={20}/> : <Check size={20}/>}
                    </button>
                </div>
            )}
        </div>
    );
}