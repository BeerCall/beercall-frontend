import {useEffect, useState} from 'react';
import {motion} from 'framer-motion';

interface Props {
    scheduledFor: string;
    onClick: (e: React.MouseEvent) => void;
}

export function ScheduledMarkerCountdown({scheduledFor, onClick}: Props) {
    const [timeLeft, setTimeLeft] = useState<number>(0);

    // On garde juste la logique pour savoir si c'est "prêt" ou pas
    useEffect(() => {
        const updateTimer = () => {
            const remaining = new Date(scheduledFor).getTime() - Date.now();
            setTimeLeft(remaining); // On garde la vraie valeur pour le calcul
        };
        updateTimer();
        const interval = setInterval(updateTimer, 5000); // Mise à jour moins fréquente, on n'affiche plus les secondes
        return () => clearInterval(interval);
    }, [scheduledFor]);

    const isReady = timeLeft <= 1800000; // Imminent 30 minutes avant

    return (
        <div
            onClick={onClick}
            className="relative flex items-center justify-center cursor-pointer group pb-2"
        >
            {/* L'EFFET RADAR */}
            <div className={`absolute bottom-2 w-12 h-4 rounded-[100%] blur-md animate-pulse z-0 ${
                isReady ? 'bg-rose-500/60' : 'bg-indigo-600/60' // 🚀 Rose au lieu de Ambre
            }`} />

            {/* LE CERCLE PRINCIPAL */}
            <motion.div
                whileHover={{ scale: 1.1, y: -4 }}
                whileTap={{ scale: 0.9 }}
                className={`relative z-10 w-10 h-10 rounded-full shadow-lg flex items-center justify-center border-2 backdrop-blur-md transition-all ${
                    isReady
                        ? 'bg-rose-500 text-white border-white shadow-rose-500/40' // 🚀 Rose
                        : 'bg-indigo-600/90 text-indigo-50 border-indigo-200/50 shadow-indigo-600/30'
                }`}
            >
                {/* L'icône centrale */}
                <span className="text-lg drop-shadow-sm leading-none">
                    {isReady ? '🍻' : '⏳'}
                </span>

                {/* Petit point de notification stylé */}
                {!isReady && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span
                            className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-300 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-200"></span>
                    </span>
                )}
            </motion.div>

            {/* LE POINTEUR GPS */}
            <div className={`absolute -bottom-1 w-3 h-3 rotate-45 rounded-sm shadow-sm transition-all z-0 ${
                isReady
                    ? 'bg-rose-500 border-r border-b border-white' // 🚀 Rose
                    : 'bg-indigo-600 border-r border-b border-indigo-200/50'
            }`} />
        </div>
    );
}