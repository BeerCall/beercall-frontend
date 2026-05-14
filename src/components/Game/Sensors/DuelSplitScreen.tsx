import {useState, useEffect, useRef} from 'react';
import {motion} from 'framer-motion';

interface DuelPayload {
    type: string;
    player_top: string;
    player_bottom: string;
    signal_delay_ms: number;
}

interface Props {
    sensorPayload: DuelPayload;
    onAction: (actionId: string) => void;
    disabled: boolean; // Géré par useGameEngine pour éviter les doubles clics
}

export default function DuelSplitScreen({sensorPayload, onAction, disabled}: Props) {
    // État du jeu : 'WAITING' (Attente) -> 'GO' (Tapez !)
    const [phase, setPhase] = useState<'WAITING' | 'GO'>('WAITING');
    // Sécurité locale anti-double tap simultané
    const [hasTriggered, setHasTriggered] = useState(false);

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ⏱️ GESTION DU SIGNAL EXACT
    useEffect(() => {
        // On lance le compte à rebours caché
        timerRef.current = setTimeout(() => {
            setPhase('GO');
            // Petite vibration système pour marquer le signal si dispo
            if ('vibrate' in navigator) navigator.vibrate(50);
        }, sensorPayload.signal_delay_ms);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [sensorPayload.signal_delay_ms]);

    // 💥 GESTION DES FRAPPES
    const handleTap = (playerPos: 'TOP' | 'BOTTOM') => {
        if (disabled || hasTriggered) return;
        setHasTriggered(true);

        if (timerRef.current) clearTimeout(timerRef.current);

        if (phase === 'WAITING') {
            // 🚨 FAUX DÉPART ! L'autre joueur gagne.
            if ('vibrate' in navigator) navigator.vibrate([100, 100, 100]); // Grosse vibration d'erreur
            onAction(playerPos === 'TOP' ? 'WINNER_BOTTOM' : 'WINNER_TOP');
        } else if (phase === 'GO') {
            // ✅ BON RÉFLEXE ! Le joueur a gagné.
            onAction(playerPos === 'TOP' ? 'WINNER_TOP' : 'WINNER_BOTTOM');
        }
    };

    // --- VARIABLES DE DESIGN SELON LA PHASE ---
    const bgClass = phase === 'WAITING' ? 'bg-gray-800 active:bg-red-900/50' : 'bg-emerald-500 active:bg-emerald-400';
    const textClass = phase === 'WAITING' ? 'text-gray-400' : 'text-white drop-shadow-md';
    const message = phase === 'WAITING' ? 'Attendez le signal...' : 'TAPEZ !';

    return (
        // Le conteneur prend 100% de la hauteur disponible dans le footer/main
        // touch-none et select-none empêchent le comportement tactile natif (zoom, scroll, sélection)
        <div className="absolute inset-0 flex flex-col w-full h-full touch-none select-none overflow-hidden z-50">

            {/* 🔴 MOITIÉ HAUTE (Joueur en face : ROTATION 180°) */}
            <div
                onPointerDown={() => handleTap('TOP')} // onPointerDown est plus réactif que onClick sur mobile
                className={`flex-1 flex flex-col items-center justify-center cursor-pointer transition-colors duration-75 ${bgClass} rotate-180 relative`}
            >
                <span className={`text-xs font-black tracking-[0.2em] uppercase mb-4 opacity-50 ${textClass}`}>
                    {sensorPayload.player_top}
                </span>

                <motion.h2
                    animate={phase === 'GO' ? {scale: [1, 1.2, 1]} : {}}
                    className={`text-4xl sm:text-5xl font-black uppercase italic tracking-tighter ${textClass}`}
                >
                    {message}
                </motion.h2>
            </div>

            {/* ➖ LA LIGNE DE DÉMARCATION CENTRALE */}
            <div
                className="h-4 w-full bg-gray-950 flex items-center justify-center z-10 shrink-0 border-y-2 border-black/50 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
                <div
                    className="px-4 py-1 bg-gray-900 rounded-full text-[10px] font-black text-amber-500 uppercase tracking-widest">
                    VS
                </div>
            </div>

            {/* 🔵 MOITIÉ BASSE (Joueur tenant le tel) */}
            <div
                onPointerDown={() => handleTap('BOTTOM')}
                className={`flex-1 flex flex-col items-center justify-center cursor-pointer transition-colors duration-75 ${bgClass} relative`}
            >
                <motion.h2
                    animate={phase === 'GO' ? {scale: [1, 1.2, 1]} : {}}
                    className={`text-4xl sm:text-5xl font-black uppercase italic tracking-tighter ${textClass}`}
                >
                    {message}
                </motion.h2>

                <span className={`text-xs font-black tracking-[0.2em] uppercase mt-4 opacity-50 ${textClass}`}>
                    {sensorPayload.player_bottom}
                </span>
            </div>

        </div>
    );
}