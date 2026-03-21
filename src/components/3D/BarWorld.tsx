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

// --- CHARGEUR DE PARTIE 3D (Ton bar et tes avatars) ---
function ModelPart({path, customTransform, isBar = false}: { path: string, customTransform?: any, isBar?: boolean }) {
    const fbx = useFBX(path);

    const clonedFbx = useMemo(() => {
        // Pour les avatars, on utilise SkeletonUtils, pour le bar, un clone simple suffit
        const clone = isBar ? fbx.clone() : SkeletonUtils.clone(fbx);

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

// 🍺 LE RECTIFICATEUR DE BIÈRE
const BEER_CONFIG = {position: [40, 85, 20], scale: [5, 5, 5], rotation: [0, 0, 0]};

interface BarWorldProps {
    participants: any[];
}

// 1. AJOUTE CE NOUVEAU BLOC DE RÉGLAGE EXCLUSIF AU BAR
const BAR_SETTINGS = {
    scale: 10,
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number]
};

// 📍 LE CALAGE UX PRÉCIS
const UX_SPOTS = [
    {position: [30, 5, -20] as [number, number, number], rotationY: -Math.PI / 4},  // Joueur 1
    {position: [-30, 5, 20] as [number, number, number], rotationY: Math.PI / 4},   // Joueur 2
    {position: [0, 5, 40] as [number, number, number], rotationY: 0},               // Joueur 3
    {position: [-50, 5, -40] as [number, number, number], rotationY: Math.PI / 2}   // Joueur 4
];

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

            {/* 2. LES AVATARS DES SOLDATS, CALÉS SUR LES SPOTS */}
            {participants.map((participant: any, index: number) => {
                const config = participant.avatar_config || {};
                const spot = UX_SPOTS[index] || UX_SPOTS[UX_SPOTS.length - 1];

                return (
                    <group
                        key={`${participant.user_id}-${index}`}
                        position={spot.position}
                        rotation={[0, spot.rotationY, 0]}
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
                                {config.head && config.head !== 'none' &&
                                    <ModelPart path={`${MODELS_URL}/${config.head}.fbx`}/>}
                                {config.body && config.body !== 'none' &&
                                    <ModelPart path={`${MODELS_URL}/${config.body}.fbx`}/>}
                                {config.legs && config.legs !== 'none' &&
                                    <ModelPart path={`${MODELS_URL}/${config.legs}.fbx`}/>}
                                {config.feet && config.feet !== 'none' &&
                                    <ModelPart path={`${MODELS_URL}/${config.feet}.fbx`}/>}
                                {config.accessory === 'Beer_Men' && (
                                    <ModelPart path="/models/Beer_Men.fbx" customTransform={BEER_CONFIG}/>
                                )}
                            </Float>
                        </group>

                        {/* L'OMBRE GÉANTE */}
                        <ContactShadows position={[0, 0, 0]} opacity={0.6} scale={150} blur={2} far={100}
                                        color="#000000"/>

                        {/* 💬 LE PSEUDO AU-DESSUS DE LA TÊTE */}
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