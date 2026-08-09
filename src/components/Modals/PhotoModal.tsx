// src/components/UI/PhotoModal.tsx
import {motion, AnimatePresence} from 'framer-motion';
import {createPortal} from 'react-dom';

interface Props {
    imageUrl: string | null;
    onClose: () => void;
}

export default function PhotoModal({imageUrl, onClose}: Props) {
    // Sécurité pour le SSR (Next.js/Remix) pour s'assurer que 'document' existe
    if (typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {imageUrl && (
                <motion.div
                    initial={{opacity: 0}}
                    animate={{opacity: 1}}
                    exit={{opacity: 0}}
                    className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 pointer-events-auto"
                    onClick={onClose}
                >
                    {/* Bouton de fermeture clair et accessible */}
                    <button
                        onClick={onClose}
                        className="absolute top-6 right-6 z-50 p-2 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-md transition-colors"
                        aria-label="Fermer"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none"
                             stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>

                    <motion.img
                        initial={{scale: 0.8, y: 20}}
                        animate={{scale: 1, y: 0}}
                        exit={{scale: 0.8, y: 20}}
                        src={imageUrl}
                        alt="Aperçu de la photo"
                        className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
                        onClick={(e) => e.stopPropagation()} // Empêche la fermeture en cliquant sur l'image
                    />
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}