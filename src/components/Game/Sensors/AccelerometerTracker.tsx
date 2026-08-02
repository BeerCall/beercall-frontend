import {useState, useEffect, useRef, useCallback} from 'react';
import {motion} from 'framer-motion';

interface AccelerometerPayload {
    type: string;
    target_shakes: number;
    duration_ms: number;
}

interface Props {
    sensorPayload: AccelerometerPayload;
    onAction: (actionId: string) => void;
    disabled: boolean;
}

export default function AccelerometerTracker({sensorPayload, onAction, disabled}: Props) {
    // ÉTATS DU JEU
    const [phase, setPhase] = useState<'INIT' | 'PLAYING' | 'DONE'>('INIT');
    const [permissionError, setPermissionError] = useState<string | null>(null);

    const [shakeCount, setShakeCount] = useState(0);
    const [timeLeft, setTimeLeft] = useState(sensorPayload.duration_ms / 1000);

    // REFS
    const hasTriggeredRef = useRef(false);
    const lastShakeTimeRef = useRef<number>(0);
    const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const lossTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 🚀 1. GESTION DES PERMISSIONS (iOS 13+)
    const requestAccessAndStart = async () => {
        if (disabled) return;

        try {
            // Vérification spécifique pour iOS 13+ (DeviceMotionEvent)
            if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
                const permissionState = await (DeviceMotionEvent as any).requestPermission();
                if (permissionState !== 'granted') {
                    setPermissionError("Tu dois autoriser l'accès aux capteurs pour jouer !");
                    return;
                }
            }
            startGame();
        } catch (error) {
            console.error("Erreur capteur:", error);
            startGame(); // Fallback Android/PC
        }
    };

    const startGame = useCallback(() => {
        setPhase('PLAYING');
        hasTriggeredRef.current = false;
        setShakeCount(0);
        setTimeLeft(sensorPayload.duration_ms / 1000);

        // ⏱️ CHRONOMÈTRE VISUEL (Toutes les secondes)
        countdownIntervalRef.current = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        // ⏳ TIMER DE DÉFAITE (Si le temps est écoulé)
        lossTimerRef.current = setTimeout(() => {
            if (hasTriggeredRef.current) return;
            hasTriggeredRef.current = true;

            // Vibration d'échec
            if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);

            setPhase('DONE');
            onAction('GAME_LOST');
        }, sensorPayload.duration_ms);

    }, [sensorPayload.duration_ms, onAction]);

    // 🚀 2. LE MOTEUR PHYSIQUE (Écoute des secousses)
    useEffect(() => {
        if (phase !== 'PLAYING') return;

        const handleMotion = (event: DeviceMotionEvent) => {
            if (hasTriggeredRef.current || disabled) return;

            // On préfère accelerationIncludingGravity pour une meilleure compatibilité,
            // sinon on fallback sur acceleration.
            const acc = event.accelerationIncludingGravity || event.acceleration;
            if (!acc) return;

            // 🧮 ALGORITHME DE SHAKE
            const totalAcceleration = Math.abs(acc.x || 0) + Math.abs(acc.y || 0) + Math.abs(acc.z || 0);

            // SEUIL (Threshold) : 15 est un bon standard pour filtrer les mouvements normaux
            if (totalAcceleration > 15) {
                const now = Date.now();

                // DEBOUNCE : 100ms minimum entre deux secousses pour éviter de compter un seul mouvement plusieurs fois
                if (now - lastShakeTimeRef.current > 100) {
                    lastShakeTimeRef.current = now;

                    // Petite vibration de feedback à chaque secousse réussie
                    if ('vibrate' in navigator) navigator.vibrate(20);

                    setShakeCount((prevCount) => {
                        const newCount = prevCount + 1;

                        // 🏆 VÉRIFICATION DE LA VICTOIRE
                        if (newCount >= sensorPayload.target_shakes && !hasTriggeredRef.current) {
                            hasTriggeredRef.current = true;

                            // Nettoyage immédiat des timers pour éviter la défaite
                            if (lossTimerRef.current) clearTimeout(lossTimerRef.current);
                            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

                            // Grosse vibration de victoire
                            if ('vibrate' in navigator) navigator.vibrate([100, 50, 100, 50, 500]);

                            setPhase('DONE');
                            onAction('GAME_WON');
                        }
                        return newCount;
                    });
                }
            }
        };

        window.addEventListener('devicemotion', handleMotion);

        // CLEANUP
        return () => {
            window.removeEventListener('devicemotion', handleMotion);
            if (lossTimerRef.current) clearTimeout(lossTimerRef.current);
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        };
    }, [phase, sensorPayload.target_shakes, onAction]);


    // --- RENDU VISUEL ---

    // Écran d'initialisation
    if (phase === 'INIT') {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center min-h-[300px]">
                <motion.div
                    animate={{rotate: [-10, 10, -10]}}
                    transition={{repeat: Infinity, duration: 0.2}}
                    className="w-24 h-24 bg-rose-500 rounded-3xl flex items-center justify-center mb-6 shadow-lg shadow-rose-500/50"
                >
                    <span className="text-4xl">🥤</span>
                </motion.div>
                <h3 className="text-2xl font-black uppercase tracking-widest mb-2 text-white">Le Shaker</h3>
                <p className="text-gray-400 font-bold mb-8 text-center max-w-xs">
                    Secoue ton téléphone le plus vite possible pour remplir la jauge !
                    ({sensorPayload.target_shakes} secousses en {sensorPayload.duration_ms / 1000}s)
                </p>
                <button
                    onClick={requestAccessAndStart}
                    className="bg-rose-600 text-white font-black uppercase text-xl px-8 py-4 rounded-3xl active:scale-95 active:bg-rose-700 transition-all shadow-[0_0_40px_rgba(225,29,72,0.4)]"
                >
                    Prêt ? Démarrer !
                </button>
                {permissionError && (
                    <p className="text-red-500 font-bold mt-4 text-sm px-4 text-center">{permissionError}</p>
                )}
            </div>
        );
    }

    // Calcul du pourcentage de remplissage de la jauge (limité à 100%)
    const fillPercentage = Math.min((shakeCount / sensorPayload.target_shakes) * 100, 100);

    return (
        <div
            className="w-full h-full flex flex-col items-center justify-center min-h-[400px] touch-none select-none relative">

            {/* ⏱️ LE CHRONOMÈTRE (Gros chiffres au-dessus) */}
            <div className="absolute top-4 left-0 right-0 flex justify-center">
                <span
                    className={`text-6xl font-black italic tracking-tighter drop-shadow-xl ${timeLeft <= 2 ? 'text-red-500 animate-ping' : 'text-white'}`}>
                    {timeLeft}
                </span>
            </div>

            {/* 🌡️ LA JAUGE VERTICALE (Style thermomètre/shaker) */}
            <div
                className="relative w-32 h-64 bg-gray-900 rounded-[2.5rem] border-8 border-gray-800 overflow-hidden shadow-inner mt-16 flex items-end">

                {/* Le liquide qui monte */}
                <motion.div
                    className="w-full bg-gradient-to-t from-rose-600 to-pink-400"
                    initial={{height: "0%"}}
                    animate={{height: `${fillPercentage}%`}}
                    transition={{type: "spring", bounce: 0.5}}
                >
                    {/* Bulles d'effervescence (optionnel, pour faire "cocktail") */}
                    <div
                        className="w-full h-full opacity-30 bg-[radial-gradient(circle,white_2px,transparent_3px)] bg-[size:12px_16px] animate-[slide-up_1s_linear_infinite]"/>
                </motion.div>

                {/* Marqueur d'objectif (Ligne d'arrivée en haut) */}
                <div className="absolute top-[5%] left-0 right-0 h-1 bg-white/50 border-b border-white border-dashed"/>
            </div>

            {/* COMPTEUR TEXTUEL EN BAS */}
            <div className="mt-8 text-center">
                <div className="text-rose-500 font-black uppercase tracking-widest text-sm mb-1">
                    SECOUSSES
                </div>
                <div className="text-4xl font-black text-white italic">
                    {shakeCount} <span className="text-xl text-gray-500">/ {sensorPayload.target_shakes}</span>
                </div>
            </div>

        </div>
    );
}