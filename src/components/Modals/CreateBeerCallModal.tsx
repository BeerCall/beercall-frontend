import {useState, useEffect, useRef} from 'react';
import type {AxiosResponse} from 'axios';
import {X, Send, MapPin} from 'lucide-react';
import {motion, AnimatePresence} from 'framer-motion';
import {useQueryClient} from '@tanstack/react-query';
import {api} from '../../lib/api';
import {toast} from '../../store/useToastStore';
import type {BeerCall} from '../../types/dashboard';
import {useBeerCallJob} from '../../hooks/useBeerCallJob';
import {processBeerCallImage, ImagePreparationError} from '../../lib/processBeerCallImage';
import {useLocationStore} from '../../store/useLocationStore';

type SubmissionPhase = 'idle' | 'preparing' | 'uploading';

interface CreateBeerCallModalProps {
    squadId: string;
    photoFile: File | null;
    location: { lat: number; lng: number } | null;
    scheduledApero?: BeerCall | null;
    onClose: () => void;
}

export default function CreateBeerCallModal({squadId, photoFile, location, scheduledApero, onClose}: CreateBeerCallModalProps) {
    const queryClient = useQueryClient();
    const [draftLocationName, setLocationName] = useState('');
    const locationName = scheduledApero?.location_name || draftLocationName;
    const [submissionPhase, setSubmissionPhase] = useState<SubmissionPhase>('idle');
    const isSubmittingRef = useRef(false);
    const [preview, setPreview] = useState<{file: File; url: string} | null>(null);
    const previewUrl = preview?.file === photoFile ? preview.url : null;
    const [jobId, setJobId] = useState<string | null>(null);
    const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
    const handledJob = useRef<string | null>(null);

    const { status, rejectReason, trackingUnavailable, trackingPaused, resumeTracking } = useBeerCallJob(squadId, jobId);
    // Abonnement au fix courant : la perte de permission désactive le bouton
    // d'une modale déjà ouverte, sans attendre un nouveau clic.
    const hasLiveFix = useLocationStore(state =>
        state.hasSessionFix && state.locationStatus === 'available' && state.userLocation !== null);

    const isTerminal = status === 'succeeded' || status === 'rejected' || status === 'failed';
    // État dérivé : un job terminé n'est plus en cours de soumission, sans setState dans un effet.
    const phase: SubmissionPhase = isTerminal ? 'idle' : submissionPhase;
    const isSubmitting = phase !== 'idle' || Boolean(jobId && !isTerminal);

    const [slowNoticeJobId, setSlowNoticeJobId] = useState<string | null>(null);
    const [checkingJobId, setCheckingJobId] = useState<string | null>(null);
    const checkCooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Chaque changement de job (ou passage terminal) invalide les timers du précédent :
    // un callback périmé ne peut ni afficher la notice ni relâcher un autre cooldown.
    const jobGenerationRef = useRef(0);

    // Le drapeau est indexé par job : changer de job masque la notice sans remise à zéro synchrone.
    const showSlowNotice = Boolean(jobId) && !isTerminal && slowNoticeJobId === jobId;
    const isCheckingStatus = Boolean(jobId) && !isTerminal && checkingJobId === jobId;

    useEffect(() => {
        jobGenerationRef.current += 1;
        if (checkCooldownTimerRef.current !== null) {
            window.clearTimeout(checkCooldownTimerRef.current);
            checkCooldownTimerRef.current = null;
        }

        if (!jobId || isTerminal) {
            return;
        }

        const generation = jobGenerationRef.current;
        const timer = window.setTimeout(() => {
            if (jobGenerationRef.current !== generation) return;
            setSlowNoticeJobId(jobId);
        }, 10000);

        return () => {
            window.clearTimeout(timer);
        };
    }, [jobId, isTerminal]);

    useEffect(() => {
        return () => {
            jobGenerationRef.current += 1;
            if (checkCooldownTimerRef.current !== null) {
                window.clearTimeout(checkCooldownTimerRef.current);
                checkCooldownTimerRef.current = null;
            }
        };
    }, []);

    const handleCheckStatus = () => {
        if (isCheckingStatus || !jobId || isTerminal) return;
        setCheckingJobId(jobId);
        resumeTracking();
        if (checkCooldownTimerRef.current !== null) {
            window.clearTimeout(checkCooldownTimerRef.current);
        }
        const generation = jobGenerationRef.current;
        const checkedJobId = jobId;
        checkCooldownTimerRef.current = window.setTimeout(() => {
            checkCooldownTimerRef.current = null;
            if (jobGenerationRef.current !== generation) return;
            setCheckingJobId(current => (current === checkedJobId ? null : current));
        }, 1000);
    };

    useEffect(() => {
        if (!jobId || !isTerminal || handledJob.current === jobId) return;
        handledJob.current = jobId;
        isSubmittingRef.current = false;
        if (status === 'succeeded') {
            queryClient.invalidateQueries({queryKey: ['squad', squadId]});
            onClose();
        } else if (status === 'rejected') {
            toast.error("Alerte Fraude 🚨", rejectReason || "Photo refusée !");
        } else if (status === 'failed') {
            toast.error("Erreur", "Une erreur technique est survenue.");
        }
    }, [jobId, isTerminal, status, rejectReason, onClose, squadId, queryClient]);

    useEffect(() => {
        if (photoFile) {
            const reader = new FileReader();
            reader.onload = () => {
                if (typeof reader.result === 'string') setPreview({file: photoFile, url: reader.result});
            };
            reader.readAsDataURL(photoFile);
            return () => { reader.onload = null; reader.abort(); };
        }
    }, [photoFile]);

    const readLiveFix = () => {
        const current = useLocationStore.getState();
        return current.hasSessionFix && current.locationStatus === 'available' ? current.userLocation : null;
    };

    const handleSubmit = async () => {
        if (isSubmittingRef.current || Boolean(jobId && !isTerminal) || !photoFile || !location || !locationName.trim()) return;
        const startFix = readLiveFix();
        if (!startFix) {
            toast.error("GPS actuel nécessaire", "Une position GPS actuelle est nécessaire pour lancer l'appel.");
            return;
        }
        isSubmittingRef.current = true;
        setSubmissionPhase('preparing');
        const requestKey = isTerminal ? crypto.randomUUID() : idempotencyKey;
        if (isTerminal) {
            setIdempotencyKey(requestKey);
            setJobId(null);
        }

        try {
            const fixedPhoto = await processBeerCallImage(photoFile);

            // La préparation photo est asynchrone : revalider le fix juste avant le POST.
            const postFix = readLiveFix();
            if (!postFix) {
                isSubmittingRef.current = false;
                setSubmissionPhase('idle');
                toast.error("GPS actuel nécessaire", "La position GPS a changé pendant la préparation. Rapproche-toi et réessaie.");
                return;
            }

            setSubmissionPhase('uploading');

            const formData = new FormData();
            formData.append('file', fixedPhoto);
            formData.append('latitude', postFix.lat.toString());
            formData.append('longitude', postFix.lng.toString());
            formData.append('location_name', locationName.trim());
            
            let res: AxiosResponse<{job_id?: string}>;

            if (scheduledApero) {
                res = await api.post(`/squads/${squadId}/beer-calls/${scheduledApero.id}/start/`, formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                        'Idempotency-Key': requestKey
                    },
                });
            } else {
                res = await api.post(`/squads/${squadId}/beer-calls/`, formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                        'Idempotency-Key': requestKey
                    },
                });
            }

            if (res.data?.job_id) {
                setJobId(res.data.job_id);
                setSubmissionPhase('idle');
            } else {
                isSubmittingRef.current = false;
                setSubmissionPhase('idle');
                queryClient.invalidateQueries({queryKey: ['squad', squadId]});
                onClose();
            }
        } catch (err) {
            isSubmittingRef.current = false;
            setSubmissionPhase('idle');
            if (err instanceof ImagePreparationError) {
                toast.error("Erreur 🚨", err.message);
            } else {
                const axiosError = err as { response?: { data?: { detail?: string } } };
                const errorMessage = axiosError.response?.data?.detail || "Erreur serveur inattendue";
                toast.error("Erreur 🚨", errorMessage);
            }
        }
    };

    const isFormValid = location !== null && locationName.trim().length > 0 && hasLiveFix;

    const getButtonLabel = () => {
        if (jobId && !isTerminal) {
            if (status === 'running') {
                return 'VÉRIFICATION DE LA PHOTO…';
            }
            return 'PHOTO EN ATTENTE DE VÉRIFICATION…';
        }
        if (phase === 'preparing') {
            return 'PRÉPARATION DE LA PHOTO…';
        }
        if (phase === 'uploading') {
            return 'ENVOI DE LA PHOTO…';
        }
        return 'LANCER L\'APPEL';
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
                            <h2 className="text-2xl font-black text-gray-900 uppercase italic tracking-tighter">
                                {scheduledApero ? "Démarrer l'Apéro" : "Valider l'Apéro"}
                            </h2>
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
                                    <MapPin size={12}/> Nom du bar / lieu <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text" placeholder="Ex: Bar Le Central..."
                                    value={locationName} onChange={(e) => setLocationName(e.target.value)}
                                    disabled={!!scheduledApero}
                                    className="w-full p-5 rounded-2xl bg-gray-50 border-4 border-transparent focus:border-beer focus:outline-none font-bold text-lg transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                                />
                            </div>
                        </div>

                        <div className="absolute bottom-8 left-8 right-8">
                            {trackingUnavailable && (
                                <div role="status" className="mb-3 text-sm text-gray-900">
                                    Suivi indisponible : votre demande est conservée, son résultat reste inconnu.
                                    {trackingPaused && <button type="button" onClick={resumeTracking}
                                        className="ml-2 underline">Reprendre le suivi</button>}
                                </div>
                            )}
                            {showSlowNotice && !isTerminal && Boolean(jobId) && (
                                <div role="status" className="mb-3 text-sm text-gray-900">
                                    La vérification prend plus de temps que prévu.
                                    <button
                                        type="button"
                                        onClick={handleCheckStatus}
                                        disabled={isCheckingStatus}
                                        className="ml-2 underline disabled:opacity-50"
                                    >
                                        Vérifier le statut
                                    </button>
                                </div>
                            )}
                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting || !isFormValid}
                                className="w-full bg-beer text-white p-6 rounded-[2.5rem] font-black text-xl shadow-xl shadow-beer/30 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale"
                            >
                                {getButtonLabel()} <Send size={24}/>
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
