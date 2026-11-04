/**
 * P1 — scène Profil alignée sur la PoC validée (7ad2d84).
 *
 * Reprend le contrat de `poc/fluidite/src/profile/ProfileScreen.tsx` :
 * caméra fixe [1.9, 1.55, 3.2] fov 38, lookAt(0, 1.05, 0), fond #101820,
 * éclairage studio 1.5/1.8, avatar à l'échelle 0.01.
 *
 * Seule adaptation : la réservation du contexte passe par le lease de l'app
 * (`useLease`) au lieu de `RendererLifecycle`, et la configuration vient du profil.
 */

import React, { Suspense, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Color } from 'three';

import { RealAvatar } from '../../avatar/glb/RealAvatar';
import { globalLeaseController } from '../../three/lease/leaseController';
import { useLease } from '../../three/lease/useLease';
import { destroyRenderer, trackRenderer } from '../../three/lease/webgl';
import type { AvatarConfig } from '../../types/avatar';

export interface ProfileAvatarSceneProps {
    config: AvatarConfig | null;
    fallback?: React.ReactNode;
    onAnimationsLoaded?: (animations: string[]) => void;
}

function Camera() {
    const { camera } = useThree();
    useEffect(() => {
        camera.lookAt(0, 1.05, 0);
    }, [camera]);
    return null;
}

export const ProfileAvatarScene: React.FC<ProfileAvatarSceneProps> = ({
    config,
    fallback = null,
    onAnimationsLoaded,
}) => {
    const { granted, token } = useLease('profile');

    if (!config || !granted || !token) {
        return <div className="w-full h-full relative">{fallback}</div>;
    }

    const activeToken = token;

    return (
        <div className="w-full h-full relative">
            <Canvas
                dpr={[1.5, 1.5]}
                gl={{ antialias: false }}
                camera={{ position: [1.9, 1.55, 3.2], fov: 38 }}
                onCreated={({ gl }) => {
                    trackRenderer(gl);
                    globalLeaseController.attach(activeToken, () => destroyRenderer(gl));
                }}
            >
                <color attach="background" args={[new Color('#f8fafc')]} />
                <hemisphereLight intensity={1.5} />
                <directionalLight position={[3, 5, 4]} intensity={1.8} />
                <Camera />
                <Suspense fallback={null}>
                    <RealAvatar
                        config={config}
                        scale={0.01}
                        onAnimationsLoaded={onAnimationsLoaded}
                    />
                </Suspense>
            </Canvas>
        </div>
    );
};
