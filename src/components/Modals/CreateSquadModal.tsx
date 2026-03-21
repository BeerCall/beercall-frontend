import { useState } from 'react';
import { X, Check, Beer, Martini, Pizza, Rocket, Ghost, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

const ICONS = [
    { id: 'beer', icon: <Beer /> },
    { id: 'cocktail', icon: <Martini /> },
    { id: 'pizza', icon: <Pizza /> },
    { id: 'rocket', icon: <Rocket /> },
    { id: 'ghost', icon: <Ghost /> },
    { id: 'fire', icon: <Flame /> },
];

const COLORS = ['#F59E0B', '#EF4444', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899'];

export default function CreateSquadModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
    const queryClient = useQueryClient();
    const [name, setName] = useState('');
    const [selectedIcon, setSelectedIcon] = useState('beer');
    const [selectedColor, setSelectedColor] = useState(COLORS[0]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleCreate = async () => {
        if (!name) return;
        setIsSubmitting(true);
        try {
            await api.post('/squads/', {
                name,
                icon: selectedIcon,
                color: selectedColor
            });
            // RAFRAÎCHISSEMENT RÉEL DE LA ROULETTE
            queryClient.invalidateQueries({ queryKey: ['squads'] });
            onClose();
            setName('');
        } catch (err) {
            console.error("Erreur création Squad:", err);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
                    />
                    <motion.div
                        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[3rem] p-8 z-[101] shadow-2xl"
                    >
                        <div className="flex justify-between items-center mb-8">
                            <h2 className="text-2xl font-black text-gray-900 uppercase italic tracking-tighter">Nouvelle Squad</h2>
                            <button onClick={onClose} className="p-2 bg-gray-100 rounded-full text-gray-400"><X size={20}/></button>
                        </div>

                        <div className="space-y-8">
                            {/* APERÇU LOGO */}
                            <div className="flex justify-center">
                                <div
                                    className="w-24 h-24 rounded-[2rem] flex items-center justify-center text-white shadow-xl transition-colors duration-500"
                                    style={{ backgroundColor: selectedColor }}
                                >
                                    {ICONS.find(i => i.id === selectedIcon)?.icon}
                                </div>
                            </div>

                            {/* NOM */}
                            <input
                                type="text" placeholder="Nom de la Squad..."
                                value={name} onChange={(e) => setName(e.target.value)}
                                className="w-full p-5 rounded-2xl bg-gray-50 border-4 border-transparent focus:border-beer focus:outline-none font-bold text-lg transition-all"
                            />

                            {/* CHOIX ICÔNE */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-gray-300 uppercase tracking-widest ml-1">Choisir un Emblème</label>
                                <div className="flex justify-between">
                                    {ICONS.map(i => (
                                        <button
                                            key={i.id} onClick={() => setSelectedIcon(i.id)}
                                            className={`p-3 rounded-xl border-4 transition-all ${selectedIcon === i.id ? 'border-gray-900 bg-gray-900 text-white' : 'border-transparent bg-gray-50 text-gray-400'}`}
                                        >
                                            {i.icon}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* CHOIX COULEUR */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-gray-300 uppercase tracking-widest ml-1">Couleur d'Étendard</label>
                                <div className="flex justify-between">
                                    {COLORS.map(c => (
                                        <button
                                            key={c} onClick={() => setSelectedColor(c)}
                                            className={`w-10 h-10 rounded-full border-4 transition-all ${selectedColor === c ? 'border-gray-900 scale-125' : 'border-white shadow-sm'}`}
                                            style={{ backgroundColor: c }}
                                        />
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={handleCreate}
                                disabled={!name || isSubmitting}
                                className="w-full bg-beer text-white p-6 rounded-[2rem] font-black text-xl shadow-xl shadow-beer/30 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-30"
                            >
                                {isSubmitting ? 'CRÉATION...' : 'CRÉER LA SQUAD'} <Check size={24}/>
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}