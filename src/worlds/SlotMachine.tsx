/**
 * 8l — machine à sous 3D du monde Bar, avec son levier animé.
 *
 * Reprise de l'ancien `BarWorld` (corps, écran « JACKPOT / REJOINDRE LA SQUAD »,
 * levier qui s'abaisse) adaptée aux unités du décor Bar actuel. Aucun survol :
 * seule une boîte invisible écoute le clic, et uniquement quand la couche Bar
 * est affichée. Un glissement de caméra au-delà de 8 px ne tire pas le levier.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { CanvasTexture, MathUtils, type Group, type Mesh } from 'three';
import { WORLD_PROBE_ENABLED } from '../perf/worldProbeGate';
import {
    SLOT_LEVER_DOWN_ANGLE,
    SLOT_LEVER_PULL_MS,
    SLOT_MACHINE_POSITION,
    SLOT_MACHINE_ROTATION_Y,
    SLOT_MACHINE_SCALE,
    shouldPullLever,
    slotMachineScreen,
} from './slotMachineRules';
import { registerSlotMachineTarget, unregisterSlotMachineTarget } from './slotMachineProbe';

/** Texture dessinée une fois : écran ambre ou vert, sans texte 3D ni réseau. */
function createScreenTexture(gameInProgress: boolean): CanvasTexture | null {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 160;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const screen = slotMachineScreen(gameInProgress);
    context.fillStyle = screen.color;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    context.lineWidth = 8;
    context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const fontSize = screen.lines.length > 1 ? 40 : 54;
    context.font = `900 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    const lineHeight = fontSize * 1.05;
    const startY = canvas.height / 2 - ((screen.lines.length - 1) * lineHeight) / 2;
    screen.lines.forEach((line, index) => {
        context.fillText(line, canvas.width / 2, startY + index * lineHeight);
    });
    const texture = new CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

/**
 * `active` : couche Bar affichée et modale ouverte. Hors de cet état, aucun
 * gestionnaire n'est branché : R3F ne teste pas la boîte et la machine ne coûte
 * ni raycast ni animation.
 */
const SlotMachine = memo(function SlotMachine({
    active,
    canLaunch,
    gameInProgress,
    locked,
    onPull,
}: {
    active: boolean;
    canLaunch: boolean;
    gameInProgress: boolean;
    locked: boolean;
    onPull: () => void;
}) {
    const leverRef = useRef<Group>(null);
    const hitRef = useRef<Mesh>(null);
    const timer = useRef<number | null>(null);
    const [pulled, setPulled] = useState(false);
    const camera = useThree((state) => state.camera);

    const screenTexture = useMemo(() => createScreenTexture(gameInProgress), [gameInProgress]);
    useEffect(() => () => {
        screenTexture?.dispose();
    }, [screenTexture]);

    useEffect(() => () => {
        if (timer.current !== null) window.clearTimeout(timer.current);
    }, []);

    // Diagnostic uniquement : publie la position écran de la boîte de toucher.
    // `canLaunch` compte : la cible n'existe qu'une fois la machine rendue.
    useEffect(() => {
        if (!WORLD_PROBE_ENABLED || !active || !canLaunch) return;
        const object = hitRef.current;
        if (!object) return;
        registerSlotMachineTarget(object, camera);
        return () => unregisterSlotMachineTarget(object);
    }, [active, canLaunch, camera]);

    useFrame((_, delta) => {
        const lever = leverRef.current;
        if (!lever || !active) return;
        const targetAngle = pulled ? SLOT_LEVER_DOWN_ANGLE : 0;
        lever.rotation.x = MathUtils.lerp(lever.rotation.x, targetAngle, delta * 8);
    });

    if (!canLaunch) return null;

    const handlePull = (event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        if (!shouldPullLever({active, canLaunch, locked, pulled, delta: event.delta})) return;
        setPulled(true);
        timer.current = window.setTimeout(() => {
            timer.current = null;
            setPulled(false);
            onPull();
        }, SLOT_LEVER_PULL_MS);
    };

    return (
        <group
            position={SLOT_MACHINE_POSITION}
            rotation={[0, SLOT_MACHINE_ROTATION_Y, 0]}
            scale={SLOT_MACHINE_SCALE}
        >
            <mesh position={[0, 0.18, 0]}>
                <boxGeometry args={[1.7, 0.36, 0.95]}/>
                <meshStandardMaterial color="#111827" roughness={0.9}/>
            </mesh>
            <mesh position={[0, 1.05, 0]}>
                <boxGeometry args={[1.5, 1.5, 0.85]}/>
                <meshStandardMaterial color="#1f2937" roughness={0.8}/>
            </mesh>
            <mesh position={[0, 1.35, 0.431]}>
                <planeGeometry args={[1.15, 0.7]}/>
                <meshBasicMaterial
                    map={screenTexture ?? undefined}
                    color={screenTexture ? '#ffffff' : slotMachineScreen(gameInProgress).color}
                    toneMapped={false}
                />
            </mesh>
            <mesh position={[0, 1.85, 0.2]}>
                <boxGeometry args={[1.2, 0.16, 0.5]}/>
                <meshStandardMaterial color="#d97706" roughness={0.5}/>
            </mesh>
            <group position={[0.92, 1.15, 0]}>
                <mesh rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[0.12, 0.12, 0.3, 12]}/>
                    <meshStandardMaterial color="#4b5563" metalness={0.8} roughness={0.2}/>
                </mesh>
                <group ref={leverRef}>
                    <mesh position={[0, 0.35, 0]}>
                        <cylinderGeometry args={[0.045, 0.045, 0.7, 10]}/>
                        <meshStandardMaterial color="#d1d5db" metalness={1} roughness={0.1}/>
                    </mesh>
                    <mesh position={[0, 0.78, 0]}>
                        <sphereGeometry args={[0.15, 16, 16]}/>
                        <meshPhysicalMaterial color="#ef4444" roughness={0.1} clearcoat={1}/>
                    </mesh>
                </group>
            </group>
            <mesh
                ref={hitRef}
                position={[0.1, 0.98, 0]}
                visible={false}
                onClick={active ? handlePull : undefined}
            >
                <boxGeometry args={[2.1, 1.95, 1.0]}/>
                <meshBasicMaterial/>
            </mesh>
        </group>
    );
});

export default SlotMachine;
