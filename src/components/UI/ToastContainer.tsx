// 📝 FICHIER : src/components/UI/ToastContainer.tsx
import {motion, AnimatePresence} from 'framer-motion';
import {CheckCircle2, XCircle, Info} from 'lucide-react';
import {useToastStore} from '../../store/useToastStore';

export default function ToastContainer() {
    const toasts = useToastStore((state) => state.toasts);
    const removeToast = useToastStore((state) => state.removeToast);

    return (
        <div
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-3 w-[90%] max-w-sm pointer-events-none">
            <AnimatePresence mode="popLayout">
                {toasts.map((toastItem) => {
                    const isError = toastItem.type === 'error';
                    const isSuccess = toastItem.type === 'success';

                    return (
                        <motion.div
                            key={toastItem.id}
                            layout
                            initial={{opacity: 0, y: -50, scale: 0.8}}
                            animate={{opacity: 1, y: 0, scale: 1}}
                            exit={{opacity: 0, scale: 0.8, transition: {duration: 0.2}}}
                            className={`pointer-events-auto backdrop-blur-md border p-4 rounded-2xl shadow-2xl flex items-center gap-4 cursor-pointer active:scale-95 transition-transform ${
                                isError ? 'bg-red-950/95 border-red-500/50' :
                                    isSuccess ? 'bg-gray-900/95 border-gray-700' :
                                        'bg-blue-950/95 border-blue-500/50'
                            }`}
                            onClick={() => removeToast(toastItem.id)} // Fermer au clic
                        >
                            <div className={`w-12 h-12 rounded-full flex flex-shrink-0 items-center justify-center ${
                                isError ? 'bg-red-500/20 text-red-500' :
                                    isSuccess ? 'bg-beer/20 text-beer' :
                                        'bg-blue-500/20 text-blue-500'
                            }`}>
                                {isError && <XCircle size={24}/>}
                                {isSuccess && <CheckCircle2 size={24} className="animate-pulse"/>}
                                {!isError && !isSuccess && <Info size={24}/>}
                            </div>
                            <div className="flex flex-col">
                                <span className={`font-black text-[10px] uppercase tracking-[0.2em] italic ${
                                    isError ? 'text-red-400' : isSuccess ? 'text-white' : 'text-blue-400'
                                }`}>
                                    {toastItem.title}
                                </span>
                                {toastItem.message && (
                                    <span className="text-gray-200 text-xs font-bold leading-tight mt-0.5">
                                        {toastItem.message}
                                    </span>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}