import {Suspense, useMemo, useEffect, useRef} from 'react';
import {Canvas} from '@react-three/fiber';
import {
    OrbitControls,
    ContactShadows,
    Float,
    Environment,
    useFBX,
    Html,
    useProgress,
    useAnimations
} from '@react-three/drei';
import * as THREE from 'three';
import {SkeletonUtils} from 'three-stdlib';
import {MODELS_URL} from "../../lib/api.ts";

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
const CUSTOM_ITEMS_CONFIG: Record<string, {
    position?: [number, number, number],
    scale?: [number, number, number],
    rotation?: [number, number, number]
}> = {
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
function AvatarPart({path, customTransform, animations, currentAnim}: {
    path: string,
    customTransform?: any,
    animations?: THREE.AnimationClip[],
    currentAnim?: string
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
        if (currentAnim && actions[currentAnim]) {
            actions[currentAnim].reset().fadeIn(0.2).play(); // Fondu rapide pour plus de réactivité
        }
        return () => {
            if (currentAnim && actions[currentAnim]) {
                actions[currentAnim].fadeOut(0.2);
            }
        };
    }, [currentAnim, actions]);

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

function ModularAvatar({config, onAnimationsLoaded}: {
    config: any,
    onAnimationsLoaded?: (animations: string[]) => void
}) {
    const accessoryTransform = config.accessory ? CUSTOM_ITEMS_CONFIG[config.accessory] : undefined;

    // 1. On charge l'animation globale depuis ton backend
    const animFbx = useFBX(`${MODELS_URL}/Animations.fbx`);
    const targetAnimation = config.animation || "Idle";

    // 2. On extrait les noms des animations pour le Vestiaire
    useEffect(() => {
        if (onAnimationsLoaded && animFbx.animations) {
            const names = animFbx.animations.map(anim => anim.name);
            onAnimationsLoaded(names);
        }
    }, [animFbx, onAnimationsLoaded]);

    return (
        <group position={[0, 0, 0]} scale={[CONFIG.scale, CONFIG.scale, CONFIG.scale]}>
            <Float speed={1.5} rotationIntensity={0.05} floatIntensity={0.05}>

                {/* 🚀 LE SECRET EST ICI : key={config.xxx} force React à détruire et recréer la pièce au changement, ce qui relance le moteur d'animation ! */}
                {config.head && config.head !== 'none' &&
                    <AvatarPart key={`head-${config.head}`} path={`${MODELS_URL}/${config.head}.fbx`}
                                animations={animFbx.animations} currentAnim={targetAnimation}/>}

                {config.body && config.body !== 'none' &&
                    <AvatarPart key={`body-${config.body}`} path={`${MODELS_URL}/${config.body}.fbx`}
                                animations={animFbx.animations} currentAnim={targetAnimation}/>}

                {config.legs && config.legs !== 'none' &&
                    <AvatarPart key={`legs-${config.legs}`} path={`${MODELS_URL}/${config.legs}.fbx`}
                                animations={animFbx.animations} currentAnim={targetAnimation}/>}

                {config.feet && config.feet !== 'none' &&
                    <AvatarPart key={`feet-${config.feet}`} path={`${MODELS_URL}/${config.feet}.fbx`}
                                animations={animFbx.animations} currentAnim={targetAnimation}/>}

                {config.accessory && config.accessory !== 'none' && (
                    <AvatarPart
                        key={`acc-${config.accessory}`}
                        path={`${MODELS_URL}/${config.accessory}.fbx`}
                        customTransform={accessoryTransform}
                        animations={animFbx.animations}
                        currentAnim={targetAnimation}
                    />
                )}
            </Float>
        </group>
    );
}

interface AvatarCanvasProps {
    config: any;
    disableZoom?: boolean;
    disablePan?: boolean;
    onAnimationsLoaded?: (animations: string[]) => void;
}

export default function AvatarCanvas({
                                         config,
                                         disableZoom = false,
                                         disablePan = false,
                                         onAnimationsLoaded
                                     }: AvatarCanvasProps) {
    useEffect(() => {
        silenceWarnings();
    }, []);

    // 🚀 PRÉCHARGEMENT MASSIF
    useEffect(() => {
        useFBX.preload(`${MODELS_URL}/Animations.fbx`);

        if (config) {
            if (config.head && config.head !== 'none') useFBX.preload(`${MODELS_URL}/${config.head}.fbx`);
            if (config.body && config.body !== 'none') useFBX.preload(`${MODELS_URL}/${config.body}.fbx`);
            if (config.legs && config.legs !== 'none') useFBX.preload(`${MODELS_URL}/${config.legs}.fbx`);
            if (config.feet && config.feet !== 'none') useFBX.preload(`${MODELS_URL}/${config.feet}.fbx`);
            if (config.accessory && config.accessory !== 'none') useFBX.preload(`${MODELS_URL}/${config.accessory}.fbx`);
        }
    }, [config]);

    return (
        <div className="w-full h-full relative">
            <Canvas camera={{position: [0, CONFIG.cameraTargetY, CONFIG.cameraZ], fov: 45}} dpr={[1, 2]}
                    className="z-10 relative">
                <ambientLight intensity={1.5}/>
                <directionalLight position={[10, 10, 10]} intensity={2.5}/>
                <directionalLight position={[-10, 10, -10]} intensity={1}/>

                <Suspense fallback={<CanvasLoader/>}>
                    <ModularAvatar config={config} onAnimationsLoaded={onAnimationsLoaded}/>
                    <ContactShadows position={[0, 0, 0]} opacity={0.6} scale={200} blur={2} far={200} color="#000000"/>
                    <Environment preset="city"/>
                </Suspense>

                <OrbitControls
                    enableZoom={!disableZoom}
                    enablePan={!disablePan}
                    target={[0, CONFIG.cameraTargetY, 0]}
                    minPolarAngle={Math.PI / 3}
                    maxPolarAngle={Math.PI / 1.7}
                    autoRotate={false}
                    autoRotateSpeed={1.5}
                />
            </Canvas>
        </div>
    );
}