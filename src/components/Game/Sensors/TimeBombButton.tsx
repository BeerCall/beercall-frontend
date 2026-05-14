import {useEffect, useRef} from 'react';
import {motion} from 'framer-motion';

interface TimeBombPayload {
    type: string;
    remaining_ms: number;
}

interface Props {
    sensorPayload: TimeBombPayload;
    onAction: (actionId: string) => void;
    disabled: boolean;
}

export default function TimeBombButton({sensorPayload, onAction, disabled}: Props) {
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 💣 GESTION DU COMPTE À REBOURS CACHÉ
    useEffect(() => {
        // Si le bouton est désactivé (requête en cours), on ne fait rien
        if (disabled) return;

        // On arme la bombe
        timeoutRef.current = setTimeout(() => {
            // BOOM ! Le temps est écoulé
            if ('vibrate' in navigator) {
                // Motif de vibration agressif : Bzz... Bzz... BZZZZZZZ
                navigator.vibrate([100, 50, 100, 50, 800]);
            }
            onAction("BOMB_EXPLODED");
        }, sensorPayload.remaining_ms);

        // Nettoyage vital pour éviter d'envoyer 2 actions si le composant est démonté
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [sensorPayload.remaining_ms, onAction, disabled]);

    // ✋ GESTION DU CLIC (Patate passée)
    const handleTap = () => {
        if (disabled) return;

        // On désamorce immédiatement le timer local pour éviter un déclenchement fantôme
        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        onAction("BOMB_PASSED");
    };

    return (
        <button
            onClick={handleTap}
            disabled={disabled}
            className="w-full h-full min-h-[250px] sm:min-h-[300px] flex items-center justify-center rounded-3xl bg-red-600 active:bg-red-700 shadow-[0_0_60px_rgba(220,38,38,0.4)] border-b-8 border-red-900 active:border-b-0 active:translate-y-2 transition-all relative overflow-hidden group touch-manipulation"
        >
            {/* L'EFFET DE PULSATION GÉANT EN ARRIÈRE-PLAN */}
            <div className="absolute inset-0 bg-red-500 opacity-50 animate-ping" style={{animationDuration: '0.8s'}}/>

            {/* LE TEXTE AU CENTRE */}
            <motion.div
                initial={{scale: 0.9}}
                animate={{scale: 1.1}}
                transition={{
                    repeat: Infinity,
                    duration: 0.4,
                    repeatType: "reverse",
                    ease: "easeInOut"
                }}
                className="z-10 text-center"
            >
                <h2 className="text-4xl sm:text-5xl font-black uppercase italic tracking-tighter text-white drop-shadow-xl leading-tight">
                    Tape pour <br/> Passer !
                </h2>
                <div className="mt-4 flex items-center justify-center gap-2 text-red-200">
                    <span className="w-2 h-2 rounded-full bg-red-200 animate-bounce" style={{animationDelay: '0ms'}}/>
                    <span className="w-2 h-2 rounded-full bg-red-200 animate-bounce" style={{animationDelay: '150ms'}}/>
                    <span className="w-2 h-2 rounded-full bg-red-200 animate-bounce" style={{animationDelay: '300ms'}}/>
                </div>
            </motion.div>
        </button>
    );
}