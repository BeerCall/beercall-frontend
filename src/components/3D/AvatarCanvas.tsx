import {Suspense, useMemo, useEffect, useRef, useState, useCallback} from 'react';
import {Canvas} from '@react-three/fiber';
import {
    OrbitControls,
    ContactShadows,
    Environment,
    useFBX,
    Html,
    useProgress,
    useAnimations
} from '@react-three/drei';
import * as THREE from 'three';
import {SkeletonUtils} from 'three-stdlib';
import {MODELS_URL} from "../../lib/api.ts";
import type {AvatarConfig, AvatarTransform} from "../../types/avatar.ts";
import SceneReadyProbe from './SceneReadyProbe';

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

        // On utilise SkeletonUtils pour cloner correctement les os et maillages
        const clone = SkeletonUtils.clone(fbx);

        clone.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                materials.forEach((mat) => {
                    if (mat) mat.needsUpdate = true;
                });
            }
        });
        return clone;
    }, [fbx]);

    // On crée un AnimationMixer isolé pour CE vêtement
    const {actions} = useAnimations(animations || [], groupRef);

    useEffect(() => {
        let isActionPlaying = false;
        if (currentAnim && actions[currentAnim]) {
            actions[currentAnim].reset().fadeIn(0.2).play(); // Fondu rapide pour plus de réactivité
            isActionPlaying = true;
        } else if (!animations || animations.length === 0 || !currentAnim) {
            isActionPlaying = true;
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

        return () => {
            if (currentAnim && actions[currentAnim]) {
                actions[currentAnim].fadeOut(0.2);
            }
            if (partKey && onPartUnmount) {
                onPartUnmount(partKey);
            }
        };
    }, [currentAnim, actions, clonedFbx, partKey, onPartReady, onPartUnmount, animations]);

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

    const animFbx = useFBX(`${MODELS_URL}/Animations.fbx`);
    const targetAnimation = config.animation || "Idle";

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

    const checkReadiness = useCallback(() => {
        if (!onReadinessChange) return;
        if (expectedParts.length === 0) {
            onReadinessChange(false);
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
        onReadinessChange(isReady, isReady ? { parts: expectedParts, meshCount: totalMeshes } : undefined);
    }, [expectedParts, onReadinessChange]);

    const handlePartReady = useCallback((partKey: string, meshCount: number, actionPlaying: boolean) => {
        readyPartsRef.current.set(partKey, { meshCount, actionPlaying });
        checkReadiness();
    }, [checkReadiness]);

    const handlePartUnmount = useCallback((partKey: string) => {
        readyPartsRef.current.delete(partKey);
        checkReadiness();
    }, [checkReadiness]);

    useEffect(() => {
        if (onAnimationsLoaded && animFbx.animations) {
            const names = animFbx.animations.map(anim => anim.name);
            onAnimationsLoaded(names);
        }
    }, [animFbx, onAnimationsLoaded]);

    return (
        <group>
            {/* Le paramètre key force React à recréer la pièce et relancer l'animation */}
            {config.head && config.head !== 'none' &&
                <AvatarPart key={`head-${config.head}`} path={`${MODELS_URL}/${config.head}.fbx`}
                            partKey="head" onPartReady={handlePartReady} onPartUnmount={handlePartUnmount}
                            animations={animFbx.animations} currentAnim={targetAnimation}/>}

            {config.body && config.body !== 'none' &&
                <AvatarPart key={`body-${config.body}`} path={`${MODELS_URL}/${config.body}.fbx`}
                            partKey="body" onPartReady={handlePartReady} onPartUnmount={handlePartUnmount}
                            animations={animFbx.animations} currentAnim={targetAnimation}/>}

            {config.legs && config.legs !== 'none' &&
                <AvatarPart key={`legs-${config.legs}`} path={`${MODELS_URL}/${config.legs}.fbx`}
                            partKey="legs" onPartReady={handlePartReady} onPartUnmount={handlePartUnmount}
                            animations={animFbx.animations} currentAnim={targetAnimation}/>}

            {config.feet && config.feet !== 'none' &&
                <AvatarPart key={`feet-${config.feet}`} path={`${MODELS_URL}/${config.feet}.fbx`}
                            partKey="feet" onPartReady={handlePartReady} onPartUnmount={handlePartUnmount}
                            animations={animFbx.animations} currentAnim={targetAnimation}/>}

            {config.accessory && config.accessory !== 'none' && (
                <AvatarPart
                    key={`acc-${config.accessory}`}
                    path={`${MODELS_URL}/${config.accessory}.fbx`}
                    partKey="accessory"
                    onPartReady={handlePartReady}
                    onPartUnmount={handlePartUnmount}
                    customTransform={accessoryTransform}
                    animations={animFbx.animations}
                    currentAnim={targetAnimation}
                />
            )}
        </group>
    );
}

interface AvatarCanvasProps {
    config: AvatarConfig;
    disableZoom?: boolean;
    disablePan?: boolean;
    onAnimationsLoaded?: (animations: string[]) => void;
    headOnly?: boolean;
    view?: string;
    instanceId?: string;
}

export default function AvatarCanvas({
                                         config,
                                         disableZoom = false,
                                         disablePan = false,
                                         onAnimationsLoaded,
                                         headOnly = false,
                                         view,
                                         instanceId
                                     }: AvatarCanvasProps) {
    useEffect(() => {
        silenceWarnings();
    }, []);

    // 🚀 PRÉCHARGEMENT MASSIF
    useEffect(() => {
        useFBX.preload(`${MODELS_URL}/Animations.fbx`);

        if (config) {
            if (config.head && config.head !== 'none') useFBX.preload(`${MODELS_URL}/${config.head}.fbx`);
            if (!headOnly && config.body && config.body !== 'none') useFBX.preload(`${MODELS_URL}/${config.body}.fbx`);
            if (!headOnly && config.legs && config.legs !== 'none') useFBX.preload(`${MODELS_URL}/${config.legs}.fbx`);
            if (!headOnly && config.feet && config.feet !== 'none') useFBX.preload(`${MODELS_URL}/${config.feet}.fbx`);
            if (!headOnly && config.accessory && config.accessory !== 'none') useFBX.preload(`${MODELS_URL}/${config.accessory}.fbx`);
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
            <Canvas camera={{position: [0, targetY, cameraZ], fov: 45}} dpr={[1, 2]}
                    className="z-10 relative">
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
                    {!headOnly && <ContactShadows position={[0, 0, 0]} opacity={0.6} scale={200} blur={2} far={200} color="#000000"/>}
                </Suspense>

                {/* L'environnement charge de son côté silencieusement */}
                <Suspense fallback={null}>
                    <Environment preset="city"/>
                </Suspense>

                <OrbitControls
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