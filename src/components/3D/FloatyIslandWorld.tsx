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

// 🎯 PLACEMENT DYNAMIQUE ILLIMITÉ
const getDynamicPlacement = (index: number, totalParticipants: number) => {
    const centerX = -30; // On décale un peu le centre pour matcher l'île
    const centerZ = 0;
    const baseY = 95; // 🚀 Très important : l'île flotte à 95 de hauteur !
    const radius = Math.max(80, totalParticipants * 20); // Rayon plus grand
    const angle = (index / totalParticipants) * Math.PI * 2;
    const x = centerX + Math.cos(angle) * radius;
    const z = centerZ + Math.sin(angle) * radius;
    const rotationY = -angle + Math.PI / 2;

    return {position: [x, baseY, z] as [number, number, number], rotationY};
};

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

            {/* LES AVATARS PLACÉS EN CERCLE */}
            {participants.map((participant: any, index: number) => {
                const config = participant.avatar_config || {};

                // 🚀 Fonction dynamique
                const {position, rotationY} = getDynamicPlacement(index, participants.length);

                return (
                    <group
                        key={`${participant.user_id}-${index}`}
                        position={position}
                        rotation={[0, rotationY, 0]}
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