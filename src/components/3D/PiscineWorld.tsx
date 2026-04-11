import {useMemo} from 'react';
import {useFBX, Float, ContactShadows, Html} from '@react-three/drei';
import * as THREE from 'three';
import {SkeletonUtils} from 'three-stdlib';
import {useNavigate} from 'react-router-dom';
import {ModularAvatar} from "./AvatarCanvas.tsx";

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
    scale: 0.25,
    htmlY: 60
};

// 🏊 RÉGLAGES DU DÉCOR PISCINE
const PISCINE_SETTINGS = {
    scale: 7.5,
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number]
};

// 🎯 PLACEMENT DYNAMIQUE ILLIMITÉ
const getDynamicPlacement = (index: number, totalParticipants: number) => {
    const centerX = 0;
    const centerZ = 0;
    const baseY = 50; // La hauteur du sol de la piscine
    const radius = Math.max(50, totalParticipants * 15);
    const angle = (index / totalParticipants) * Math.PI * 2;
    const x = centerX + Math.cos(angle) * radius;
    const z = centerZ + Math.sin(angle) * radius;
    const rotationY = -angle + Math.PI / 2;

    return {position: [x, baseY, z] as [number, number, number], rotationY};
};

interface PiscineWorldProps {
    participants: any[];
}

export default function PiscineWorld({participants}: PiscineWorldProps) {
    useMemo(() => {
        silenceWarnings();
    }, []);

    const navigate = useNavigate();

    return (
        <group position={[0, 0, 0]}>

            {/* 🌟 LE DÉCOR : LA PISCINE 🌟 */}
            <group
                position={PISCINE_SETTINGS.position}
                scale={[PISCINE_SETTINGS.scale, PISCINE_SETTINGS.scale, PISCINE_SETTINGS.scale]}
                rotation={PISCINE_SETTINGS.rotation}
            >
                <ModelPart path="/models/Swimming_pool.fbx" isEnvironment={true}/>
            </group>

            {/* LES AVATARS PLACÉS EN CERCLE */}
            {participants.map((participant: any, index: number) => {
                const config = participant.avatar_config || {};

                // 🚀 On calcule la position dynamiquement
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
                                <ModularAvatar config={config} />
                            </Float>
                        </group>

                        <ContactShadows position={[0, 0, 0]} opacity={0.6} scale={150} blur={2} far={100}
                                        color="#000000"/>

                        {/* 💬 LA BULLE D'EXCUSE */}
                        {participant.excuse && (
                            <Html position={[0, GLOBAL_CONFIG.htmlY + 10, 0]} center>
                                <div
                                    className="bg-white/95 backdrop-blur px-4 py-2 rounded-2xl shadow-xl text-xs font-black text-cyan-600 whitespace-nowrap relative animate-in zoom-in duration-500 delay-300 border-2 border-cyan-100 pointer-events-none">
                                    {participant.excuse}
                                    <div
                                        className="absolute -bottom-2 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-white/95"/>
                                </div>
                                {/* 🏷️ LE PSEUDO */}
                                <div
                                    className="bg-amber-500 text-white px-3 py-1.5 rounded-xl shadow-xl border-2 border-amber-400 text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
                                    {participant.username || "SQUAD MEMBER"}
                                </div>
                            </Html>
                        )}
                    </group>
                );
            })}
        </group>
    );
}