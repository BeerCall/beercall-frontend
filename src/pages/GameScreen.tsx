import {useParams, useNavigate} from 'react-router-dom';
import {motion, AnimatePresence} from 'framer-motion';
import {AlertTriangle, Loader2, X} from 'lucide-react';
import {useGameEngine} from '../hooks/useGameEngine';
import StandardButtons from '../components/Game/Sensors/StandardButtons';
import TimeBombButton from '../components/Game/Sensors/TimeBombButton';
import DuelSplitScreen from '../components/Game/Sensors/DuelSplitScreen';
import MultiTouchTracker from '../components/Game/Sensors/MultiTouchTracker';
import GyroscopeTracker from '../components/Game/Sensors/GyroscopeTracker';
import AccelerometerTracker from '../components/Game/Sensors/AccelerometerTracker';
import SwipeToTarget from '../components/Game/Sensors/SwipeToTarget';
import CameraCapture from '../components/Game/Sensors/CameraCapture';
import ImageDisplay from '../components/Game/Sensors/ImageDisplay';
import CanvasDraw from '../components/Game/Sensors/CanvasDraw';
import {useGameUIStore} from '../store/useGameUIStore';

// 🚀 AJOUT DE LA PROP OPTIONNELLE 'aperoIdProp'
export default function GameScreen({aperoIdProp}: { aperoIdProp: string | null }) {
    const {aperoId: paramsId} = useParams<{ aperoId: string }>();

    // 🚀 LA MAGIE EST ICI : On utilise la Prop envoyée par le Dashboard en priorité !
    const aperoId = aperoIdProp || paramsId;

    const navigate = useNavigate();
    const {gameState, isLocked, isError, sendAction} = useGameEngine(aperoId);

    const closeGameScreen = useGameUIStore((state) => state.closeGameScreen);

    // ERREUR CRITIQUE
    if (isError) {
        return (
            <div className="h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center">
                <AlertTriangle className="text-red-500 mb-4" size={64}/>
                <h2 className="text-2xl font-black text-white mb-2 uppercase">Aïe, ça a cassé !</h2>
                <p className="text-gray-400 mb-8">On a renversé une bière sur les serveurs...</p>
                <button onClick={() => navigate(-1)}
                        className="px-6 py-4 bg-amber-600 text-white rounded-2xl font-black uppercase">
                    Retour à l'Apéro
                </button>
            </div>
        );
    }

    // CHARGEMENT INITIAL (Le fameux loader qui tournait en boucle)
    if (!gameState) {
        return (
            <div className="h-screen bg-gray-950 flex flex-col items-center justify-center">
                <Loader2 className="animate-spin text-amber-600 mb-4" size={48}/>
                <span className="text-gray-500 font-bold uppercase tracking-widest text-xs animate-pulse">
                    Chargement de l'apéro {aperoId}...
                </span>
            </div>
        );
    }

    return (
        <div className="h-screen w-full bg-gray-950 text-white flex flex-col overflow-hidden relative">

            {/* 🚀 2. LE BOUTON FERMER (Permanent, en haut à gauche) */}
            <button
                onClick={closeGameScreen}
                className="absolute top-[calc(15px+env(safe-area-inset-top))] left-6 z-[110] p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full border border-white/10 transition-all active:scale-90"
            >
                <X size={24} className="text-white"/>
            </button>

            {/* OVERLAY ANTI-DOUBLE-CLIC */}
            {isLocked && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-950/40 backdrop-blur-sm">
                    <Loader2 className="animate-spin text-amber-500" size={48}/>
                </div>
            )}

            {/* HEADER : Infos de tour */}
            <header className="p-6 pt-[calc(24px+env(safe-area-inset-top))] text-center shrink-0">
                <motion.div
                    key={`header-${gameState.turn_of}`}
                    initial={{opacity: 0, y: -10}}
                    animate={{opacity: 1, y: 0}}
                >
                    <h3 className="text-amber-500 font-black uppercase tracking-[0.2em] text-xs mb-1 opacity-80">
                        {gameState.instruction_header}
                    </h3>
                    <h2 className="text-gray-400 font-bold text-sm tracking-wide">
                        C'est à <span
                        className="text-white font-black underline decoration-amber-500 decoration-2 underline-offset-4">{gameState.turn_of}</span> de
                        jouer
                    </h2>
                </motion.div>
            </header>

            {/* MAIN : Titre & Description au centre */}
            <main className="flex-1 flex flex-col items-center justify-center p-6 text-center z-10 overflow-y-auto">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={gameState.title}
                        initial={{opacity: 0, scale: 0.95}}
                        animate={{opacity: 1, scale: 1}}
                        exit={{opacity: 0, scale: 1.05}}
                        transition={{duration: 0.2}}
                        className="w-full max-w-md"
                    >
                        <h1 className="text-4xl sm:text-5xl font-black uppercase italic tracking-tighter text-white drop-shadow-xl mb-6 leading-tight">
                            {gameState.title}
                        </h1>
                        <p className="text-lg text-gray-300 font-medium leading-relaxed">
                            {gameState.description}
                        </p>
                    </motion.div>
                </AnimatePresence>
            </main>

            {/* FOOTER : Capteurs / Interaction */}
            <footer
                className={`shrink-0 w-full relative ${(gameState.required_sensor?.type === 'DUEL_SPLIT_SCREEN' || gameState.required_sensor?.type === 'MULTI_TOUCH_TRACKER' || gameState.required_sensor?.type === 'CANVAS_DRAW') ? 'flex-1' : 'p-6 pb-[calc(24px+env(safe-area-inset-bottom))]'}`}>
                <AnimatePresence mode="wait">
                    <motion.div
                        key={`sensor-${gameState.game_id}-${gameState.required_sensor?.type}`}
                        initial={{opacity: 0, y: 20}}
                        animate={{opacity: 1, y: 0}}
                        exit={{opacity: 0, y: 20}}
                        transition={{duration: 0.2}}
                        className={(gameState.required_sensor?.type === 'DUEL_SPLIT_SCREEN' || gameState.required_sensor?.type === 'MULTI_TOUCH_TRACKER' || gameState.required_sensor?.type === 'CANVAS_DRAW') ? 'absolute inset-0' : ''}
                    >
                        {gameState.required_sensor?.type === 'BUTTONS' ? (
                            <StandardButtons
                                actions={gameState.actions || []}
                                onAction={sendAction}
                                disabled={isLocked}
                            />
                        ) : gameState.required_sensor?.type === 'CANVAS_DRAW' ? (
                            <CanvasDraw
                                sensorPayload={gameState.required_sensor as any}
                                onAction={sendAction}
                                disabled={isLocked}
                            />
                        ) : gameState.required_sensor?.type === 'IMAGE_DISPLAY' ? (
                            // 🚀 LE NOUVEAU CAPTEUR EST ICI
                            <ImageDisplay
                                sensorPayload={gameState.required_sensor as any}
                                actions={gameState.actions || []}
                                onAction={sendAction}
                                disabled={isLocked}
                            />
                        ) : gameState.required_sensor?.type === 'CAMERA_CAPTURE' ? (
                            <CameraCapture
                                sensorPayload={gameState.required_sensor as any}
                                onAction={sendAction}
                                disabled={isLocked}
                            />
                        ) : gameState.required_sensor?.type === 'SWIPE_TO_TARGET' ? (
                            <SwipeToTarget
                                sensorPayload={gameState.required_sensor as any}
                                onAction={sendAction}
                                disabled={isLocked}
                            />
                        ) : gameState.required_sensor?.type === 'ACCELEROMETER' ? (
                            <AccelerometerTracker
                                sensorPayload={gameState.required_sensor as any}
                                onAction={sendAction}
                                disabled={isLocked}
                            />
                        ) : gameState.required_sensor?.type === 'GYROSCOPE' ? (
                            <GyroscopeTracker
                                sensorPayload={gameState.required_sensor as any}
                                onAction={sendAction}
                                disabled={isLocked}
                            />
                        ) : gameState.required_sensor?.type === 'TIME_BOMB_BUTTON' ? (
                            <TimeBombButton
                                sensorPayload={gameState.required_sensor as any}
                                onAction={sendAction}
                                disabled={isLocked}
                            />
                        ) : gameState.required_sensor?.type === 'DUEL_SPLIT_SCREEN' ? (
                            <DuelSplitScreen
                                sensorPayload={gameState.required_sensor as any}
                                onAction={sendAction}
                                disabled={isLocked}
                            />
                        ) : gameState.required_sensor?.type === 'MULTI_TOUCH_TRACKER' ? (
                            <MultiTouchTracker
                                sensorPayload={gameState.required_sensor as any}
                                onAction={sendAction}
                                disabled={isLocked}
                            />
                        ) : (
                            <div
                                className="p-4 bg-gray-900 border border-gray-800 rounded-2xl text-gray-500 text-sm font-bold text-center">
                                🚧 Capteur inconnu : {gameState.required_sensor?.type}
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </footer>
        </div>
    );
}