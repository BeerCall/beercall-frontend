import {useMemo} from 'react';
import {useFBX, Float, ContactShadows, Html} from '@react-three/drei';
import * as THREE from 'three';
import {SkeletonUtils} from 'three-stdlib';
import {useNavigate} from 'react-router-dom';
import {MODELS_URL} from "../../lib/api.ts";

// --- FILTRE ANTI-WARNINGS ---
const silenceWarnings = () => {
    const originalWarn = console.warn;
    console.warn = (...args) => {
        const msg = args.join(' ');
        if (msg.includes('THREE.') || msg.includes('X4122') || msg.includes('skinning weights')) return;
        originalWarn(...args);
    };
};

function ModelPart({path, customTransform, isEnvironment = false}: {
    path: string,
    customTransform?: any,
    isEnvironment?: boolean
}) {
    const fbx = useFBX(path);

    const clonedFbx = useMemo(() => {
        const clone = isEnvironment ? fbx.clone() : SkeletonUtils.clone(fbx);

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
    }, [fbx, isEnvironment]);

    return (
        <primitive
            object={clonedFbx}
            position={customTransform?.position || [0, 0, 0]}
            scale={customTransform?.scale || [1, 1, 1]}
            rotation={customTransform?.rotation || [0, 0, 0]}
        />
    );
}

// 🎛️ CONFIG GLOBALE DES AVATARS
const GLOBAL_CONFIG = {
    scale: 0.1,
    htmlY: 30
};

// 🏊 RÉGLAGES DU DÉCOR ILE
const FLOATY_ISLAND_SETTINGS = {
    scale: 500,
    position: [0, 100, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number]
};

// 📍 PLACEMENT DES LÂCHES AUTOUR/DANS L'ILE
const UX_SPOTS = [
    {position: [-25, 90, 70] as [number, number, number], rotationY: -Math.PI / 4},  // Joueur 1
    {position: [-40, 90, -40] as [number, number, number], rotationY: (3 * Math.PI) / 4}, // Joueur 2
    {position: [-130, 85, 10] as [number, number, number], rotationY: Math.PI / 4},   // Joueur 3
    {position: [40, 100, -40] as [number, number, number], rotationY: -(3 * Math.PI) / 4}  // Joueur 4
];

interface FloatyIslandWorldProps {
    participants: any[];
}

export default function FloatyIslandWorld({participants}: FloatyIslandWorldProps) {
    useMemo(() => {
        silenceWarnings();
    }, []);

    const navigate = useNavigate();

    return (
        <group position={[0, 0, 0]}>

            {/* 🌟 LE DÉCOR : L'ILE 🌟 */}
            <group
                position={FLOATY_ISLAND_SETTINGS.position}
                scale={[FLOATY_ISLAND_SETTINGS.scale, FLOATY_ISLAND_SETTINGS.scale, FLOATY_ISLAND_SETTINGS.scale]}
                rotation={FLOATY_ISLAND_SETTINGS.rotation}
            >
                <ModelPart path="/models/Floaty_Island.fbx" isEnvironment={true}/>
            </group>

            {/* LES AVATARS DES ABSENTS */}
            {participants.map((participant: any, index: number) => {
                const config = participant.avatar_config || {};
                const spot = UX_SPOTS[index] || UX_SPOTS[UX_SPOTS.length - 1];

                return (
                    <group
                        key={`${participant.user_id}-${index}`}
                        position={spot.position}
                        rotation={[0, spot.rotationY, 0]}
                        onClick={(e) => {
                            e.stopPropagation();
                            document.body.style.cursor = 'auto';
                            navigate(`/profile/${participant.user_id}`);
                        }}
                        onPointerOver={(e) => {
                            e.stopPropagation();
                            document.body.style.cursor = 'pointer';
                        }}
                        onPointerOut={() => {
                            document.body.style.cursor = 'auto';
                        }}
                    >
                        {/* L'AVATAR AVEC UNE FLottaison PLUS FORTE */}
                        <group scale={[GLOBAL_CONFIG.scale, GLOBAL_CONFIG.scale, GLOBAL_CONFIG.scale]}>
                            <Float speed={2.5} rotationIntensity={0.05} floatIntensity={0.2}>
                                {config.head && config.head !== 'none' &&
                                    <ModelPart path={`${MODELS_URL}/${config.head}.fbx`}/>}
                                {config.body && config.body !== 'none' &&
                                    <ModelPart path={`${MODELS_URL}/${config.body}.fbx`}/>}
                                {config.legs && config.legs !== 'none' &&
                                    <ModelPart path={`${MODELS_URL}/${config.legs}.fbx`}/>}
                                {config.feet && config.feet !== 'none' &&
                                    <ModelPart path={`${MODELS_URL}/${config.feet}.fbx`}/>}
                            </Float>
                        </group>

                        <ContactShadows position={[0, 0, 0]} opacity={0.6} scale={150} blur={2} far={100}
                                        color="#000000"/>

                        <Html position={[0, GLOBAL_CONFIG.htmlY, 0]} center>
                            <div
                                className="bg-amber-500 text-white px-4 py-2 rounded-xl shadow-xl border-2 border-amber-400 text-xs font-black uppercase tracking-widest whitespace-nowrap pointer-events-none">
                                {participant.username || "SQUAD MEMBER"}
                            </div>
                        </Html>

                    </group>
                );
            })}
        </group>
    );
}