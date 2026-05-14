import {useState, useEffect, useRef, useCallback} from 'react';
import {motion, AnimatePresence} from 'framer-motion';

// --- TYPES DU BACKEND ---
interface MultiTouchPayload {
    type: string;
    hold_duration_ms: number;
}

interface Props {
    sensorPayload: MultiTouchPayload;
    onAction: (actionId: string) => void;
    disabled: boolean; // Géré par useGameEngine pour verrouiller après la sélection
}

// --- TYPES LOCAUX ---
interface TouchPoint {
    id: number;     // L'ID natif du doigt fourni par le navigateur
    x: number;      // Position horizontale
    y: number;      // Position verticale
    color: string;  // Couleur attribuée
}

type GamePhase = 'GATHERING' | 'SELECTING' | 'RESULT';

// Une palette de couleurs vives pour les joueurs
const COLORS = [
    '#3b82f6', // Bleu
    '#eab308', // Jaune
    '#22c55e', // Vert
    '#a855f7', // Violet
    '#ec4899', // Rose
    '#f97316', // Orange
    '#14b8a6', // Teal
];

export default function MultiTouchTracker({sensorPayload, onAction, disabled}: Props) {
    // 1. ÉTATS DU JEU
    const [touches, setTouches] = useState<TouchPoint[]>([]);
    const [phase, setPhase] = useState<GamePhase>('GATHERING');
    const [selectedTouchId, setSelectedTouchId] = useState<number | null>(null);

    // 2. RÉFÉRENCES & TIMERS
    // On garde un pointeur vers l'état actuel pour les callbacks de timeout
    const touchesRef = useRef<TouchPoint[]>([]);
    const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // On stocke les couleurs déjà attribuées pour ne pas les réutiliser immédiatement
    const colorIndexRef = useRef(0);

    // Synchronisation de la ref avec l'état (pratique pour lire l'état dans les SetTimeout)
    useEffect(() => {
        touchesRef.current = touches;
    }, [touches]);

    // 3. LOGIQUE DU TIMER DE MAINTIEN (hold_duration_ms)
    // À chaque fois que le nombre de doigts change, on réinitialise ou on lance le timer.
    useEffect(() => {
        if (disabled || phase !== 'GATHERING') return;

        // On nettoie le timer précédent
        if (holdTimerRef.current) clearTimeout(holdTimerRef.current);

        // Il faut au moins 2 doigts pour démarrer le décompte
        if (touches.length >= 2) {
            holdTimerRef.current = setTimeout(() => {
                startSelectionRoulette();
            }, sensorPayload.hold_duration_ms);
        }

        return () => {
            if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
        };
    }, [touches.length, phase, disabled, sensorPayload.hold_duration_ms]);

    // 4. L'ANIMATION DE LA ROULETTE (La sélection)
    const startSelectionRoulette = useCallback(() => {
        setPhase('SELECTING');

        // Petite vibration pour signaler le début du tirage
        if ('vibrate' in navigator) navigator.vibrate([50, 50, 50]);

        const currentTouches = [...touchesRef.current];
        if (currentTouches.length === 0) return;

        // On choisit un gagnant au hasard
        const winnerIndex = Math.floor(Math.random() * currentTouches.length);
        const winnerId = currentTouches[winnerIndex].id;

        // Effet de suspense : on attend un peu avant d'afficher le résultat
        setTimeout(() => {
            setSelectedTouchId(winnerId);
            setPhase('RESULT');

            // Grosse vibration pour le perdant
            if ('vibrate' in navigator) navigator.vibrate(500);

            // 🚀 CORRECTION : On passe de 2000ms à 4500ms
            // Pour laisser le temps au groupe de comprendre qui a été choisi !
            setTimeout(() => {
                onAction('TARGET_SELECTED');
            }, 4500);

        }, 1500); // Durée de l'animation de sélection (le clignotement)
    }, [onAction]);

    // 5. GESTION DES ÉVÉNEMENTS TACTILES (Les TouchEvents natifs)

    // Le navigateur nous donne une liste de doigts touchant l'écran.
    // On mappe ces doigts à nos objets internes (avec des couleurs).
    const handleTouch = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
        if (disabled || phase !== 'GATHERING') return;

        // Empêche le défilement et le pull-to-refresh
        // e.preventDefault(); est souvent bloqué en mode passif par React.
        // On utilisera plutôt du CSS pur (touch-none) sur le conteneur principal.

        const currentNativeTouches = Array.from(e.touches);

        // 5.a. Trouver les nouveaux doigts
        const newTouches: TouchPoint[] = [];

        currentNativeTouches.forEach((nativeTouch) => {
            // Est-ce qu'on le traque déjà ?
            const existingTouch = touchesRef.current.find(t => t.id === nativeTouch.identifier);

            if (existingTouch) {
                // Il existe déjà, on met juste à jour sa position s'il a glissé
                newTouches.push({
                    ...existingTouch,
                    x: nativeTouch.clientX,
                    y: nativeTouch.clientY
                });
            } else {
                // C'est un nouveau doigt ! On lui donne une couleur et on avance l'index.
                const color = COLORS[colorIndexRef.current % COLORS.length];
                colorIndexRef.current++;

                newTouches.push({
                    id: nativeTouch.identifier,
                    x: nativeTouch.clientX,
                    y: nativeTouch.clientY,
                    color: color
                });
            }
        });

        // 5.b. Mettre à jour l'état
        setTouches(newTouches);
    }, [phase, disabled]);

    // --- LE RENDU VISUEL ---
    return (
        // 🛡️ SÉCURITÉ MOBILE ABSOLUE 🛡️
        // touch-none : Empêche le pinch-to-zoom et le swipe navigation
        // overscroll-none : Empêche l'effet de rebond (pull to refresh)
        // select-none : Empêche la sélection de texte accidentelle
        <div
            className="fixed inset-0 w-full h-full bg-gray-950 touch-none overscroll-none select-none z-50 overflow-hidden"
            // On écoute toutes les variations tactiles
            onTouchStart={handleTouch}
            onTouchMove={handleTouch}
            onTouchEnd={handleTouch}
            onTouchCancel={handleTouch}
            // Fallback pour la souris si on teste sur PC
            onMouseDown={() => console.log('Utilisez le mode mobile pour tester ce composant !')}
        >

            {/* L'INDICATION TEXTUELLE (Attente) */}
            {phase === 'GATHERING' && (
                <div className="absolute inset-x-0 top-1/4 flex flex-col items-center pointer-events-none opacity-50 z-10">
                    <h2 className="text-2xl font-black text-white uppercase tracking-widest text-center px-6 leading-tight">
                        {touches.length === 0
                            ? "Posez vos doigts"
                            : touches.length === 1
                                ? "Encore un joueur..."
                                : "Maintenez la position..."}
                    </h2>

                    {touches.length >= 2 && (
                        <div className="mt-6 w-48 h-2 bg-gray-800 rounded-full overflow-hidden">
                            <motion.div
                                className="h-full bg-amber-500"
                                initial={{ width: "0%" }}
                                animate={{ width: "100%" }}
                                transition={{ duration: sensorPayload.hold_duration_ms / 1000, ease: "linear" }}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* 🚀 NOUVEAU : LE TEXTE DU RÉSULTAT */}
            {phase === 'RESULT' && (
                <div className="absolute inset-x-0 top-[15%] flex flex-col items-center pointer-events-none z-20">
                    <motion.h2
                        initial={{ scale: 0, opacity: 0, y: -20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        transition={{ type: "spring", bounce: 0.5 }}
                        className="text-4xl sm:text-5xl font-black text-white uppercase italic tracking-tighter text-center drop-shadow-[0_0_30px_rgba(239,68,68,1)]"
                    >
                        C'EST TOI !
                    </motion.h2>
                </div>
            )}

            {/* LES CERCLES SOUS LES DOIGTS */}
            <AnimatePresence>
                {touches.map((touch) => {
                    const isWinner = phase === 'RESULT' && selectedTouchId === touch.id;
                    const isLoser = phase === 'RESULT' && selectedTouchId !== touch.id;
                    const isSelectingPulse = phase === 'SELECTING';

                    const CIRCLE_SIZE = 100;

                    return (
                        <motion.div
                            key={touch.id}
                            // 🚀 On laisse Framer gérer UNIQUEMENT l'échelle et l'opacité
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{
                                scale: isWinner ? 2.5 : isLoser ? 0 : 1.2,
                                opacity: isLoser ? 0 : 0.9
                            }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={{
                                type: "spring",
                                stiffness: 300,
                                damping: 20,
                                ...(isSelectingPulse ? { repeat: Infinity, duration: 0.3, repeatType: 'reverse' } : {})
                            }}
                            // 🚀 FIX: z-40 pour être sûr d'être au-dessus de tout, et on enlève le mix-blend-screen
                            className="absolute rounded-full pointer-events-none z-40"
                            style={{
                                // 🚀 FIX SAFARI: Le positionnement CSS natif avec left/top
                                left: touch.x - (CIRCLE_SIZE / 2),
                                top: touch.y - (CIRCLE_SIZE / 2),
                                width: `${CIRCLE_SIZE}px`,
                                height: `${CIRCLE_SIZE}px`,
                                backgroundColor: isWinner ? '#ef4444' : touch.color,
                                boxShadow: isWinner ? `0 0 100px #ef4444` : `0 0 30px ${touch.color}`,
                                border: '4px solid rgba(255,255,255,0.8)'
                            }}
                        >
                            <div className="absolute inset-0 m-auto w-1/2 h-1/2 rounded-full bg-white/40 backdrop-blur-md" />
                        </motion.div>
                    );
                })}
            </AnimatePresence>

        </div>
    );
}