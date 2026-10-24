import {useRef, useMemo, useEffect, useCallback} from 'react';
import {useFBX, Float, ContactShadows, Html} from '@react-three/drei';
import * as THREE from 'three';
import {SkeletonUtils} from 'three-stdlib';
import {useNavigate} from 'react-router-dom';
import {ModularAvatar} from "./AvatarCanvas.tsx";
import type {WorldParticipant} from '../../types/api.ts';
import type {AvatarConfig, AvatarTransform} from '../../types/avatar.ts';

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
    customTransform?: AvatarTransform,
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
    participants: WorldParticipant[];
    onReadinessChange?: (isReady: boolean) => void;
}

export default function FloatyIslandWorld({participants, onReadinessChange}: FloatyIslandWorldProps) {
    useMemo(() => {
        silenceWarnings();
    }, []);

    const navigate = useNavigate();

    // 🌟 Agrégation de la readiness du décor et des avatars (T12B / REV-04 / REV-06)
    const onReadinessChangeRef = useRef(onReadinessChange);
    useEffect(() => {
        onReadinessChangeRef.current = onReadinessChange;
    }, [onReadinessChange]);

    const decorMountedRef = useRef(false);
    const lastReportedReadyRef = useRef<boolean | null>(null);

    // Clés techniques stables pour chaque avatar attendu, incluant l'empreinte de configuration
    const expectedKeys = useMemo(() => {
        return (participants || []).map((p, idx) => {
            const uid = p.user_id ?? p.id ?? `participant-${idx}`;
            const cfg = p.avatar_config || {};
            return `${uid}-${idx}-${JSON.stringify(cfg)}`;
        });
    }, [participants]);

    const readyAvatarsRef = useRef<Map<string, { ready: boolean; meshCount: number; partsCount: number }>>(new Map());

    const checkReadiness = useCallback(() => {
        if (!decorMountedRef.current) {
            if (lastReportedReadyRef.current !== false) {
                lastReportedReadyRef.current = false;
                onReadinessChangeRef.current?.(false);
            }
            return;
        }

        // Un monde vide qualifie son décor explicitement, jamais un avatar absent
        if (!participants || participants.length === 0) {
            if (lastReportedReadyRef.current !== true) {
                lastReportedReadyRef.current = true;
                onReadinessChangeRef.current?.(true);
            }
            return;
        }

        // Variantes peuplées : exigent au moins un mesh animé et toutes les pièces configurées
        let allReady = true;
        let totalMeshes = 0;

        for (const key of expectedKeys) {
            const status = readyAvatarsRef.current.get(key);
            if (!status || !status.ready || status.meshCount <= 0 || status.partsCount <= 0) {
                allReady = false;
                break;
            }
            totalMeshes += status.meshCount;
        }

        const isReady = allReady && totalMeshes > 0;
        if (lastReportedReadyRef.current !== isReady) {
            lastReportedReadyRef.current = isReady;
            onReadinessChangeRef.current?.(isReady);
        }
    }, [participants, expectedKeys]);

    // Invalidation et nettoyage des clés lors d'un changement de participants ou de configuration
    useEffect(() => {
        const currentKeySet = new Set(expectedKeys);
        for (const key of readyAvatarsRef.current.keys()) {
            if (!currentKeySet.has(key)) {
                readyAvatarsRef.current.delete(key);
            }
        }
        checkReadiness();
    }, [expectedKeys, checkReadiness]);

    useEffect(() => {
        decorMountedRef.current = true;
        checkReadiness();
        return () => {
            decorMountedRef.current = false;
            lastReportedReadyRef.current = null;
            onReadinessChangeRef.current?.(false);
        };
    }, [checkReadiness]);

    const handleAvatarReadinessChange = useCallback((key: string, isReady: boolean, details?: { parts: string[]; meshCount: number }) => {
        if (isReady && details) {
            readyAvatarsRef.current.set(key, {
                ready: true,
                meshCount: details.meshCount,
                partsCount: details.parts.length,
            });
        } else {
            readyAvatarsRef.current.set(key, {
                ready: false,
                meshCount: 0,
                partsCount: 0,
            });
        }
        checkReadiness();
    }, [checkReadiness]);

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
            {participants.map((participant, index) => {
                const config: AvatarConfig = participant.avatar_config || {};
                const avatarKey = expectedKeys[index];

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
                                <ModularAvatar
                                    config={config}
                                    onReadinessChange={(isReady, details) => handleAvatarReadinessChange(avatarKey, isReady, details)}
                                />
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