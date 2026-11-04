/**
 * B13 — AvatarStage (CHAL-02 / CHAL-06).
 *
 * Scène 3D isolée sous LeasedCanvas pour le Profil et SignUp :
 * - Remplace SafeAvatar partagé (aucun SafeAvatar dans Profile).
 * - Utilise LeasedCanvas (surface 'profile' ou 'signup') sans fuite de contexte GPU.
 * - Cadrage en coordonnées historiques via `computeAvatarFraming` (fov 38).
 * - Éclairage studio à 2 sources (HemisphereLight + DirectionalLight).
 * - Rendu via AvatarRenderer (choix GLB / FBX).
 */

import React, { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Box3, Color, DirectionalLight, Group, HemisphereLight, PerspectiveCamera } from 'three';

import { AvatarRenderer } from '../../avatar/AvatarRenderer';
import { LeasedCanvas } from '../../three/lease/LeasedCanvas';
import type { LeaseSurface } from '../../three/lease/leaseStore';
import type { AvatarConfig } from '../../types/avatar';
import { computeAvatarFraming } from '../../lib/avatarFraming';
import { globalPerfProbe } from '../../perf/perfProbe';

export interface AvatarStageProps {
    config: AvatarConfig | null;
    onAnimationsLoaded?: (animations: string[]) => void;
    surface?: LeaseSurface;
    fallback?: React.ReactNode;
    disableZoom?: boolean;
    disablePan?: boolean;
    format?: 'glb' | 'fbx';
    onReadinessChange?: (ready: boolean, details?: { parts: string[]; meshCount: number }) => void;
    onActiveClipChange?: (clipName: string) => void;
    className?: string;
    style?: React.CSSProperties;
}

function FramingController({
    targetRef,
}: {
    targetRef: React.RefObject<Group | null>;
}) {
    const { camera, size } = useThree();
    const framedRef = useRef(false);

    const applyFraming = React.useCallback(() => {
        if (!targetRef.current) return false;
        targetRef.current.updateMatrixWorld(true);
        const box = new Box3().setFromObject(targetRef.current);
        if (box.isEmpty()) return false;

        const persCamera = camera as PerspectiveCamera;
        const framing = computeAvatarFraming({
            box,
            width: size.width || 300,
            height: size.height || 400,
            fov: persCamera.fov || 38,
        });

        if (framing.ok) {
            camera.position.set(...framing.position);
            camera.lookAt(framing.center[0], framing.center[1], framing.center[2]);
            camera.near = framing.near;
            camera.far = framing.far;
            camera.updateMatrixWorld(true);
            camera.updateProjectionMatrix();
            globalPerfProbe.recordFrameSubmission();
            return true;
        }
        return false;
    }, [camera, size, targetRef]);

    useEffect(() => {
        framedRef.current = false;
        const timer = setTimeout(() => {
            if (applyFraming()) framedRef.current = true;
        }, 50);
        return () => clearTimeout(timer);
    }, [applyFraming]);

    useFrame(() => {
        if (!framedRef.current && applyFraming()) {
            framedRef.current = true;
        }
    });

    return null;
}

export const AvatarStage: React.FC<AvatarStageProps> = ({
    config,
    onAnimationsLoaded,
    surface = 'profile',
    fallback = null,
    format,
    onReadinessChange,
    onActiveClipChange,
    className = 'w-full h-full relative',
    style,
}) => {
    const groupRef = useRef<Group | null>(null);

    if (!config) {
        return <div className={className} style={style}>{fallback}</div>;
    }

    return (
        <div className={className} style={style}>
            <LeasedCanvas
                surface={surface}
                fallback={fallback}
                preserveDrawingBuffer={true}
                camera={{ fov: 38, position: [0, 80, 260] }}
                className="w-full h-full"
            >
                <ambientLight intensity={0.5} />
                <primitive object={new HemisphereLight(new Color('#ffffff'), new Color('#4a5568'), 2.4)} />
                <primitive
                    object={(() => {
                        const dir = new DirectionalLight(new Color('#ffffff'), 2.2);
                        dir.position.set(0.6, 2.4, 3);
                        return dir;
                    })()}
                />
                <FramingController targetRef={groupRef} />
                <AvatarRenderer
                    config={config}
                    format={format}
                    groupRef={groupRef}
                    onAnimationsLoaded={onAnimationsLoaded}
                    onReadinessChange={onReadinessChange}
                    onActiveClipChange={onActiveClipChange}
                />
            </LeasedCanvas>
        </div>
    );
};
