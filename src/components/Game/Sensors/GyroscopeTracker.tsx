import {useState, useEffect, useRef, useCallback} from 'react';
import {motion} from 'framer-motion';

interface GyroscopePayload {
    type: string;
    max_tilt_angle: number;
    duration_ms: number;
}

interface Props {
    sensorPayload: GyroscopePayload;
    onAction: (actionId: string) => void;
    disabled: boolean;
}

export default function GyroscopeTracker({sensorPayload, onAction, disabled}: Props) {
    // ÉTATS DU JEU
    const [phase, setPhase] = useState<'INIT' | 'PLAYING' | 'DONE'>('INIT');
    const [permissionError, setPermissionError] = useState<string | null>(null);

    // Inclinaison en degrés (beta = avant/arrière, gamma = gauche/droite)
    const [tilt, setTilt] = useState({beta: 0, gamma: 0});

    // Refs pour éviter les déclenchements multiples et gérer le timer
    const hasTriggeredRef = useRef(false);
    const winTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 🚀 1. GESTION DES PERMISSIONS (Le fameux bouton iOS)
    const requestAccessAndStart = async () => {
        if (disabled) return;

        try {
            // Vérification spécifique pour iOS 13+
            if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
                const permissionState = await (DeviceOrientationEvent as any).requestPermission();
                if (permissionState !== 'granted') {
                    setPermissionError("Tu dois autoriser l'accès aux capteurs pour jouer !");
                    return;
                }
            }
            // Si on est sur Android ou que la permission est accordée sur iOS :
            startGame();
        } catch (error) {
            console.error("Erreur capteur:", error);
            // Fallback pour les anciens navigateurs ou PC
            startGame();
        }
    };

    const startGame = useCallback(() => {
        setPhase('PLAYING');
        hasTriggeredRef.current = false;

        // 🏆 LANCEMENT DU TIMER DE VICTOIRE
        winTimerRef.current = setTimeout(() => {
            if (hasTriggeredRef.current) return;
            hasTriggeredRef.current = true;

            // Petite vibration de victoire
            if ('vibrate' in navigator) navigator.vibrate([50, 100, 50]);

            setPhase('DONE');
            onAction('GAME_WON');
        }, sensorPayload.duration_ms);
    }, [sensorPayload.duration_ms, onAction]);

    // 🚀 2. LE MOTEUR PHYSIQUE (Écoute du Gyroscope)
    useEffect(() => {
        if (phase !== 'PLAYING') return;

        const handleOrientation = (event: DeviceOrientationEvent) => {
            if (hasTriggeredRef.current || disabled) return;

            let {beta, gamma} = event;

            // Si le téléphone est posé à plat sur une table, beta et gamma sont proches de 0.
            // S'il n'y a pas de capteur (ex: PC), ça renvoie null.
            if (beta === null || gamma === null) return;

            // Fix pour quand on tient le téléphone complètement à l'envers
            if (beta > 90) beta = 90;
            if (beta < -90) beta = -90;

            setTilt({beta, gamma});

            // 💥 VÉRIFICATION DE LA DÉFAITE
            if (
                Math.abs(beta) > sensorPayload.max_tilt_angle ||
                Math.abs(gamma) > sensorPayload.max_tilt_angle
            ) {
                hasTriggeredRef.current = true;

                // Grosse vibration d'échec
                if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);

                setPhase('DONE');
                onAction('GAME_LOST');
            }
        };

        window.addEventListener('deviceorientation', handleOrientation);

        // CLEANUP : Super important pour la batterie !
        return () => {
            window.removeEventListener('deviceorientation', handleOrientation);
            if (winTimerRef.current) clearTimeout(winTimerRef.current);
        };
    }, [phase, sensorPayload.max_tilt_angle, onAction]);

    // --- RENDU VISUEL ---

    // Écran d'initialisation (Le fameux bouton)
    if (phase === 'INIT') {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center min-h-[300px]">
                <div
                    className="w-24 h-24 bg-amber-500 rounded-full flex items-center justify-center mb-6 animate-bounce shadow-lg shadow-amber-500/50">
                    <span className="text-4xl">📱</span>
                </div>
                <h3 className="text-2xl font-black uppercase tracking-widest mb-2 text-white">Le Barman</h3>
                <p className="text-gray-400 font-bold mb-8 text-center max-w-xs">
                    Pose ton téléphone à plat sur ta main. Si tu penches à plus de {sensorPayload.max_tilt_angle}°,
                    c'est perdu !
                </p>
                <button
                    onClick={requestAccessAndStart}
                    className="bg-amber-600 text-white font-black uppercase text-xl px-8 py-4 rounded-3xl active:scale-95 active:bg-amber-700 transition-all shadow-[0_0_40px_rgba(217,119,6,0.4)]"
                >
                    Prêt ? Calibrer !
                </button>
                {permissionError && (
                    <p className="text-red-500 font-bold mt-4 text-sm px-4 text-center">{permissionError}</p>
                )}
            </div>
        );
    }

    // Calcul de la position de la bulle pour le rendu
    // On inverse les signes pour simuler la physique d'une bulle d'air (qui va vers le haut quand on penche vers le bas)
    // On limite le déplacement visuel pour qu'il reste dans le cercle
    const MAX_VISUAL_PIXELS = 100; // Rayon max de déplacement de la bulle
    const bubbleX = Math.max(-MAX_VISUAL_PIXELS, Math.min(MAX_VISUAL_PIXELS, -(tilt.gamma / sensorPayload.max_tilt_angle) * MAX_VISUAL_PIXELS));
    const bubbleY = Math.max(-MAX_VISUAL_PIXELS, Math.min(MAX_VISUAL_PIXELS, -(tilt.beta / sensorPayload.max_tilt_angle) * MAX_VISUAL_PIXELS));

    return (
        <div
            className="w-full h-full flex flex-col items-center justify-center min-h-[400px] touch-none select-none relative">

            {/* LA BARRE DE PROGRESSION (Le chronomètre) */}
            <div className="absolute top-0 left-6 right-6 h-3 bg-gray-800 rounded-full overflow-hidden">
                <motion.div
                    initial={{width: "100%"}}
                    animate={{width: "0%"}}
                    // L'animation dure exactement le temps de la survie requise
                    transition={{duration: sensorPayload.duration_ms / 1000, ease: "linear"}}
                    className="h-full bg-amber-500"
                />
            </div>

            <div
                className="mt-8 text-amber-500 font-black uppercase tracking-widest text-sm mb-10 opacity-80 animate-pulse">
                Garde l'équilibre !
            </div>

            {/* LE NIVEAU À BULLE (Le grand cercle) */}
            <div
                className="relative w-64 h-64 rounded-full border-4 border-gray-700 bg-gray-900 flex items-center justify-center shadow-inner overflow-hidden">

                {/* La croix de repère centrale */}
                <div className="absolute w-full h-[2px] bg-gray-800/50"/>
                <div className="absolute h-full w-[2px] bg-gray-800/50"/>

                {/* La zone de tolérance (Cercle rouge = mort) */}
                <div className="absolute w-48 h-48 rounded-full border-2 border-red-500/30 border-dashed"/>

                {/* Le centre parfait (La cible) */}
                <div className="absolute w-12 h-12 rounded-full border-2 border-amber-500/50 bg-amber-500/10"/>

                {/* 🟢 LA BULLE QUI BOUGE */}
                <motion.div
                    className="absolute w-10 h-10 bg-emerald-400 rounded-full shadow-[0_0_20px_rgba(52,211,153,0.8)] border-2 border-emerald-200"
                    // On utilise "x" et "y" de framer-motion pour un rendu 60fps utilisant le GPU
                    animate={{x: bubbleX, y: bubbleY}}
                    transition={{type: "tween", ease: "linear", duration: 0.1}}
                >
                    {/* Reflet sur la bulle pour faire effet "verre/liquide" */}
                    <div className="absolute top-1.5 left-2 w-3 h-2 bg-white/60 rounded-full rotate-[-45deg]"/>
                </motion.div>
            </div>

            {/* Affichage des valeurs de debug (Optionnel, mais cool pour les joueurs) */}
            <div className="mt-10 flex gap-6 text-xs font-black tracking-widest text-gray-500">
                <div className="flex flex-col items-center">
                    <span>INCLINAISON X</span>
                    <span
                        className={`text-lg ${Math.abs(tilt.gamma) > sensorPayload.max_tilt_angle - 5 ? 'text-red-400' : 'text-gray-300'}`}>
                        {Math.abs(tilt.gamma).toFixed(1)}°
                    </span>
                </div>
                <div className="flex flex-col items-center">
                    <span>INCLINAISON Y</span>
                    <span
                        className={`text-lg ${Math.abs(tilt.beta) > sensorPayload.max_tilt_angle - 5 ? 'text-red-400' : 'text-gray-300'}`}>
                        {Math.abs(tilt.beta).toFixed(1)}°
                    </span>
                </div>
            </div>
        </div>
    );
}