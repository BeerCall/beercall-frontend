import {Suspense, useMemo, useEffect, useLayoutEffect, useRef, useState, useCallback, useContext} from 'react';
import {Canvas, useFrame, useThree} from '@react-three/fiber';
import {
    OrbitControls,
    ContactShadows,
    useFBX,
    Html,
    useProgress,
    useAnimations
} from '@react-three/drei';
import {QueryClientContext} from '@tanstack/react-query';
import * as THREE from 'three';
import {SkeletonUtils} from 'three-stdlib';
import {MODELS_URL} from "../../lib/api.ts";
import type {AvatarConfig, AvatarTransform} from "../../types/avatar.ts";
import SceneReadyProbe from './SceneReadyProbe';
import {warmAvatarModels} from './warmupAvatar';
import {preloadAvatarAnimations, useAvatarAnimations} from '../../hooks/useAvatarAnimations';

const silenceWarnings = () => {
    const originalWarn = console.warn;
    console.warn = (...args) => {
        const msg = args.join(' ');
        if (msg.includes('THREE.') || msg.includes('X4122') || msg.includes('skinning weights') || msg.includes('deprecated')) return;
        originalWarn(...args);
    };
};

const CONFIG = {
    scale: 1,
    cameraZ: 300,
    cameraTargetY: 80
};

// 🍺 LE RECTIFICATEUR D'OBJETS PERSONNALISÉS
const CUSTOM_ITEMS_CONFIG: Record<string, AvatarTransform> = {
    'Men_accessory_Beer_500': {
        position: [75, 150, 10],
        scale: [100, 100, 100],
        rotation: [0, 0, 0]
    },
    'Men_accessory_Pikachu_2000': {
        position: [75, 0, -60],
        scale: [50, 50, 50],
        rotation: [0, 625, 0]
    },
    'Men_accessory_Bellsprout_2000': {
        position: [75, 50, -20],
        scale: [.5, .5, .5],
        rotation: [400, 625, 100]
    },
    'Men_accessory_Bulbasaur_2000': {
        position: [75, 10, 0],
        scale: [1, 1, 1],
        rotation: [300, 625, -100]
    },
    'Men_accessory_Charmander_2000': {
        position: [75, 25, 0],
        scale: [1, 1, 1],
        rotation: [250, 625, 0]
    },
    'Men_accessory_Cubone_2000': {
        position: [75, 50, 0],
        scale: [1.5, 1.5, 1.5],
        rotation: [300, 600, 100]
    },
    'Men_accessory_Eevee_2000': {
        position: [75, 30, 0],
        scale: [1, 1, 1],
        rotation: [300, 600, 100]
    },
    'Men_accessory_Glalie_2000': {
        position: [100, 50, 0],
        scale: [.5, .5, .5],
        rotation: [300, 600, 100]
    },
    'Men_accessory_Haunter_2000': {
        position: [100, 30, 0],
        scale: [1.5, 1.5, 1.5],
        rotation: [300, 600, -100]
    },
    'Men_accessory_Jigglypuff_2000': {
        position: [100, 40, 0],
        scale: [.8, .8, .8],
        rotation: [300, 600, 100]
    },
    'Men_accessory_Magikarp_2000': {
        position: [75, 30, 0],
        scale: [1, 1, 1],
        rotation: [0, 0, 100]
    },
    'Men_accessory_Magnemite_2000': {
        position: [75, 30, 0],
        scale: [1, 1, 1],
        rotation: [300, 600, 100]
    },
    'Men_accessory_Marill_2000': {
        position: [75, 30, 0],
        scale: [1, 1, 1],
        rotation: [300, 600, 100]
    },
    'Men_accessory_Mew_2000': {
        position: [75, 80, 0],
        scale: [2, 2, 2],
        rotation: [300, 600, 100]
    },
    'Men_accessory_Oddish_2000': {
        position: [75, 50, 0],
        scale: [1, 1, 1],
        rotation: [300, 600, 100]
    },
    'Men_accessory_Poliwag_2000': {
        position: [75, 30, 0],
        scale: [1, 1, 1],
        rotation: [300, 600, 100]
    },
    'Men_accessory_Porygon_2000': {
        position: [75, 30, 0],
        scale: [1, 1, 1],
        rotation: [300, 600, 100]
    },
    'Men_accessory_Snorlax_2000': {
        position: [150, 60, 0],
        scale: [2.5, 2.5, 2.5],
        rotation: [300, 600, 0]
    },
    'Men_accessory_Squirtle_2000': {
        position: [75, 30, 0],
        scale: [2, 2, 2],
        rotation: [300, 600, 100]
    },
    'Men_accessory_Victreebel_2000': {
        position: [50, 30, 20],
        scale: [.1, .1, .1],
        rotation: [0, 0, 0]
    },
    'Men_accessory_Kart_3000': {
        position: [0, 0, 0],
        scale: [2, 2, 2],
        rotation: [0, 70, 0]
    },
    'Men_accessory_Soccer_500': {
        position: [50, 0, 0],
        scale: [.5, .5, .5],
        rotation: [0, 0, 0]
    },
    'Women_accessory_Beer_500': {
        position: [75, 150, 10],
        scale: [100, 100, 100],
        rotation: [0, 0, 0]
    },
    'Women_accessory_Gun_500': {
        position: [0, 150, -133],
        scale: [100, 100, 100],
        rotation: [0, 0, 0]
    },
    'Women_accessory_Sword_500': {
        position: [0, 150, -133],
        scale: [100, 100, 100],
        rotation: [0, 0, 0]
    },
    'Women_accessory_Pikachu_2000': {
        position: [75, 0, -60],
        scale: [50, 50, 50],
        rotation: [0, 625, 0]
    },
    'Women_accessory_Bellsprout_2000': {
        position: [75, 50, -20],
        scale: [.5, .5, .5],
        rotation: [400, 625, 100]
    },
    'Women_accessory_Bulbasaur_2000': {
        position: [75, 10, 0],
        scale: [1, 1, 1],
        rotation: [300, 625, -100]
    },
    'Women_accessory_Charmander_2000': {
        position: [75, 25, 0],
        scale: [1, 1, 1],
        rotation: [250, 625, 0]
    },
    'Women_accessory_Cubone_2000': {
        position: [75, 50, 0],
        scale: [1.5, 1.5, 1.5],
        rotation: [300, 600, 100]
    },
    'Women_accessory_Eevee_2000': {
        position: [75, 30, 0],
        scale: [1, 1, 1],
        rotation: [300, 600, 100]
    },
    'Women_accessory_Glalie_2000': {
        position: [100, 50, 0],
        scale: [.5, .5, .5],
        rotation: [300, 600, 100]
    },
    'Women_accessory_Haunter_2000': {
        position: [100, 30, 0],
        scale: [1.5, 1.5, 1.5],
        rotation: [300, 600, -100]
    },
    'Women_accessory_Jigglypuff_2000': {
        position: [100, 40, 0],
        scale: [.8, .8, .8],
        rotation: [300, 600, 100]
    },
    'Women_accessory_Magikarp_2000': {
        position: [75, 30, 0],
        scale: [1, 1, 1],
        rotation: [0, 0, 100]
    },
    'Women_accessory_Magnemite_2000': {
        position: [75, 30, 0],
        scale: [1, 1, 1],
        rotation: [300, 600, 100]
    },
    'Women_accessory_Marill_2000': {
        position: [75, 30, 0],
        scale: [1, 1, 1],
        rotation: [300, 600, 100]
    },
    'Women_accessory_Mew_2000': {
        position: [75, 80, 0],
        scale: [2, 2, 2],
        rotation: [300, 600, 100]
    },
    'Women_accessory_Oddish_2000': {
        position: [75, 50, 0],
        scale: [1, 1, 1],
        rotation: [300, 600, 100]
    },
    'Women_accessory_Poliwag_2000': {
        position: [75, 30, 0],
        scale: [1, 1, 1],
        rotation: [300, 600, 100]
    },
    'Women_accessory_Porygon_2000': {
        position: [75, 30, 0],
        scale: [1, 1, 1],
        rotation: [300, 600, 100]
    },
    'Women_accessory_Snorlax_2000': {
        position: [150, 60, 0],
        scale: [2.5, 2.5, 2.5],
        rotation: [300, 600, 0]
    },
    'Women_accessory_Squirtle_2000': {
        position: [75, 30, 0],
        scale: [2, 2, 2],
        rotation: [300, 600, 100]
    },
    'Women_accessory_Victreebel_2000': {
        position: [50, 30, 20],
        scale: [.1, .1, .1],
        rotation: [0, 0, 0]
    },
    'Women_accessory_Kart_3000': {
        position: [0, 0, 0],
        scale: [2, 2, 2],
        rotation: [0, 70, 0]
    },
    'Women_accessory_Soccer_500': {
        position: [50, 0, 0],
        scale: [.5, .5, .5],
        rotation: [0, 0, 0]
    }
};

function CanvasLoader() {
    const {progress} = useProgress();
    return (
        <Html center>
            <div className="flex flex-col items-center bg-white/90 p-4 rounded-2xl shadow-xl backdrop-blur-md">
                <div className="w-8 h-8 border-4 border-beer border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs font-black text-beer mt-2 tracking-widest">{progress.toFixed(0)}%</p>
            </div>
        </Html>
    );
}

// 🚀 NOUVEAU COMPOSANT AVATAR FRAME NOTIFIER : Raccorde notifyInitialFrame à un probe de frame
function AvatarFrameNotifier({
    ready,
    isIdle,
    onFrameSubmitted,
}: {
    ready: boolean;
    isIdle: boolean;
    onFrameSubmitted: () => void;
}) {
    const armedRef = useRef(false);
    const submittedRef = useRef(false);
    const frameRequest = useRef<number | undefined>(undefined);
    const callbackRef = useRef(onFrameSubmitted);
    useEffect(() => {
        callbackRef.current = onFrameSubmitted;
    }, [onFrameSubmitted]);

    useEffect(() => {
        if (ready && isIdle && !submittedRef.current) {
            armedRef.current = true;
        } else if (!ready) {
            armedRef.current = false;
            submittedRef.current = false;
        } else {
            armedRef.current = false;
        }
        return () => {
            armedRef.current = false;
            if (frameRequest.current !== undefined) {
                cancelAnimationFrame(frameRequest.current);
                frameRequest.current = undefined;
            }
        };
    }, [ready, isIdle]);

    useFrame((state) => {
        if (!armedRef.current || submittedRef.current || frameRequest.current !== undefined) return;
        const before = state.gl.info.render.frame;
        frameRequest.current = requestAnimationFrame(() => {
            frameRequest.current = undefined;
            const { calls, frame } = state.gl.info.render;
            if (!armedRef.current || submittedRef.current || document.hidden || frame <= before || calls <= 0) return;
            submittedRef.current = true;
            armedRef.current = false;
            callbackRef.current();
        });
    });

    return null;
}

// 🚀 NOUVEAU COMPOSANT AVATAR PART : Chaque partie s'anime TOUTE SEULE
function AvatarPart({
    path,
    customTransform,
    animations,
    currentAnim,
    partKey,
    onPartReady,
    onPartUnmount,
}: {
    path: string,
    customTransform?: AvatarTransform,
    animations?: THREE.AnimationClip[],
    currentAnim?: string,
    partKey?: string,
    onPartReady?: (partKey: string, meshCount: number, actionPlaying: boolean) => void,
    onPartUnmount?: (partKey: string) => void,
}) {
    const fbx = useFBX(path);
    const groupRef = useRef<THREE.Group>(null);

    const clonedFbx = useMemo(() => {
        if (!fbx) return null;

        // SkeletonUtils clone partage les matériaux du FBX en cache ; les
        // marquer `needsUpdate` à chaque montage forçait une revalidation de
        // programme et re-gonflait le coût d'ouverture des mondes.
        return SkeletonUtils.clone(fbx);
    }, [fbx]);

    // On crée un AnimationMixer isolé pour CE vêtement
    const {actions} = useAnimations(animations || [], groupRef);
    const lastAnimRef = useRef<string | null>(null);
    const lastActionRef = useRef<THREE.AnimationAction | null>(null);
    const unmountCbRef = useRef(onPartUnmount);
    useEffect(() => { unmountCbRef.current = onPartUnmount; }, [onPartUnmount]);

    useEffect(() => {
        let isActionPlaying = false;
        if (currentAnim && actions[currentAnim]) {
            const action = actions[currentAnim];
            if (lastAnimRef.current !== currentAnim || lastActionRef.current !== action || !action.isRunning()) {
                if (lastActionRef.current && lastActionRef.current !== action) {
                    lastActionRef.current.fadeOut(0.2);
                }
                action.reset().fadeIn(0.2).play();
                lastAnimRef.current = currentAnim;
                lastActionRef.current = action;
            }
            isActionPlaying = action.isRunning();
        }

        let meshCount = 0;
        if (clonedFbx) {
            clonedFbx.traverse((child) => {
                if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).visible !== false) {
                    meshCount++;
                }
            });
        }

        if (partKey && onPartReady) {
            onPartReady(partKey, meshCount, isActionPlaying);
        }
    }, [currentAnim, actions, clonedFbx, partKey, onPartReady, animations]);

    useEffect(() => {
        return () => {
            if (lastActionRef.current) {
                lastActionRef.current.fadeOut(0.2);
                lastActionRef.current.stop();
            }
            if (partKey) {
                unmountCbRef.current?.(partKey);
            }
        };
    }, [partKey]);

    if (!clonedFbx) return null;

    return (
        <group
            ref={groupRef}
            position={customTransform?.position || [0, 0, 0]}
            scale={customTransform?.scale || [1, 1, 1]}
            rotation={customTransform?.rotation || [0, 0, 0]}
        >
            <primitive object={clonedFbx}/>
        </group>
    );
}

export function ModularAvatar({
    config,
    onAnimationsLoaded,
    onReadinessChange,
}: {
    config: AvatarConfig,
    onAnimationsLoaded?: (animations: string[]) => void,
    onReadinessChange?: (isReady: boolean, details?: { parts: string[]; meshCount: number }) => void,
}) {
    const accessoryTransform = config.accessory ? CUSTOM_ITEMS_CONFIG[config.accessory] : undefined;

    const targetAnimation = config.animation || "Idle";
    const {
        clipNames,
        activeClip,
        deferredStatus,
        error,
        notifyInitialFrame,
        retry,
    } = useAvatarAnimations(targetAnimation);

    // Protection contre le glitch d'animation (CHAL-01, REV-06) :
    // ModularAvatar ne transmet à AvatarPart que le clip actif, via un useMemo stable.
    // Ne JAMAIS utiliser [activeClip] inline dans le JSX.
    const activeAnimations = useMemo(() => activeClip ? [activeClip] : [], [activeClip]);
    const currentAnim = activeClip?.name;

    const expectedParts = useMemo(() => {
        if (!config) return [];
        const parts: string[] = [];
        if (config.head && config.head !== 'none') parts.push('head');
        if (config.body && config.body !== 'none') parts.push('body');
        if (config.legs && config.legs !== 'none') parts.push('legs');
        if (config.feet && config.feet !== 'none') parts.push('feet');
        if (config.accessory && config.accessory !== 'none') parts.push('accessory');
        return parts;
    }, [config]);

    const readyPartsRef = useRef<Map<string, { meshCount: number; actionPlaying: boolean }>>(new Map());
    const [isAvatarReady, setIsAvatarReady] = useState(false);

    const checkReadiness = useCallback(() => {
        if (expectedParts.length === 0) {
            setIsAvatarReady(false);
            onReadinessChange?.(false);
            return;
        }

        let allPresent = true;
        let totalMeshes = 0;
        let allActionsPlaying = true;

        for (const part of expectedParts) {
            const status = readyPartsRef.current.get(part);
            if (!status) {
                allPresent = false;
                break;
            }
            totalMeshes += status.meshCount;
            if (!status.actionPlaying) {
                allActionsPlaying = false;
                break;
            }
        }

        const isReady = allPresent && totalMeshes > 0 && allActionsPlaying;
        setIsAvatarReady(isReady);
        onReadinessChange?.(isReady, isReady ? { parts: expectedParts, meshCount: totalMeshes } : undefined);
    }, [expectedParts, onReadinessChange]);

    const handlePartReady = useCallback((partKey: string, meshCount: number, actionPlaying: boolean) => {
        readyPartsRef.current.set(partKey, { meshCount, actionPlaying });
        checkReadiness();
    }, [checkReadiness]);

    const handlePartUnmount = useCallback((partKey: string) => {
        readyPartsRef.current.delete(partKey);
        checkReadiness();
    }, [checkReadiness]);

    // Appeler onAnimationsLoaded avec les 25 noms du manifeste dès sa réception
    useEffect(() => {
        if (onAnimationsLoaded && clipNames.length > 0) {
            onAnimationsLoaded([...clipNames]);
        }
    }, [clipNames, onAnimationsLoaded]);

    const isIdle = currentAnim === 'Idle';

    return (
        <group>
            {/* Raccorder notifyInitialFrame du hook T10 à un probe de frame, armé après readiness des pièces ET action Idle */}
            <AvatarFrameNotifier
                ready={isAvatarReady}
                isIdle={isIdle}
                onFrameSubmitted={notifyInitialFrame}
            />

            {/* UI Html de chargement/erreur avec bouton « Réessayer les animations » ; différé en échec n'efface pas l'avatar */}
            {error && !activeClip && (
                <Html center>
                    <div className="flex flex-col items-center bg-white/90 p-4 rounded-2xl shadow-xl backdrop-blur-md text-center max-w-xs">
                        <p className="text-xs font-bold text-red-600 mb-2">Erreur de chargement des animations</p>
                        <button
                            type="button"
                            onClick={() => { void retry(); }}
                            className="px-3 py-1 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 cursor-pointer"
                        >
                            Réessayer les animations
                        </button>
                    </div>
                </Html>
            )}

            {deferredStatus === 'error' && (
                <Html position={[0, -20, 0]} center>
                    <div className="bg-amber-100/90 border border-amber-300 text-amber-900 px-3 py-1 rounded-lg text-xs flex items-center gap-2 shadow-md">
                        <span>Animations différées indisponibles</span>
                        <button
                            type="button"
                            onClick={() => { void retry(); }}
                            className="underline font-bold text-amber-700 hover:text-amber-900 cursor-pointer"
                        >
                            Réessayer les animations
                        </button>
                    </div>
                </Html>
            )}

            {/* Le paramètre key force React à recréer la pièce et relancer l'animation */}
            {config.head && config.head !== 'none' &&
                <AvatarPart key={`head-${config.head}`} path={`${MODELS_URL}/${config.head}.fbx`}
                            partKey="head" onPartReady={handlePartReady} onPartUnmount={handlePartUnmount}
                            animations={activeAnimations} currentAnim={currentAnim}/>}

            {config.body && config.body !== 'none' &&
                <AvatarPart key={`body-${config.body}`} path={`${MODELS_URL}/${config.body}.fbx`}
                            partKey="body" onPartReady={handlePartReady} onPartUnmount={handlePartUnmount}
                            animations={activeAnimations} currentAnim={currentAnim}/>}

            {config.legs && config.legs !== 'none' &&
                <AvatarPart key={`legs-${config.legs}`} path={`${MODELS_URL}/${config.legs}.fbx`}
                            partKey="legs" onPartReady={handlePartReady} onPartUnmount={handlePartUnmount}
                            animations={activeAnimations} currentAnim={currentAnim}/>}

            {config.feet && config.feet !== 'none' &&
                <AvatarPart key={`feet-${config.feet}`} path={`${MODELS_URL}/${config.feet}.fbx`}
                            partKey="feet" onPartReady={handlePartReady} onPartUnmount={handlePartUnmount}
                            animations={activeAnimations} currentAnim={currentAnim}/>}

            {config.accessory && config.accessory !== 'none' && (
                <AvatarPart
                    key={`acc-${config.accessory}`}
                    path={`${MODELS_URL}/${config.accessory}.fbx`}
                    partKey="accessory"
                    onPartReady={handlePartReady}
                    onPartUnmount={handlePartUnmount}
                    customTransform={accessoryTransform}
                    animations={activeAnimations}
                    currentAnim={currentAnim}
                />
            )}
        </group>
    );
}

function restoreClockElapsed(clockInstance: { elapsedTime: number }, elapsed: number) {
    clockInstance.elapsedTime = elapsed;
}

function AvatarFrameloopController({ active }: { active: boolean }) {
    const setFrameloop = useThree((state) => state.setFrameloop);
    const clock = useThree((state) => state.clock);
    const invalidate = useThree((state) => state.invalidate);
    const savedElapsedRef = useRef(0);
    const wasActiveRef = useRef(true);

    useLayoutEffect(() => {
        if (active) {
            if (!wasActiveRef.current) {
                // Dégel : redémarrage de l'horloge sans inclure l'inactivité (CHAL-04, REV-06)
                if (typeof setFrameloop === 'function') {
                    setFrameloop('always');
                }
                // Fiber resets elapsedTime in setFrameloop; restore only AFTER it starts the clock.
                if (clock) restoreClockElapsed(clock, savedElapsedRef.current);
                if (typeof invalidate === 'function') {
                    invalidate();
                }
                wasActiveRef.current = true;
            }
        } else {
            if (wasActiveRef.current) {
                // Gel : sauvegarde du temps écoulé et arrêt du frameloop
                if (clock) {
                    savedElapsedRef.current = typeof clock.getElapsedTime === 'function'
                        ? clock.getElapsedTime()
                        : (clock.elapsedTime || 0);
                }
                if (typeof setFrameloop === 'function') {
                    setFrameloop('never');
                }
                wasActiveRef.current = false;
            }
        }
    }, [active, setFrameloop, clock, invalidate]);

    useEffect(() => {
        return () => {
            if (!wasActiveRef.current && typeof setFrameloop === 'function') {
                setFrameloop('always');
            }
        };
    }, [setFrameloop]);

    return null;
}

interface AvatarCanvasProps {
    config: AvatarConfig;
    disableZoom?: boolean;
    disablePan?: boolean;
    onAnimationsLoaded?: (animations: string[]) => void;
    headOnly?: boolean;
    view?: string;
    instanceId?: string;
    active?: boolean;
}

export default function AvatarCanvas({
                                         config,
                                         disableZoom = false,
                                         disablePan = false,
                                         onAnimationsLoaded,
                                         headOnly = false,
                                         view,
                                         instanceId,
                                         active = true
                                     }: AvatarCanvasProps) {
    const [isDocumentVisible, setIsDocumentVisible] = useState(() =>
        typeof document === 'undefined' ? true : !document.hidden
    );

    useEffect(() => {
        const handleVisibilityChange = () => {
            setIsDocumentVisible(!document.hidden);
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    const isEffectiveActive = active && isDocumentVisible;
    useEffect(() => {
        silenceWarnings();
    }, []);

    // Le manifeste et le clip Idle sont indépendants des FBX : les demander dès
    // le montage du Canvas évite d'attendre la fin du parse des modèles pour
    // commencer le téléchargement des animations.
    const queryClient = useContext(QueryClientContext);
    useEffect(() => {
        if (queryClient) void preloadAvatarAnimations(queryClient);
    }, [queryClient]);

    // 🚀 PRÉCHARGEMENT CIBLÉ DES VÊTEMENTS
    useEffect(() => {
        if (!config) return;
        if (headOnly) {
            if (config.head && config.head !== 'none') useFBX.preload(`${MODELS_URL}/${config.head}.fbx`);
        } else {
            warmAvatarModels(config);
        }
    }, [config, headOnly]);

    const targetY = headOnly ? 160 : CONFIG.cameraTargetY;
    const cameraZ = headOnly ? 80 : CONFIG.cameraZ;
    const renderConfig = useMemo(() => {
        return headOnly && config 
            ? { head: config.head, gender: config.gender, animation: config.animation } 
            : config;
    }, [headOnly, config]);

    const expectedParts = useMemo(() => {
        if (!renderConfig) return [];
        const parts: string[] = [];
        if (renderConfig.head && renderConfig.head !== 'none') parts.push('head');
        if (!headOnly) {
            if (renderConfig.body && renderConfig.body !== 'none') parts.push('body');
            if (renderConfig.legs && renderConfig.legs !== 'none') parts.push('legs');
            if (renderConfig.feet && renderConfig.feet !== 'none') parts.push('feet');
            if (renderConfig.accessory && renderConfig.accessory !== 'none') parts.push('accessory');
        }
        return parts;
    }, [renderConfig, headOnly]);

    const [isAvatarReady, setIsAvatarReady] = useState(false);
    const handleReadinessChange = useCallback((ready: boolean) => {
        setIsAvatarReady(ready);
    }, []);

    return (
        <div className="w-full h-full relative">
            <Canvas camera={{position: [0, targetY, cameraZ], fov: 45}} dpr={[1, 1.5]}
                    className="z-10 relative">
                <AvatarFrameloopController active={isEffectiveActive}/>
                <ambientLight intensity={1.5}/>
                <directionalLight position={[10, 10, 10]} intensity={2.5}/>
                <directionalLight position={[-10, 10, -10]} intensity={1}/>

                {/* 🚀 APRÈS : On sépare les Suspense pour éviter le conflit d'état ! */}
                <Suspense fallback={headOnly ? null : <CanvasLoader/>}>
                    <ModularAvatar
                        config={renderConfig}
                        onAnimationsLoaded={onAnimationsLoaded}
                        onReadinessChange={handleReadinessChange}
                    />
                    <SceneReadyProbe
                        kind="avatar"
                        id={instanceId}
                        view={view ?? (headOnly ? 'head' : 'full')}
                        ready={isAvatarReady}
                        expectedParts={expectedParts}
                    />
                    {/* Une seule passe : l'ombre est un halo statique sous l'avatar, la
                        recalculer à chaque frame doublait les draw calls du Canvas. */}
                    {!headOnly && <ContactShadows position={[0, 0, 0]} opacity={0.6}
                                                  scale={200} blur={2} far={200} resolution={256}
                                                  frames={1} color="#000000"/>}
                </Suspense>

                <OrbitControls
                    enabled={!disableZoom || !disablePan}
                    enableZoom={!disableZoom}
                    enablePan={!disablePan}
                    target={[0, targetY, 0]}
                    minPolarAngle={Math.PI / 3}
                    maxPolarAngle={Math.PI / 1.7}
                    autoRotate={false}
                    autoRotateSpeed={1.5}
                />
            </Canvas>
        </div>
    );
}
