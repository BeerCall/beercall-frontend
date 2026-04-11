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

// --- CHARGEUR DE PARTIE 3D (Ton bar et tes avatars) ---
function ModelPart({path, customTransform, isBar = false}: { path: string, customTransform?: any, isBar?: boolean }) {
    const fbx = useFBX(path);

    const clonedFbx = useMemo(() => {
        const clone = isBar ? fbx.clone() : SkeletonUtils.clone(fbx);

        clone.traverse((child: any) => {
            if (child.isMesh) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];

                materials.forEach((mat: any) => {
                    if (mat) {
                        // 🚀 2. LE FIX DES AVATARS BLANCS :
                        // On ne force le blanc QUE sur le bar (isBar), pour ne pas repeindre les avatars !
                        if (isBar && mat.color && mat.map) {
                            mat.color.set(0xffffff);
                        }

                        // 🚀 3. LA CORRECTION DES COULEURS FADES
                        if (mat.map) {
                            // S'adapte à toutes les versions de Three.js sans erreur TypeScript
                            if (THREE.SRGBColorSpace) {
                                mat.map.colorSpace = THREE.SRGBColorSpace;
                            } else {
                                mat.map.encoding = 3001; // Code de sRGBEncoding
                            }
                        }

                        // 🚀 4. RETIRER L'EFFET PLASTIQUE
                        if (mat.shininess !== undefined) mat.shininess = 0;
                        if (mat.specular) mat.specular.set(0x000000);
                        if (mat.roughness !== undefined) mat.roughness = 1;
                        if (mat.metalness !== undefined) mat.metalness = 0;

                        mat.needsUpdate = true;
                    }
                });
            }
        });
        return clone;
    }, [fbx, isBar]);

    return (
        <primitive
            object={clonedFbx}
            position={customTransform?.position || [0, 0, 0]}
            scale={customTransform?.scale || [1, 1, 1]}
            rotation={customTransform?.rotation || [0, 0, 0]}
        />
    );
}

// 🎛️ TES VALEURS PARFAITES (Reprise du CONFIG global)
const GLOBAL_CONFIG = {
    scale: .25,
    cameraZ: 450,
    cameraTargetY: 80,
    htmlY: 65
};


interface BarWorldProps {
    participants: any[];
}

// 1. AJOUTE CE NOUVEAU BLOC DE RÉGLAGE EXCLUSIF AU BAR
const BAR_SETTINGS = {
    scale: .1,
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number]
};

// 🎯 PLACEMENT DYNAMIQUE ILLIMITÉ
const getDynamicPlacement = (index: number, totalParticipants: number) => {
    const centerX = 0;
    const centerZ = 0;
    const baseY = 5; // La hauteur du sol du bar
    const radius = Math.max(40, totalParticipants * 15); // S'agrandit s'il y a trop de monde
    const angle = (index / totalParticipants) * Math.PI * 2;
    const x = centerX + Math.cos(angle) * radius;
    const z = centerZ + Math.sin(angle) * radius;
    const rotationY = -angle + Math.PI / 2; // Oriente l'avatar vers le centre

    return {position: [x, baseY, z] as [number, number, number], rotationY};
};

export default function BarWorld({participants}: BarWorldProps) {
    useMemo(() => {
        silenceWarnings();
    }, []);

    const navigate = useNavigate();

    return (
        <group position={[0, 0, 0]}>

            {/* 🌟 1. APPLIQUE LES RÉGLAGES AU BAR 🌟 */}
            <group
                position={BAR_SETTINGS.position}
                scale={[BAR_SETTINGS.scale, BAR_SETTINGS.scale, BAR_SETTINGS.scale]}
                rotation={BAR_SETTINGS.rotation}
            >
                <ModelPart path="/models/Bar.fbx" isBar={true}/>
            </group>

            {/* 2. LES AVATARS DES SOLDATS, PLACÉS EN CERCLE */}
            {participants.map((participant: any, index: number) => {
                const config = participant.avatar_config || {};

                // 🚀 On utilise la fonction magique ici !
                const {position, rotationY} = getDynamicPlacement(index, participants.length);

                return (
                    <group
                        key={`${participant.user_id}-${index}`}
                        position={position}
                        rotation={[0, rotationY, 0]}
                        onClick={(e) => {
                            e.stopPropagation(); // Empêche le clic de traverser l'avatar
                            document.body.style.cursor = 'auto'; // Reset le curseur
                            navigate(`/profile/${participant.user_id}`); // Redirection
                        }}
                        onPointerOver={(e) => {
                            e.stopPropagation();
                            document.body.style.cursor = 'pointer'; // Affiche la main au survol
                        }}
                        onPointerOut={() => {
                            document.body.style.cursor = 'auto';
                        }}
                    >

                        {/* L'AVATAR 3D À LA BONNE ÉCHELLE */}
                        <group scale={[GLOBAL_CONFIG.scale, GLOBAL_CONFIG.scale, GLOBAL_CONFIG.scale]}>
                            <Float speed={1} rotationIntensity={0.02} floatIntensity={0.02}>
                                <ModularAvatar config={config}/>
                            </Float>
                        </group>

                        {/* L'OMBRE GÉANTE */}
                        <ContactShadows position={[0, 0, 0]} opacity={0.6} scale={150} blur={2} far={100}
                                        color="#000000"/>

                        {/* 💬 LA PHOTO DE PREUVE ET LE PSEUDO AU-DESSUS DE LA TÊTE */}
                        <Html position={[0, GLOBAL_CONFIG.htmlY + 25, 0]} center zIndexRange={[100, 0]}>
                            <div className="flex flex-col items-center pointer-events-none">

                                {/* 📸 LA BULLE PHOTO (S'il y en a une) */}
                                {participant.proof_photo_url && (
                                    <div
                                        className="mb-2 p-1.5 bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/50 transform rotate-3 hover:rotate-0 transition-transform origin-bottom">
                                        <div
                                            className="w-16 h-20 relative rounded-xl overflow-hidden bg-gray-900 shadow-inner">
                                            <img
                                                src={participant.proof_photo_url}
                                                alt={`Preuve de ${participant.username}`}
                                                className="w-full h-full object-cover"
                                            />
                                            {/* Petit badge "PREUVE" par-dessus la photo */}
                                            <div className="absolute bottom-1 left-0 right-0 flex justify-center">
                                                <span
                                                    className="bg-black/60 backdrop-blur-md text-white text-[8px] font-black px-2 py-0.5 rounded-full tracking-widest uppercase border border-white/20">
                                                    Preuve
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* 🏷️ LE PSEUDO */}
                                <div
                                    className="bg-amber-500 text-white px-3 py-1.5 rounded-xl shadow-xl border-2 border-amber-400 text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
                                    {participant.username || "SQUAD MEMBER"}
                                </div>
                            </div>
                        </Html>
                    </group>
                );
            })}
        </group>
    );
}