import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { recordSceneSignal, registerSceneInstance, unregisterSceneInstance, invalidateSceneInstance, allocateSceneInstanceId, type SceneSignalKind } from '../../lib/sceneMetrics';

/**
 * LIMITATION TECHNIQUE IMPORTANTE (Proxy de soumission vs Présentation physique) :
 *
 * useFrame précède gl.render : le signal est différé à un callback de suivi,
 * après une progression effective du compteur de rendu du même root.
 * Ce signal certifie que les draw calls correspondants ont été émis vers le contexte WebGL.
 * Il constitue un proxy logiciel de soumission de frame, et NON une preuve physique de
 * présentation de photons sur la dalle d'affichage.
 */

export interface SceneReadyProbeProps {
    kind: 'avatar' | 'world';
    id?: string;
    view?: string;
    ready?: boolean;
    active?: boolean;
    expectedParts?: string[];
    onFrameSubmitted?: (metrics: { timestamp: number; frame: number; calls: number }) => void;
}

export function SceneReadyProbe({
    kind,
    id,
    view,
    ready = true,
    active = true,
    expectedParts,
    onFrameSubmitted,
}: SceneReadyProbeProps) {
    const armedRef = useRef(false);
    const submittedRef = useRef(false);
    const frameRequest = useRef<number | undefined>(undefined);
    const identity = useRef<{ view: string; id: string; generation: number } | undefined>(undefined);
    const [generatedId] = useState(() => allocateSceneInstanceId('probe'));
    const instanceId = `${kind}:${id ?? 'root'}:${generatedId}`;
    const sceneView = view ?? kind;
    const callback = useRef(onFrameSubmitted);
    useEffect(() => { callback.current = onFrameSubmitted; }, [onFrameSubmitted]);

    useEffect(() => {
        const generation = registerSceneInstance(sceneView, instanceId);
        identity.current = { view: sceneView, id: instanceId, generation };
        return () => {
            unregisterSceneInstance(sceneView, instanceId, generation);
            identity.current = undefined;
        };
    }, [sceneView, instanceId]);

    useEffect(() => {
        submittedRef.current = false;
        if (identity.current) invalidateSceneInstance(sceneView, instanceId, identity.current.generation);
        // Le probe n'est armé que si les conditions de readiness sont remplies :
        // Pour un avatar : au moins une pièce configurée non-none et action prête.
        // Si expectedParts est spécifié et vide, le probe ne s'arme jamais.
        if (expectedParts && expectedParts.length === 0) {
            armedRef.current = false;
        } else if (ready && active) {
            armedRef.current = true;
        } else {
            armedRef.current = false;
            submittedRef.current = false;
        }
        return () => {
            armedRef.current = false;
            if (frameRequest.current !== undefined) cancelAnimationFrame(frameRequest.current);
            frameRequest.current = undefined;
        };
    }, [ready, active, expectedParts, sceneView, instanceId]);

    // Nettoyage au démontage
    useEffect(() => {
        return () => {
            armedRef.current = false;
            submittedRef.current = false;
        };
    }, []);

    useFrame((state) => {
        if (!armedRef.current || submittedRef.current || frameRequest.current !== undefined || !identity.current) return;
        const token = identity.current;
        const before = state.gl.info.render.frame;
        frameRequest.current = requestAnimationFrame(() => {
            frameRequest.current = undefined;
            const { calls, frame } = state.gl.info.render;
            if (!armedRef.current || submittedRef.current || identity.current !== token || document.hidden || frame <= before || calls <= 0) return;
            const timestamp = performance.now();
            const signalKind: SceneSignalKind = kind === 'avatar' ? 'avatarFrameSubmitted' : 'worldFrameSubmitted';
            const record = recordSceneSignal(signalKind, {
                instanceId: token.id, view: token.view, generation: token.generation,
                timestamp, drawCalls: calls, frames: frame,
            });
            if (record) {
                submittedRef.current = true;
                callback.current?.({ timestamp, frame, calls });
            }
        });
    });

    return null;
}

export default SceneReadyProbe;
