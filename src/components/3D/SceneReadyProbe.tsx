import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { recordSceneSignal, type SceneSignalKind } from '../../lib/sceneMetrics';

/**
 * LIMITATION TECHNIQUE IMPORTANTE (Proxy de soumission vs Présentation physique) :
 *
 * SceneReadyProbe capture la fin de soumission de la frame via useFrame de React-Three-Fiber.
 * Ce signal certifie que les draw calls correspondants ont été émis vers le contexte WebGL.
 * Il constitue un proxy logiciel de soumission de frame, et NON une preuve physique de
 * présentation de photons sur la dalle d'affichage.
 */

export interface SceneReadyProbeProps {
    kind: 'avatar' | 'world';
    id?: string;
    view?: string;
    ready?: boolean;
    expectedParts?: string[];
    onFrameSubmitted?: (metrics: { timestamp: number; frame: number; calls: number }) => void;
}

export function SceneReadyProbe({
    kind,
    id,
    view,
    ready = true,
    expectedParts,
    onFrameSubmitted,
}: SceneReadyProbeProps) {
    const armedRef = useRef(false);
    const submittedRef = useRef(false);

    useEffect(() => {
        // Le probe n'est armé que si les conditions de readiness sont remplies :
        // Pour un avatar : au moins une pièce configurée non-none et action prête.
        // Si expectedParts est spécifié et vide, le probe ne s'arme jamais.
        if (expectedParts && expectedParts.length === 0) {
            armedRef.current = false;
            return;
        }

        if (ready) {
            armedRef.current = true;
        } else {
            armedRef.current = false;
            submittedRef.current = false;
        }
    }, [ready, expectedParts]);

    // Nettoyage au démontage
    useEffect(() => {
        return () => {
            armedRef.current = false;
            submittedRef.current = false;
        };
    }, []);

    useFrame((state) => {
        if (!armedRef.current || submittedRef.current) return;

        submittedRef.current = true;

        const calls = state.gl?.info?.render?.calls ?? 0;
        const frame = state.gl?.info?.render?.frame ?? 0;
        const timestamp = typeof performance !== 'undefined' ? performance.now() : Date.now();

        const signalKind: SceneSignalKind =
            kind === 'avatar' ? 'avatarFrameSubmitted' : 'worldFrameSubmitted';

        recordSceneSignal(signalKind, {
            instanceId: id,
            view,
            timestamp,
            drawCalls: calls,
            frames: frame,
        });

        onFrameSubmitted?.({ timestamp, frame, calls });
    });

    return null;
}

export default SceneReadyProbe;
