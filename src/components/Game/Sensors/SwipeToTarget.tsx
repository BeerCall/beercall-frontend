import {useState, useRef} from 'react';
import {motion, useAnimation} from 'framer-motion';

interface SwipeToTargetPayload {
    type: string;
    wind_force: number; // ex: -2 (gauche) à 2 (droite)
    target_size: 'small' | 'medium' | 'large';
}

interface Props {
    sensorPayload: SwipeToTargetPayload;
    onAction: (actionId: string) => void;
    disabled: boolean;
}

export default function SwipeToTarget({sensorPayload, onAction, disabled}: Props) {
    // 1. ÉTATS DU JEU
    const [phase, setPhase] = useState<'AIMING' | 'SHOOTING' | 'RESULT'>('AIMING');
    const [result, setResult] = useState<'WIN' | 'LOSS' | null>(null);

    const ballControls = useAnimation();
    const netControls = useAnimation();

    // 2. RÉFÉRENCES POUR LE MOTEUR DE SWIPE
    const touchStartRef = useRef({x: 0, y: 0, time: 0});

    // Configurations de la cible
    const goalWidths = {small: 120, medium: 180, large: 260};
    const GOAL_WIDTH = goalWidths[sensorPayload.target_size] || 180;

    // Constante physique de distance vers le but (axe Y)
    const SHOOT_DISTANCE = -400;

    // 3. MOTEUR DE SWIPE (Physique et Détection)
    const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
        if (disabled || phase !== 'AIMING') return;
        const touch = e.touches[0];
        touchStartRef.current = {
            x: touch.clientX,
            y: touch.clientY,
            time: Date.now()
        };
    };

    const handleTouchEnd = async (e: React.TouchEvent<HTMLDivElement>) => {
        if (disabled || phase !== 'AIMING') return;

        const touch = e.changedTouches[0];
        const endX = touch.clientX;
        const endY = touch.clientY;
        const endTime = Date.now();

        const start = touchStartRef.current;

        // Calculs de base
        const dx = endX - start.x;
        const dy = start.y - endY; // Inversé car le Y descend sur un écran
        const dt = endTime - start.time;

        // Si c'est juste un tapotement ou un swipe vers le bas, on annule
        if (dy < 50 || dt === 0) return;

        setPhase('SHOOTING');

        // 🧮 MATHÉMATIQUES DU TIR
        const velocityY = dy / dt; // Vitesse verticale
        const velocityX = dx / dt; // Vitesse horizontale

        // 🌬️ LE VENT (Déviation X)
        // wind_force de -2 à 2. On multiplie pour que ça impacte vraiment les pixels.
        const windEffect = sensorPayload.wind_force * 45;

        // CALCUL DE LA DESTINATION FINALE
        // Si le tir est rapide, il va loin. Si c'est mou, il s'arrête avant.
        const finalY = SHOOT_DISTANCE * Math.min(velocityY * 1.5, 1.2);
        const finalX = (velocityX * 300) + windEffect;

        // ARBITRAGE (Collision)
        // Il faut que le ballon atteigne le fond (finalY <= SHOOT_DISTANCE * 0.8)
        // ET qu'il soit dans la largeur du but.
        const isStrongEnough = finalY <= SHOOT_DISTANCE * 0.8;
        const isInsideWidth = Math.abs(finalX) <= (GOAL_WIDTH / 2);
        const isGoal = isStrongEnough && isInsideWidth;

        // 🎬 ANIMATION DU BALLON
        await ballControls.start({
            x: finalX,
            y: finalY,
            scale: 0.4, // Profondeur 3D
            transition: {
                duration: 0.6,
                ease: "easeOut" // Courbe de Bézier pour un ralentissement naturel
            }
        });

        setResult(isGoal ? 'WIN' : 'LOSS');

        // 🎬 RÉSULTAT ET DÉCLENCHEMENT
        if (isGoal) {
            // Tremblement du filet
            if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
            await netControls.start({
                y: [0, -10, 5, -5, 0],
                transition: {duration: 0.4}
            });

            setTimeout(() => {
                onAction('GAME_WON');
            }, 1000);
        } else {
            // Tir raté
            if ('vibrate' in navigator) navigator.vibrate(300);
            setTimeout(() => {
                onAction('GAME_LOST');
            }, 1000);
        }
    };

    // --- RENDU VISUEL ---
    return (
        // 🛡️ touch-none est vital ici pour empêcher le rafraîchissement au swipe !
        <div
            className="w-full h-full flex flex-col items-center min-h-[500px] touch-none select-none relative overflow-hidden bg-gray-950">

            {/* 🌬️ INDICATEUR DE VENT */}
            <div
                className="absolute top-8 right-6 bg-gray-900/80 px-4 py-2 rounded-full border border-gray-700 flex items-center gap-2 shadow-lg z-10">
                <span className="text-gray-400 text-xs font-black uppercase tracking-widest">Vent</span>
                <div className="flex gap-1 text-sky-400">
                    {sensorPayload.wind_force < 0 &&
                        <span className="animate-pulse">{"\u25C0".repeat(Math.abs(sensorPayload.wind_force))}</span>}
                    {sensorPayload.wind_force === 0 && <span className="text-gray-600">-</span>}
                    {sensorPayload.wind_force > 0 &&
                        <span className="animate-pulse">{"\u25B6".repeat(sensorPayload.wind_force)}</span>}
                </div>
            </div>

            {/* 🥅 LA CIBLE (Le But aux couleurs Rouge et Noir) */}
            <div className="absolute top-24 flex flex-col items-center">
                <motion.div
                    animate={netControls}
                    className="relative flex items-center justify-center border-t-8 border-x-8 border-gray-200 rounded-t-lg bg-red-600/20 shadow-[0_0_30px_rgba(220,38,38,0.2)]"
                    style={{
                        width: `${GOAL_WIDTH}px`,
                        height: '140px',
                        // Un petit effet de filet de foot en CSS pur
                        backgroundImage: `linear-gradient(45deg, #000 25%, transparent 25%, transparent 75%, #000 75%, #000), 
                                          linear-gradient(45deg, #000 25%, transparent 25%, transparent 75%, #000 75%, #000)`,
                        backgroundSize: '20px 20px',
                        backgroundPosition: '0 0, 10px 10px',
                        opacity: 0.4
                    }}
                >
                    {/* Ligne de but rouge vif */}
                    <div className="absolute bottom-0 w-full h-1 bg-red-600 shadow-[0_0_10px_red]"/>
                </motion.div>

                {/* Messages de résultat */}
                {result === 'WIN' && <motion.div initial={{scale: 0}} animate={{scale: 1}}
                                                 className="absolute -bottom-16 text-4xl font-black text-emerald-400 italic drop-shadow-lg">BUUUUT
                    !</motion.div>}
                {result === 'LOSS' && <motion.div initial={{scale: 0}} animate={{scale: 1}}
                                                  className="absolute -bottom-16 text-4xl font-black text-red-500 italic drop-shadow-lg">RATÉ...</motion.div>}
            </div>

            {/* ⚽ LE BALLON */}
            <div className="absolute bottom-16 w-full flex justify-center z-20">
                <motion.div
                    animate={ballControls}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    className={`w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-[0_10px_30px_rgba(0,0,0,0.5)] border-4 border-gray-300 relative overflow-hidden ${phase === 'AIMING' ? 'cursor-grab' : 'cursor-default pointer-events-none'}`}
                    // Animation pour inviter le joueur à swiper
                    initial={{y: 0}}
                    whileHover={phase === 'AIMING' ? {scale: 1.05} : {}}
                >
                    {/* Motif du ballon classique */}
                    <div className="absolute w-10 h-10 bg-gray-900 rounded-lg rotate-45"/>
                    <div className="absolute top-2 -left-2 w-8 h-8 bg-gray-900 rounded-lg rotate-12"/>
                    <div className="absolute top-2 -right-2 w-8 h-8 bg-gray-900 rounded-lg -rotate-12"/>
                    <div className="absolute -bottom-2 w-12 h-8 bg-gray-900 rounded-lg"/>

                    {phase === 'AIMING' && (
                        <div className="absolute -top-12 flex flex-col items-center animate-bounce opacity-70">
                            <span
                                className="text-white text-xs font-black uppercase tracking-widest drop-shadow-md">Tire</span>
                            <span className="text-white drop-shadow-md">⬆️</span>
                        </div>
                    )}
                </motion.div>
            </div>

            {/* Zone de surface de réparation (purement décoratif) */}
            <div
                className="absolute bottom-0 w-3/4 h-32 border-t-2 border-x-2 border-white/20 rounded-t-3xl pointer-events-none"/>

        </div>
    );
}