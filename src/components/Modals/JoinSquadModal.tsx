import {useState} from 'react';
import {X, Check, Key} from 'lucide-react';
import {motion, AnimatePresence} from 'framer-motion';
import {useQueryClient} from '@tanstack/react-query';
import {useNavigate} from 'react-router-dom';
import {api} from '../../lib/api';

interface JoinSquadModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function JoinSquadModal({isOpen, onClose}: JoinSquadModalProps) {
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    const [code, setCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleJoin = async () => {
        if (!code) return;
        setIsLoading(true);
        setError('');

        try {
            // L'appel API vers FastAPI
            const res = await api.post('/squads/join', {invite_code: code});

            // On met à jour la roulette en arrière-plan
            await queryClient.invalidateQueries({queryKey: ['squads']});

            // On ferme la modale et on nettoie l'input
            onClose();
            setCode('');

            // Redirection directe vers la nouvelle squad !
            navigate(`/squad/${res.data.id}`);

        } catch (err: any) {
            console.error("Erreur Join Squad:", err);
            setError(err.response?.data?.detail || "Code invalide ou expiré 🕵️‍♂️");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* BACKDROP FLOU */}
                    <motion.div
                        initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
                    />

                    {/* MODALE BOTTOM-SHEET */}
                    <motion.div
                        initial={{y: "100%"}} animate={{y: 0}} exit={{y: "100%"}}
                        transition={{type: "spring", damping: 25, stiffness: 200}}
                        className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[3rem] p-8 z-[101] shadow-2xl"
                    >
                        <div className="flex justify-between items-center mb-8">
                            <h2 className="text-2xl font-black text-gray-900 uppercase italic tracking-tighter">Rejoindre</h2>
                            <button onClick={onClose}
                                    className="p-2 bg-gray-100 rounded-full text-gray-400 hover:bg-gray-200 transition-colors">
                                <X size={20}/>
                            </button>
                        </div>

                        <div className="space-y-6">

                            <div className="text-center mb-4">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    Saisis le code d'invitation
                                </p>
                            </div>

                            {/* INPUT CODE SECRET */}
                            <div className="relative group">
                                <div
                                    className="absolute inset-0 bg-beer/20 rounded-[2rem] blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500"/>
                                <div
                                    className="relative bg-gray-50 p-2 rounded-[2rem] border-4 border-transparent focus-within:border-beer focus-within:bg-white transition-all">
                                    <div className="absolute left-6 top-1/2 -translate-y-1/2 text-beer">
                                        <Key size={24}/>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="CODE..."
                                        maxLength={8}
                                        value={code}
                                        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
                                        className="w-full bg-transparent p-4 pl-16 text-center text-3xl font-black text-gray-900 tracking-[0.3em] placeholder:text-gray-300 focus:outline-none"
                                        autoFocus
                                    />
                                </div>
                            </div>

                            {/* GESTION D'ERREUR */}
                            {error && (
                                <div className="bg-red-50 p-4 rounded-2xl animate-shake">
                                    <p className="text-red-500 text-center font-black text-[10px] uppercase tracking-widest">
                                        {error}
                                    </p>
                                </div>
                            )}

                            {/* BOUTON D'ACTION */}
                            <button
                                onClick={handleJoin}
                                disabled={!code || isLoading || code.length < 3}
                                className="w-full bg-gray-900 text-white p-6 rounded-[2rem] font-black text-xl shadow-xl shadow-gray-900/20 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-30 mt-4"
                            >
                                {isLoading ? 'DÉCRYPTAGE...' : 'VALIDER LE CODE'} <Check size={24}/>
                            </button>

                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}