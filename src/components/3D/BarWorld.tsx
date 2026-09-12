import {useRef, useState, useMemo} from 'react';
import {useFrame} from '@react-three/fiber';
import {useFBX, Float, ContactShadows, Html, Text} from '@react-three/drei';
import * as THREE from 'three';
import {SkeletonUtils} from 'three-stdlib';
import {useNavigate} from 'react-router-dom';
import {ModularAvatar} from "./AvatarCanvas";
import {useGameEngine} from "../../hooks/useGameEngine";
import {useGameUIStore} from '../../store/useGameUIStore';

// --- FILTRE ANTI-WARNINGS ---
const silenceWarnings = () => {
    const originalWarn = console.warn;
    console.warn = (...args) => {
        const msg = args.join(' ');
        if (msg.includes('THREE.') || msg.includes('X4122') || msg.includes('skinning weights')) return;
        originalWarn(...args);
    };
};

// --- CHARGEUR DE PARTIE 3D ---
function ModelPart({path, customTransform, isBar = false}: { path: string, customTransform?: any, isBar?: boolean }) {
    const fbx = useFBX(path);

    const clonedFbx = useMemo(() => {
        const clone = isBar ? fbx.clone() : SkeletonUtils.clone(fbx);
        clone.traverse((child: any) => {
            if (child.isMesh) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach((mat: any) => {
                    if (mat) {
                        if (isBar && mat.color && mat.map) mat.color.set(0xffffff);
                        if (mat.map) {
                            if (THREE.SRGBColorSpace) mat.map.colorSpace = THREE.SRGBColorSpace;
                            else mat.map.encoding = 3001;
                        }
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

// 🎰 NOUVEAU COMPOSANT : LA MACHINE À SOUS INTERACTIVE PROCÉDURALE
const SlotMachine = ({isGameInProgress, onPull, isLocked}: {
    isGameInProgress: boolean,
    onPull: () => void,
    isLocked: boolean
}) => {
    const leverRef = useRef<THREE.Group>(null);
    const [isPulled, setIsPulled] = useState(false);

    const handlePull = (e: any) => {
        e.stopPropagation();
        if (isPulled || isLocked) return;

        setIsPulled(true);

        // On attend 600ms pour laisser le manche s'abaisser physiquement avant de lancer le réseau
        setTimeout(() => {
            onPull();
            setIsPulled(false); // Le manche remonte pour le prochain tour
        }, 600);
    };

    // 🚀 L'animation physique du manche à chaque frame (60 FPS)
    useFrame((_, delta) => {
        if (leverRef.current) {
            // Si tiré, on penche de 70 degrés vers l'avant, sinon on revient à 0
            const targetRotation = isPulled ? Math.PI / 2.5 : 0;
            leverRef.current.rotation.x = THREE.MathUtils.lerp(
                leverRef.current.rotation.x,
                targetRotation,
                delta * 8 // Vitesse d'abaissement
            );
        }
    });

    return (
        <group position={[-50, 25, 50]} scale={[2, 2, 2]}>
            <Float speed={2} rotationIntensity={0.05} floatIntensity={0.5}>

                {/* 1. LE CORPS DE LA MACHINE */}
                <mesh position={[0, 5, 0]}>
                    <boxGeometry args={[8, 10, 6]}/>
                    <meshStandardMaterial color="#1f2937" roughness={0.8}/>
                </mesh>

                {/* 2. L'ÉCRAN LUMINEUX */}
                <mesh position={[0, 6, 3.01]}>
                    <planeGeometry args={[6, 4]}/>
                    {/* Le vert si c'est lancé, l'ambré si c'est nouveau */}
                    <meshBasicMaterial color={isGameInProgress ? "#059669" : "#d97706"}/>
                </mesh>

                {/* 3. LE TEXTE 3D SUR L'ÉCRAN */}
                <Text
                    position={[0, 6, 3.02]}
                    fontSize={isGameInProgress ? 0.9 : 1.2}
                    color="white"
                    anchorX="center"
                    anchorY="middle"
                    fontWeight="bold"
                >
                    {isGameInProgress ? "REJOINDRE\nLA SQUAD" : "JACKPOT"}
                </Text>

                {/* 4. LE GROS MANCHE ARTICULÉ (Cliquable) */}
                <group
                    position={[4.5, 5, 0]}
                    onClick={handlePull}
                    onPointerOver={() => document.body.style.cursor = 'pointer'}
                    onPointerOut={() => document.body.style.cursor = 'auto'}
                >
                    {/* L'axe de rotation (le jointure grise) */}
                    <mesh rotation={[0, 0, Math.PI / 2]}>
                        <cylinderGeometry args={[1, 1, 2, 16]}/>
                        <meshStandardMaterial color="#4b5563" metalness={0.8} roughness={0.2}/>
                    </mesh>

                    {/* Le groupe qui pivote quand on tire */}
                    <group ref={leverRef}>
                        {/* La tige en métal */}
                        <mesh position={[0, 4, 0]}>
                            <cylinderGeometry args={[0.3, 0.3, 8, 16]}/>
                            <meshStandardMaterial color="#d1d5db" metalness={1} roughness={0.1}/>
                        </mesh>
                        {/* La grosse boule rouge */}
                        <mesh position={[0, 8, 0]}>
                            <sphereGeometry args={[1.5, 32, 32]}/>
                            {/* Le 'clearcoat' donne un effet vernis/plastique très satisfaisant */}
                            <meshPhysicalMaterial color="#ef4444" roughness={0.1} clearcoat={1}
                                                  clearcoatRoughness={0.1}/>
                        </mesh>
                    </group>
                </group>

            </Float>
        </group>
    );
};


// 💻 L'ORDINATEUR INTERACTIF PROCÉDURAL (Cliquable → ouvre le chat)
const Computer = ({onClick}: { onClick: () => void }) => {
    const groupRef = useRef<THREE.Group>(null);

    // Léger effet de "scintillement" de l'écran pour attirer l'œil
    useFrame(({clock}) => {
        if (groupRef.current) {
            const mat = groupRef.current.getObjectByName('screen-glow');
            if (mat && (mat as any).material) {
                (mat as any).material.opacity = 0.7 + Math.sin(clock.getElapsedTime() * 2) * 0.2;
            }
        }
    });

    return (
        <group position={[15, 0, 8]} scale={[1, 1, 1]}>
            <Float speed={2} rotationIntensity={0.02} floatIntensity={0.2}>
                <group
                    onClick={(e) => {
                        e.stopPropagation();
                        document.body.style.cursor = 'auto';
                        onClick();
                    }}
                    onPointerOver={(e) => {
                        e.stopPropagation();
                        document.body.style.cursor = 'pointer';
                    }}
                    onPointerOut={() => document.body.style.cursor = 'auto'}
                >
                    {/* 🖥️ LE MONITEUR */}
                    {/* Pied de l'écran */}
                    <mesh position={[0, 4.5, -0.2]} rotation={[0, 0, 0]}>
                        <boxGeometry args={[5, 0.6, 4]}/>
                        <meshStandardMaterial color="#111827" roughness={0.5} metalness={0.4}/>
                    </mesh>
                    {/* Support vertical */}
                    <mesh position={[0, 6, -0.2]}>
                        <boxGeometry args={[0.8, 3, 0.8]}/>
                        <meshStandardMaterial color="#374151" roughness={0.5} metalness={0.4}/>
                    </mesh>
                    {/* Cadre de l'écran */}
                    <mesh position={[0, 8.5, 0]}>
                        <boxGeometry args={[8, 6, 1]}/>
                        <meshStandardMaterial color="#1f2937" roughness={0.6} metalness={0.3}/>
                    </mesh>
                    {/* La vitre lumineuse (l'écran) */}
                    <mesh name="screen-glow" position={[0, 8.5, 0.55]}>
                        <boxGeometry args={[7, 5, 0.1]}/>
                        <meshStandardMaterial color="#7dd3fc" emissive="#38bdf8" emissiveIntensity={1.4}
                                              transparent opacity={0.85}/>
                    </mesh>
                    {/* Pastille Webcam */}
                    <mesh position={[0, 11.6, 0.55]}>
                        <sphereGeometry args={[0.25, 16, 16]}/>
                        <meshStandardMaterial color="#111827" roughness={0.3}/>
                    </mesh>

                    {/* ⌨️ LE CLAVIER */}
                    <mesh position={[0, 3.5, 2]}>
                        <boxGeometry args={[7, 0.5, 2.5]}/>
                        <meshStandardMaterial color="#1f2937" roughness={0.8}/>
                    </mesh>
                    {/* Quelques touches blanches en relief */}
                    {[-2.5, -1.5, -0.5, 0.5, 1.5, 2.5].map((tx) => (
                        <mesh key={tx} position={[tx, 3.85, 2]}>
                            <boxGeometry args={[0.8, 0.15, 0.8]}/>
                            <meshStandardMaterial color="#e5e7eb" roughness={0.6}/>
                        </mesh>
                    ))}

                    {/* 🖱️ LA SOURIS */}
                    <mesh position={[4.2, 3.4, 3.4]}>
                        <sphereGeometry args={[0.8, 20, 16]}/>
                        <meshStandardMaterial color="#374151" roughness={0.4} metalness={0.3}/>
                    </mesh>
                    <mesh position={[4.2, 3.5, 3.4]}>
                        <boxGeometry args={[0.4, 0.2, 0.9]}/>
                        <meshStandardMaterial color="#e5e7eb" roughness={0.5}/>
                    </mesh>
                </group>
            </Float>
        </group>
    );
};

// 🎛️ TES VALEURS PARFAITES
const GLOBAL_CONFIG = {scale: .25, cameraZ: 450, cameraTargetY: 80, htmlY: 65};
const BAR_SETTINGS = {
    scale: .1,
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number]
};

const getDynamicPlacement = (index: number, totalParticipants: number) => {
    const radius = Math.max(40, totalParticipants * 15);
    const angle = (index / totalParticipants) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    return {position: [x, 5, z] as [number, number, number], rotationY: -angle + Math.PI / 2};
};

// 📸 ON AJOUTE onSelectPhoto AUX PARAMÈTRES DU COMPOSANT
export default function BarWorld({aperoId, squadId, participants, isActiveApero, onSelectPhoto}: {
    aperoId: string,
    squadId: string,
    participants: any[],
    isActiveApero: boolean,
    onSelectPhoto: (url: string) => void
}) {
    const {gameState, startGame, isLocked} = useGameEngine(aperoId);
    const openGameScreen = useGameUIStore((state) => state.openGameScreen);

    const handlePullLever = () => {
        startGame();
        openGameScreen(aperoId);
    };

    useMemo(() => silenceWarnings(), []);
    const navigate = useNavigate();

    return (
        <group position={[0, 0, 0]}>
            {/* 🌟 LE BAR */}
            <group position={BAR_SETTINGS.position} scale={[BAR_SETTINGS.scale, BAR_SETTINGS.scale, BAR_SETTINGS.scale]}
                   rotation={BAR_SETTINGS.rotation}>
                <ModelPart path="/models/Bar.fbx" isBar={true}/>
            </group>

            {/* 🎰 LA MACHINE À SOUS EN LÉVITATION AU-DESSUS DU BAR */}
            {/* 🚀 Elle ne s'affiche que si l'apéro est en cours ! */}
            {isActiveApero && (
                <SlotMachine
                    isGameInProgress={!!gameState}
                    onPull={handlePullLever}
                    isLocked={isLocked}
                />
            )}

            {/* 💻 L'ORDINATEUR → OUVRE LE CHAT DE L'APÉRO EN COURS */}
            <Computer onClick={() => navigate(`/squad/${squadId}/beer-call/${aperoId}/chat`)}/>

            {/* 🧍‍♂️ LES AVATARS */}
            {participants.map((participant: any, index: number) => {
                const config = participant.avatar_config || {};
                const {position, rotationY} = getDynamicPlacement(index, participants.length);

                return (
                    <group
                        key={`${participant.user_id}-${index}`}
                        position={position}
                        rotation={[0, rotationY, 0]}
                    >
                        <group
                            onClick={(e) => {
                                e.stopPropagation();
                                document.body.style.cursor = 'auto';
                                navigate(`/profile/${participant.user_id}`);
                            }}
                            onPointerOver={(e) => {
                                e.stopPropagation();
                                document.body.style.cursor = 'pointer';
                            }}
                            onPointerOut={() => document.body.style.cursor = 'auto'}
                        >
                            <group scale={[GLOBAL_CONFIG.scale, GLOBAL_CONFIG.scale, GLOBAL_CONFIG.scale]}>
                                <Float speed={1} rotationIntensity={0.02} floatIntensity={0.02}>
                                    <ModularAvatar config={config}/>
                                </Float>
                            </group>
                        </group>

                        <ContactShadows position={[0, 0, 0]} opacity={0.6} scale={150} blur={2} far={100}
                                        color="#000000"/>

                        <Html position={[0, GLOBAL_CONFIG.htmlY + 25, 0]} center zIndexRange={[100, 0]}>
                            <div className="flex flex-col items-center">
                                {participant.proof_photo_url && (
                                    <div
                                        className="mb-2 p-1.5 bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/50 transform rotate-3 hover:rotate-0 transition-transform origin-bottom cursor-pointer"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            // 📸 L'APPEL VERS LE PARENT
                                            onSelectPhoto(participant.proof_photo_url);
                                        }}
                                    >
                                        <div
                                            className="w-16 h-20 relative rounded-xl overflow-hidden bg-gray-900 shadow-inner">
                                            <img src={participant.proof_photo_url} alt="Preuve"
                                                 className="w-full h-full object-cover"/>
                                            <div className="absolute bottom-1 left-0 right-0 flex justify-center">
                                                <span
                                                    className="bg-black/60 backdrop-blur-md text-white text-[8px] font-black px-2 py-0.5 rounded-full tracking-widest uppercase border border-white/20">Preuve</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
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