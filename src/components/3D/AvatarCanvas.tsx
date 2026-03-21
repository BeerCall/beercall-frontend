import {Suspense, useMemo, useEffect} from 'react';
import {Canvas} from '@react-three/fiber';
import {OrbitControls, ContactShadows, Float, Environment, useFBX, Html, useProgress} from '@react-three/drei';
import * as THREE from 'three';
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

// J'ai ajouté la prop "customTransform"
function AvatarPart({path, customTransform}: { path: string, customTransform?: any }) {
    const fbx = useFBX(path);

    const clonedFbx = useMemo(() => {
        const clone = fbx.clone();
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

    // On applique le décalage sur l'objet primitif
    return (
        <primitive
            object={clonedFbx}
            position={customTransform?.position || [0, 0, 0]}
            scale={customTransform?.scale || [1, 1, 1]}
            rotation={customTransform?.rotation || [0, 0, 0]}
        />
    );
}

function ModularAvatar({config}: { config: any }) {
    // On vérifie si l'accessoire équipé possède des réglages personnalisés
    const accessoryTransform = config.accessory ? CUSTOM_ITEMS_CONFIG[config.accessory] : undefined;

    return (
        <group position={[0, 0, 0]} scale={[CONFIG.scale, CONFIG.scale, CONFIG.scale]}>
            <Float speed={1.5} rotationIntensity={0.05} floatIntensity={0.05}>
                {config.head && config.head !== 'none' && <AvatarPart path={`${MODELS_URL}/${config.head}.fbx`}/>}
                {config.body && config.body !== 'none' && <AvatarPart path={`${MODELS_URL}/${config.body}.fbx`}/>}
                {config.legs && config.legs !== 'none' && <AvatarPart path={`${MODELS_URL}/${config.legs}.fbx`}/>}
                {config.feet && config.feet !== 'none' && <AvatarPart path={`${MODELS_URL}/${config.feet}.fbx`}/>}

                {/* L'ACCESSOIRE AVEC SES POSITIONS CORRIGÉES */}
                {config.accessory && config.accessory !== 'none' && (
                    <AvatarPart
                        path={`${MODELS_URL}/${config.accessory}.fbx`}
                        customTransform={accessoryTransform}
                    />
                )}
            </Float>
        </group>
    );
}

export default function AvatarCanvas({config}: { config: any }) {
    useEffect(() => {
        silenceWarnings();
    }, []);

    return (
        <div className="w-full h-full relative">
            <Canvas camera={{position: [0, CONFIG.cameraTargetY, CONFIG.cameraZ], fov: 45}} dpr={[1, 2]}
                    className="z-10 relative">
                <ambientLight intensity={1.5}/>
                <directionalLight position={[10, 10, 10]} intensity={2.5}/>
                <directionalLight position={[-10, 10, -10]} intensity={1}/>

                <Suspense fallback={<CanvasLoader/>}>
                    <ModularAvatar config={config}/>
                    <ContactShadows position={[0, 0, 0]} opacity={0.6} scale={200} blur={2} far={200} color="#000000"/>
                    <Environment preset="city"/>
                </Suspense>

                <OrbitControls
                    enableZoom={true}
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