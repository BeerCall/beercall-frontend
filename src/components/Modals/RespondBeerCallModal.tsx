import {useState, useRef, useEffect} from 'react';
import {X, Camera, Send, Beer, Ghost, MessageSquare, Check} from 'lucide-react';
import {motion, AnimatePresence} from 'framer-motion';
import {useQueryClient} from '@tanstack/react-query';
import {api} from '../../lib/api';
import {toast} from '../../store/useToastStore';

// 🚀 NOUVELLE FONCTION : Compression + Correction EXIF Apple
const processImageForBackend = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1200;
                const MAX_HEIGHT = 1200;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');

                // Dessine la photo (efface les métadonnées de rotation d'Apple)
                ctx?.drawImage(img, 0, 0, width, height);

                // Convertit en pur JPEG
                canvas.toBlob((blob) => {
                    if (blob) {
                        const newFileName = file.name.replace(/\.[^/.]+$/, "") + "_fixed.jpg";
                        const newFile = new File([blob], newFileName, {type: 'image/jpeg'});
                        resolve(newFile);
                    } else {
                        reject(new Error("Erreur Blob"));
                    }
                }, 'image/jpeg', 0.8);
            };
        };
        reader.onerror = (error) => reject(error);
    });
};

interface RespondBeerCallModalProps {
    isOpen: boolean;
    onClose: () => void;
    beerCall: any;
    squadId: string;
    location: { lat: number; lng: number } | null;
}

type Step = 'dilemma' | 'accepting' | 'declining';

export default function RespondBeerCallModal({
                                                 isOpen,
                                                 onClose,
                                                 beerCall,
                                                 squadId,
                                                 location
                                             }: RespondBeerCallModalProps) {
    const queryClient = useQueryClient();

    const [step, setStep] = useState<Step>('dilemma');
    const [excuse, setExcuse] = useState('');
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Reset la modale quand on la ferme ou qu'on l'ouvre
    useEffect(() => {
        if (isOpen) {
            setStep('dilemma');
            setExcuse('');
            setPhotoFile(null);
            setPreviewUrl(null);
        }
    }, [isOpen]);

    // Générer l'aperçu de la photo
    useEffect(() => {
        if (photoFile) {
            const url = URL.createObjectURL(photoFile);
            setPreviewUrl(url);
            return () => URL.revokeObjectURL(url);
        }
    }, [photoFile]);

    const openCamera = () => {
        if (fileInputRef.current) fileInputRef.current.click();
    };

    const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setPhotoFile(e.target.files[0]);
        }
    };

    // --- APPEL API : REFUSER ---
    const handleDecline = async () => {
        setIsSubmitting(true);
        try {
            await api.post(`/squads/${squadId}/beer-calls/${beerCall.id}/decline/`, {excuse});
            await queryClient.invalidateQueries({queryKey: ['squad', squadId]});
            onClose();
        } catch (err) {
            console.error("Erreur Decline:", err);
            toast.error("Erreur", "Impossible d'envoyer l'excuse !");
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- APPEL API : ACCEPTER ---
    const handleAccept = async () => {
        if (!photoFile || !location) {
            toast.error("Erreur GPS", "Localisation introuvable. Vérifie que ton GPS est activé !");
            return;
        }

        setIsSubmitting(true);
        try {
            // 🚀 Compression et correction de la photo avant l'envoi
            const fixedPhoto = await processImageForBackend(photoFile);

            const formData = new FormData();
            formData.append('file', fixedPhoto);
            formData.append('lat', location.lat.toString());
            formData.append('lon', location.lng.toString());

            await api.post(`/squads/${squadId}/beer-calls/${beerCall.id}/join/`, formData, {
                headers: {'Content-Type': 'multipart/form-data'},
            });

            await queryClient.invalidateQueries({queryKey: ['squad', squadId]});
            onClose();
        } catch (err: any) {
            console.error("Erreur Accept:", err);
            const errorMessage = err.response?.data?.detail || "L'IA a rejeté ta bière (ou le serveur a planté) !";
            toast.error("Échec", errorMessage);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!beerCall) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100]"
                        onClick={onClose}
                    />

                    <motion.div
                        initial={{y: "100%", scale: 0.9}} animate={{y: 0, scale: 1}} exit={{y: "100%", scale: 0.9}}
                        transition={{type: "spring", damping: 25, stiffness: 200}}
                        className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[3rem] p-8 z-[101] shadow-2xl flex flex-col"
                    >
                        {/* 🚀 L'attribut capture="environment" a été retiré ! */}
                        <input
                            type="file" accept="image/jpeg, image/png, image/jpg"
                            ref={fileInputRef} onChange={handlePhotoCapture} className="hidden"
                        />

                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-black text-gray-900 uppercase italic tracking-tighter">
                                {step === 'dilemma' && 'Appel aux armes !'}
                                {step === 'declining' && 'L\'Esquive'}
                                {step === 'accepting' && 'Prouve-le !'}
                            </h2>
                            <button onClick={onClose}
                                    className="p-2 bg-gray-100 rounded-full text-gray-400 hover:bg-gray-200">
                                <X size={20}/>
                            </button>
                        </div>

                        {/* ÉTAPE 1 : LE CHOIX */}
                        {step === 'dilemma' && (
                            <motion.div initial={{opacity: 0, x: -20}} animate={{opacity: 1, x: 0}}
                                        className="space-y-6">
                                <div className="bg-gray-50 p-6 rounded-3xl border-2 border-gray-100 text-center">
                                    <p className="text-gray-400 font-bold text-xs uppercase tracking-widest mb-2">Lieu
                                        de ralliement</p>
                                    <h3 className="text-xl font-black text-gray-900 italic">{beerCall.location_name}</h3>
                                    <p className="text-sm font-bold text-beer mt-2">Lancé
                                        par {beerCall.creator_name}</p>
                                </div>

                                <div className="flex gap-4">
                                    <button
                                        onClick={() => setStep('declining')}
                                        className="flex-1 bg-gray-100 text-gray-500 p-4 rounded-[2rem] font-black text-sm uppercase tracking-widest flex flex-col items-center gap-2 hover:bg-gray-200 transition-colors"
                                    >
                                        <Ghost size={28}/> Je Passe
                                    </button>
                                    <button
                                        onClick={() => {
                                            setStep('accepting');
                                            openCamera(); // On ouvre l'appareil photo direct !
                                        }}
                                        className="flex-1 bg-beer text-white p-4 rounded-[2rem] font-black text-sm uppercase tracking-widest flex flex-col items-center gap-2 shadow-xl shadow-beer/30 hover:scale-105 transition-all"
                                    >
                                        <Beer size={28}/> J'y Vais !
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* ÉTAPE 2A : REFUSER (EXCUSE) */}
                        {step === 'declining' && (
                            <motion.div initial={{opacity: 0, x: 20}} animate={{opacity: 1, x: 0}}
                                        className="space-y-6">
                                <div className="space-y-3">
                                    <label
                                        className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-1">
                                        <MessageSquare size={12}/> Ton excuse (bidon)
                                    </label>
                                    <textarea
                                        placeholder="J'ai aqua-poney..."
                                        value={excuse}
                                        onChange={(e) => setExcuse(e.target.value)}
                                        className="w-full p-5 rounded-2xl bg-gray-50 border-4 border-transparent focus:border-gray-900 focus:outline-none font-bold text-sm transition-all resize-none h-32"
                                    />
                                </div>
                                <button
                                    onClick={handleDecline} disabled={isSubmitting || !excuse}
                                    className="w-full bg-gray-900 text-white p-5 rounded-[2rem] font-black text-lg shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
                                >
                                    {isSubmitting ? 'ENVOI...' : 'ASSUMER MON ABSENCE'} <Send size={20}/>
                                </button>
                            </motion.div>
                        )}

                        {/* ÉTAPE 2B : ACCEPTER (PHOTO IA) */}
                        {step === 'accepting' && (
                            <motion.div initial={{opacity: 0, x: 20}} animate={{opacity: 1, x: 0}}
                                        className="space-y-6">

                                {!photoFile ? (
                                    <div
                                        onClick={openCamera}
                                        className="w-full aspect-square border-4 border-dashed border-gray-200 rounded-[2rem] flex flex-col items-center justify-center text-gray-400 cursor-pointer hover:bg-gray-50 hover:border-beer transition-all"
                                    >
                                        <Camera size={48} className="mb-4"/>
                                        <p className="font-black uppercase tracking-widest text-xs">Prendre ou choisir
                                            une photo</p>
                                    </div>
                                ) : (
                                    <div
                                        className="relative w-full aspect-[4/3] rounded-[2rem] overflow-hidden shadow-inner bg-gray-900 group">
                                        <img src={previewUrl!} alt="Preview" className="w-full h-full object-cover"/>
                                        <button
                                            onClick={openCamera}
                                            className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white font-black uppercase tracking-widest transition-opacity"
                                        >
                                            Reprendre la photo
                                        </button>
                                    </div>
                                )}

                                <button
                                    onClick={handleAccept} disabled={isSubmitting || !photoFile}
                                    className="w-full bg-beer text-white p-5 rounded-[2rem] font-black text-lg shadow-xl shadow-beer/30 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
                                >
                                    {isSubmitting ? 'SCAN IA EN COURS...' : 'VALIDATION IA'} <Check size={20}/>
                                </button>
                            </motion.div>
                        )}

                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}