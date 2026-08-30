// src/components/UI/PhotoModal.tsx
import {motion, AnimatePresence} from 'framer-motion';
import {createPortal} from 'react-dom';

interface Props {
    imageUrls: string[]; // Changed from single imageUrl to array
    currentIndex: number; // Added current index
    onClose: () => void;
    onIndexChange: (index: number) => void; // Callback for index changes
}

export default function PhotoModal({imageUrls, currentIndex, onClose, onIndexChange}: Props) {
    // Sécurité pour le SSR (Next.js/Remix) pour s'assurer que 'document' existe
    if (typeof document === 'undefined') return null;

    // Handle touch events for swipe gestures
    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 1) {
            const target = e.target as any;
            target.touchStartX = e.touches[0].clientX;
            target.touchStartY = e.touches[0].clientY;
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        const target = e.target as any;
        if (!target.touchStartX || !target.touchStartY) return;
        
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        
        const diffX = touchEndX - target.touchStartX;
        const diffY = touchEndY - target.touchStartY;
        
        // Threshold for swipe detection
        const threshold = 50;
        
        // Vertical swipe (up/down) to close modal
        if (Math.abs(diffY) > threshold && Math.abs(diffY) > Math.abs(diffX)) {
            if (diffY < 0) {
                // Swipe up
                onClose();
            } else {
                // Swipe down
                onClose();
            }
        } 
        // Horizontal swipe (left/right) to change image
        else if (Math.abs(diffX) > threshold && Math.abs(diffX) > Math.abs(diffY)) {
            if (diffX < 0) {
                // Swipe left - next image
                const nextIndex = (currentIndex + 1) % imageUrls.length;
                onIndexChange(nextIndex);
            } else {
                // Swipe right - previous image
                const prevIndex = (currentIndex - 1 + imageUrls.length) % imageUrls.length;
                onIndexChange(prevIndex);
            }
        }
        
        // Reset touch coordinates
        target.touchStartX = null;
        target.touchStartY = null;
    };

    return createPortal(
        <AnimatePresence>
            {imageUrls && imageUrls.length > 0 && (
                <motion.div
                    initial={{opacity: 0}}
                    animate={{opacity: 1}}
                    exit={{opacity: 0}}
                    className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 pointer-events-auto"
                    style={{paddingTop: 'calc(0px + env(safe-area-inset-top))'}}
                    onClick={onClose}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                >
                    <motion.img
                        initial={{scale: 0.8, y: 20}}
                        animate={{scale: 1, y: 0}}
                        exit={{scale: 0.8, y: 20}}
                        src={imageUrls[currentIndex]}
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