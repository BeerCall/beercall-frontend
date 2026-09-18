import {useState} from 'react';
import {motion, AnimatePresence} from 'framer-motion';
import {X, MapPin, Clock, CalendarClock, Info} from 'lucide-react';
import {useScheduledAperoMutations} from '../../hooks/useScheduledAperoMutations';

import {toast} from '../../store/useToastStore';

export default function ScheduleAperoModal({isOpen, onClose, squadId, coordinates}: {isOpen: boolean; onClose: () => void; squadId: string; coordinates: {lat: number; lng: number} | null}) {
    const [locationName, setLocationName] = useState('');
    const [scheduledFor, setScheduledFor] = useState('');
    const {scheduleApero} = useScheduledAperoMutations(squadId);

    const submit = () => {
        const date = new Date(scheduledFor);
        if (!locationName.trim() || Number.isNaN(date.getTime()) || date <= new Date()) return;
        scheduleApero.mutate(
            {location_name: locationName.trim(), latitude: coordinates!.lat, longitude: coordinates!.lng, scheduled_for: date.toISOString()},
            {
                onSuccess: onClose,
                onError: (err: any) => {
                    const errorMessage = err.response?.data?.detail || "Erreur lors de la programmation.";
                    toast.error("Impossible de programmer 🚫", errorMessage);
                }
            }
        );
    };

    const dateObj = new Date(scheduledFor);
    const isFormValid = locationName.trim().length > 0 && scheduledFor !== '' && !Number.isNaN(dateObj.getTime()) && dateObj > new Date();

    return (
        <AnimatePresence>
            {isOpen && coordinates && (
                <>
                    <motion.div
                        initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}}
                        className="fixed inset-0 bg-black/80 backdrop-blur-md z-[120]"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{y: "100%"}} animate={{y: 0}} exit={{y: "100%"}}
                        transition={{type: "spring", damping: 25, stiffness: 200}}
                        className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[3rem] p-8 z-[121] shadow-2xl flex flex-col max-h-[90vh]"
                    >
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-black text-gray-900 uppercase italic tracking-tighter">
                                Programmer l'Apéro
                            </h2>
                            <button onClick={onClose} className="p-2 bg-gray-100 rounded-full text-gray-400 hover:bg-gray-200 transition-colors">
                                <X size={20}/>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-6 pb-24">
                            {/* INFOS DU LIEU */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-1">
                                    <MapPin size={12}/> Nom du lieu de ralliement <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text" 
                                    placeholder="Ex: Bar Le Central, Parc..."
                                    value={locationName} 
                                    onChange={e => setLocationName(e.target.value)} 
                                    className="w-full p-5 rounded-2xl bg-gray-50 border-4 border-transparent focus:border-beer focus:outline-none font-bold text-lg transition-all"
                                />
                            </div>

                            {/* DATE ET HEURE */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-1">
                                    <Clock size={12}/> Date & Heure <span className="text-red-500">*</span>
                                </label>
                                <input 
                                    required 
                                    type="datetime-local" 
                                    value={scheduledFor} 
                                    onChange={e => setScheduledFor(e.target.value)} 
                                    className="w-full p-5 rounded-2xl bg-gray-50 border-4 border-transparent focus:border-beer focus:outline-none font-bold text-lg transition-all" 
                                />
                            </div>

                            {/* TEXTE INFORMATIF */}
                            <div className="bg-gray-50 p-4 rounded-2xl border-2 border-gray-100 flex items-start gap-3">
                                <div className="mt-0.5 text-beer">
                                    <Info size={18} />
                                </div>
                                <p className="text-xs text-gray-500 font-bold leading-tight">
                                    Le premier membre présent devra prendre une photo pour valider et démarrer officiellement l'apéro le jour J.
                                </p>
                            </div>
                        </div>

                        <div className="absolute bottom-8 left-8 right-8">
                            <button 
                                onClick={submit}
                                disabled={scheduleApero.isPending || !isFormValid}
                                className="w-full bg-beer text-white p-6 rounded-[2.5rem] font-black text-xl shadow-xl shadow-beer/30 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale"
                            >
                                {scheduleApero.isPending ? 'PROGRAMMATION...' : 'PROGRAMMER'} <CalendarClock size={24}/>
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
