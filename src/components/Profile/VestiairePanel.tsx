import {useState, useEffect} from 'react';
import {Check, Play, ShoppingBag} from 'lucide-react';
import type {ShopItem} from "../../hooks/useProfile.ts";

export type Gender = 'Men' | 'Women' | 'Unisex';

interface VestiairePanelProps {
    shopItems?: ShopItem[]; // 🚀 On autorise undefined ici
    avatarConfig: any;
    setAvatarConfig: (config: any) => void;
    gender: Gender;
    setGender?: (gender: Gender) => void;
    badges?: any[];
    onBuy?: (itemId: string, price: number, itemName: string) => void;
    onEquipAndSave?: () => void;
    isSubmitting?: boolean;
    readonly?: boolean;
    hideTabs?: boolean;
    availableAnimations?: string[];
}

export default function VestiairePanel({
                                           shopItems,
                                           avatarConfig,
                                           setAvatarConfig,
                                           gender,
                                           setGender,
                                           onBuy,
                                           onEquipAndSave,
                                           isSubmitting = false,
                                           readonly = false,
                                           hideTabs = false,
                                           availableAnimations = []
                                       }: VestiairePanelProps) {
    const [activeTab, setActiveTab] = useState('head');
    const [hasChanges, setHasChanges] = useState(false);
    const [initialConfig, setInitialConfig] = useState<any>(null);

    useEffect(() => {
        if (!initialConfig && avatarConfig) {
            setInitialConfig(JSON.parse(JSON.stringify(avatarConfig)));
        }
    }, [avatarConfig, initialConfig]);

    useEffect(() => {
        if (initialConfig && avatarConfig) {
            const isDifferent = JSON.stringify(initialConfig) !== JSON.stringify(avatarConfig);
            setHasChanges(isDifferent);
        }
    }, [avatarConfig, initialConfig]);

    const categories = [
        {id: 'head', icon: '🧢', label: 'Tête'},
        {id: 'body', icon: '👕', label: 'Haut'},
        {id: 'legs', icon: '👖', label: 'Bas'},
        {id: 'feet', icon: '👟', label: 'Pieds'},
        {id: 'accessory', icon: '🎒', label: 'Accessoire'},
        {id: 'animation', icon: '✨', label: 'Anim'}
    ];

    const handleEquip = (category: string, itemId: string) => {
        if (readonly) return;
        setAvatarConfig({...avatarConfig, [category]: itemId});
    };

    const handleSave = () => {
        if (onEquipAndSave) {
            onEquipAndSave();
            setInitialConfig(JSON.parse(JSON.stringify(avatarConfig)));
            setHasChanges(false);
        }
    };

    // 🚀 SÉCURITÉ 2 : On force (shopItems || []) avant de filter
    const itemsToDisplay = (shopItems || []).filter(item =>
        item.category === activeTab &&
        (item.gender === gender || item.gender === 'Unisex')
    );

    // 🚀 SÉCURITÉ 3 : On force (shopItems || []) avant de find
    const hasUnownedItemsEquipped = ['head', 'body', 'legs', 'feet', 'accessory'].some(cat => {
        const equippedId = avatarConfig[cat];
        if (equippedId === 'none') return false;
        const item = (shopItems || []).find(i => i.id === equippedId);
        return item && !(item as any).is_owned;
    });

    return (
        <div
            className="flex-1 flex flex-col bg-white rounded-t-[3rem] shadow-[0_-20px_50px_rgba(0,0,0,0.1)] overflow-hidden relative z-20">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center bg-white z-10 shadow-sm shrink-0">
                <div>
                    <h2 className="text-2xl font-black text-gray-900 uppercase italic tracking-tighter leading-none">Vestiaire</h2>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Personnalise ton
                        style</p>
                </div>
                {setGender && !readonly && (
                    <div className="flex bg-gray-100 p-1 rounded-xl shadow-inner shrink-0">
                        <button onClick={() => setGender('Men')}
                                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${gender === 'Men' ? 'bg-white text-beer shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>Homme
                        </button>
                        <button onClick={() => setGender('Women')}
                                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${gender === 'Women' ? 'bg-white text-beer shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>Femme
                        </button>
                    </div>
                )}
            </div>

            {!hideTabs && (
                <div
                    className="flex overflow-x-auto px-6 py-2 gap-2 hide-scrollbar bg-gray-50/50 border-y border-gray-100 shrink-0">
                    {categories.map(cat => (
                        <button key={cat.id} onClick={() => setActiveTab(cat.id)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl whitespace-nowrap transition-all active:scale-95 ${activeTab === cat.id ? 'bg-gray-900 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-100'}`}>
                            <span className="text-lg">{cat.icon}</span>
                            <span className="font-black text-[10px] uppercase tracking-wider">{cat.label}</span>
                        </button>
                    ))}
                </div>
            )}

            <div
                className="flex-1 overflow-y-auto p-6 grid grid-cols-2 sm:grid-cols-3 gap-4 pb-32 hide-scrollbar content-start">
                {activeTab === 'animation' ? (
                    (availableAnimations || []).map((animName) => {
                        const isEquipped = avatarConfig.animation === animName;
                        return (
                            <button key={animName}
                                    onClick={() => !readonly && setAvatarConfig({...avatarConfig, animation: animName})}
                                    disabled={readonly}
                                    className={`relative p-4 rounded-3xl flex flex-col items-center justify-center gap-3 border-2 transition-all active:scale-95 ${isEquipped ? 'bg-amber-50/50 border-beer shadow-[0_0_20px_rgba(217,119,6,0.15)] scale-105' : 'bg-white border-gray-100 hover:border-gray-300 hover:shadow-md'}`}>
                                <div
                                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isEquipped ? 'bg-beer text-white shadow-inner' : 'bg-gray-50 text-gray-400'}`}>
                                    <Play size={24} className={isEquipped ? 'fill-white' : 'fill-gray-300'}/>
                                </div>
                                <span
                                    className={`text-[10px] font-black uppercase tracking-wider text-center leading-tight ${isEquipped ? 'text-beer' : 'text-gray-500'}`}>
                                    {animName.replace(/_/g, ' ')}
                                </span>
                                {isEquipped && <div
                                    className="absolute top-3 right-3 w-3 h-3 bg-beer rounded-full animate-pulse shadow-sm"/>}
                            </button>
                        );
                    })
                ) : (
                    <>
                        {activeTab === 'accessory' && (
                            <button onClick={() => handleEquip(activeTab, 'none')}
                                    className={`relative p-4 rounded-3xl border-2 flex flex-col items-center justify-center gap-2 transition-all active:scale-95 ${avatarConfig[activeTab] === 'none' ? 'border-beer bg-amber-50/50 shadow-sm scale-105' : 'border-gray-100 bg-white hover:border-gray-300'}`}>
                                <div
                                    className="w-12 h-12 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center mb-1">
                                    <span className="text-gray-300 text-xl font-black">X</span></div>
                                <span
                                    className={`text-[10px] font-black uppercase tracking-wider ${avatarConfig[activeTab] === 'none' ? 'text-beer' : 'text-gray-400'}`}>Aucun</span>
                            </button>
                        )}

                        {itemsToDisplay.map(item => {
                            const isEquipped = avatarConfig[activeTab] === item.id;
                            const isOwned = (item as any).is_owned;

                            return (
                                <button key={item.id} onClick={() => {
                                    if (!readonly) handleEquip(activeTab, item.id);
                                }}
                                        className={`relative p-4 rounded-3xl border-2 flex flex-col items-center text-center transition-all active:scale-95 ${isEquipped ? 'border-beer bg-amber-50/50 shadow-[0_0_20px_rgba(217,119,6,0.15)] scale-105' : 'border-gray-100 bg-white hover:border-gray-300 hover:shadow-md'}`}>
                                    <div
                                        className="w-16 h-16 bg-gray-100 rounded-2xl mb-3 flex items-center justify-center text-3xl shadow-inner">
                                        {activeTab === 'head' && '🧢'}{activeTab === 'body' && '👕'}{activeTab === 'legs' && '👖'}{activeTab === 'feet' && '👟'}{activeTab === 'accessory' && '🎒'}
                                    </div>
                                    <span
                                        className={`text-[10px] font-black uppercase tracking-wider mb-2 leading-tight ${isEquipped ? 'text-beer' : 'text-gray-700'}`}>{item.name}</span>
                                    <div className="mt-auto w-full">
                                        {!isOwned ? (
                                            <button onClick={(e) => {
                                                e.stopPropagation();
                                                if (!readonly && onBuy) onBuy(item.id, item.price, item.name);
                                            }}
                                                    className="w-full bg-gray-900 text-white text-[9px] font-black px-2 py-2 rounded-xl uppercase tracking-widest flex items-center justify-center gap-1 shadow-md hover:bg-black active:scale-95 transition-all">
                                                <ShoppingBag size={12}/> ACHETER {item.price}
                                            </button>
                                        ) : isEquipped ? (
                                            <div
                                                className="bg-beer text-white text-[9px] font-black px-2 py-1.5 rounded-xl uppercase tracking-widest flex items-center justify-center gap-1">
                                                <Check size={12}/> Équipé</div>
                                        ) : (
                                            <div
                                                className="bg-gray-100 text-gray-500 text-[9px] font-black px-2 py-1.5 rounded-xl uppercase tracking-widest flex items-center justify-center gap-1">Possédé</div>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </>
                )}
            </div>

            {!readonly && hasChanges && (
                <div
                    className="absolute bottom-6 left-6 right-6 z-50 animate-in slide-in-from-bottom-10 fade-in duration-300">
                    <button onClick={handleSave} disabled={isSubmitting || hasUnownedItemsEquipped}
                            className={`w-full text-white p-5 rounded-[2rem] font-black text-sm uppercase tracking-widest shadow-2xl flex justify-center items-center gap-2 transition-all ${hasUnownedItemsEquipped ? 'bg-gray-400 opacity-90' : 'bg-gray-900 hover:scale-[1.02] active:scale-95 shadow-black/20'} ${isSubmitting ? 'opacity-50' : ''}`}>
                        {isSubmitting ? <div
                            className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : hasUnownedItemsEquipped ? <>ACHETEZ
                            POUR SAUVEGARDER <ShoppingBag size={18}/></> : <>SAUVEGARDER LE STYLE <Check size={18}/></>}
                    </button>
                </div>
            )}
        </div>
    );
}