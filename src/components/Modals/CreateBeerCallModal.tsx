import {useState, useEffect} from 'react';
import {X, Send, MapPin} from 'lucide-react';
import {motion, AnimatePresence} from 'framer-motion';
import {useQueryClient} from '@tanstack/react-query';
import {api} from '../../lib/api';

interface CreateBeerCallModalProps {
    squadId: string;
    photoFile: File | null;
    location: { lat: number; lng: number } | null;
    onClose: () => void;
}

export default function CreateBeerCallModal({squadId, photoFile, location, onClose}: CreateBeerCallModalProps) {
    const queryClient = useQueryClient();
    const [locationName, setLocationName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    // Générer l'aperçu de l'image
    useEffect(() => {
        if (photoFile) {
            const url = URL.createObjectURL(photoFile);
            setPreviewUrl(url);
            return () => URL.revokeObjectURL(url); // Cleanup
        }
    }, [photoFile]);

    const handleSubmit = async () => {
        if (!photoFile || !location) return;
        setIsSubmitting(true);

        try {
            // ⚠️ Format Multipart pour l'upload d'image vers FastAPI
            const formData = new FormData();
            formData.append('file', photoFile);
            formData.append('latitude', location.lat.toString());
            formData.append('longitude', location.lng.toString());
            formData.append('location_name', locationName || 'Lieu inconnu');

            // POST /squads/{id}/beer-calls (à adapter selon ton routeur FastAPI)
            await api.post(`/squads/${squadId}/beer-calls/`, formData, {
                headers: {'Content-Type': 'multipart/form-data'},
            });

            // On rafraîchit les détails de la squad pour voir le nouvel apéro
            queryClient.invalidateQueries({queryKey: ['squad', squadId]});
            onClose();
        } catch (err) {
            console.error("Erreur lors de l'envoi du Beer Call :", err);
            alert("Erreur lors de l'envoi. T'as renversé ta bière sur le serveur ?");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AnimatePresence>
            {photoFile && (
                <>
                    <motion.div
                        initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}}
                        className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100]"
                    />
                    <motion.div
                        initial={{y: "100%"}} animate={{y: 0}} exit={{y: "100%"}}
                        transition={{type: "spring", damping: 25, stiffness: 200}}
                        className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[3rem] p-8 z-[101] shadow-2xl flex flex-col max-h-[90vh]"
                    >
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-black text-gray-900 uppercase italic tracking-tighter">Valider
                                l'Apéro</h2>
                            <button onClick={onClose} className="p-2 bg-gray-100 rounded-full text-gray-400"><X
                                size={20}/></button>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-6 pb-24">
                            {/* APERÇU DE LA PHOTO */}
                            <div
                                className="relative w-full aspect-[3/4] rounded-[2rem] overflow-hidden shadow-inner bg-gray-900">
                                {previewUrl &&
                                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover"/>}
                                <div
                                    className="absolute top-4 right-4 bg-black/50 backdrop-blur px-3 py-1 rounded-full border border-white/20">
                                    <span
                                        className="text-xs font-black text-white uppercase tracking-widest">Preuve 📸</span>
                                </div>
                            </div>

                            {/* INFOS DU LIEU */}
                            <div className="space-y-3">
                                <label
                                    className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-1">
                                    <MapPin size={12}/> Nom du bar / lieu
                                </label>
                                <input
                                    type="text" placeholder="Ex: Bar Le Central..."
                                    value={locationName} onChange={(e) => setLocationName(e.target.value)}
                                    className="w-full p-5 rounded-2xl bg-gray-50 border-4 border-transparent focus:border-beer focus:outline-none font-bold text-lg transition-all"
                                />
                            </div>
                        </div>

                        <div className="absolute bottom-8 left-8 right-8">
                            <button
                                onClick={handleSubmit} disabled={isSubmitting || !location}
                                className="w-full bg-beer text-white p-6 rounded-[2.5rem] font-black text-xl shadow-xl shadow-beer/30 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
                            >
                                {isSubmitting ? 'ANALYSE IA EN COURS...' : 'LANCER L\'APPEL'} <Send size={24}/>
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}