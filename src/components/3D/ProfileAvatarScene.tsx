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

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Color } from 'three';

import { RealAvatar } from '../../avatar/glb/RealAvatar';
import { globalLeaseController } from '../../three/lease/leaseController';
import { useLease } from '../../three/lease/useLease';
import { destroyRenderer, trackRenderer } from '../../three/lease/webgl';
import type { AvatarConfig } from '../../types/avatar';

export interface ProfileAvatarSceneProps {
    config: AvatarConfig | null;
    userId?: string | number;
    surface?: 'profile' | 'signup';
    fallback?: React.ReactNode;
    onAnimationsLoaded?: (animations: string[]) => void;
    /** Incrémenté à chaque appui sur une animation ; relance un clip `o`. */
    replayToken?: number;
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
    userId,
    surface = 'profile',
    fallback = null,
    onAnimationsLoaded,
    replayToken,
}) => {
    const { granted, token } = useLease(surface);
    const [avatarState, setAvatarState] = useState<'loading' | 'ready' | 'error'>('loading');
    const readyFrames = useRef<number[]>([]);
    const readyScheduled = useRef(false);

    useEffect(() => () => {
        for (const frame of readyFrames.current) cancelAnimationFrame(frame);
        readyFrames.current = [];
    }, []);

    // Le clip est appliqué avant la première image réellement peinte. On attend
    // deux frames avant de retirer le sprite, sinon la zone peut rester blanche
    // une frame (ou plus) malgré un avatar assemblé.
    const scheduleReady = () => {
        if (readyScheduled.current) return;
        readyScheduled.current = true;
        const first = requestAnimationFrame(() => {
            const second = requestAnimationFrame(() => {
                readyFrames.current = [];
                setAvatarState('ready');
            });
            readyFrames.current.push(second);
        });
        readyFrames.current.push(first);
    };

    const handleReadinessChange = (ready: boolean) => {
        if (ready) return;
        for (const frame of readyFrames.current) cancelAnimationFrame(frame);
        readyFrames.current = [];
        readyScheduled.current = false;
        setAvatarState('error');
    };

    if (!config || !granted || !token) {
        return <div className="w-full h-full relative">{fallback}</div>;
    }

    const activeToken = token;
    const fallbackContent = fallback ?? (
        <div role="status" className="px-4 py-2 rounded-full bg-gray-900/85 text-white text-[10px] font-black uppercase tracking-widest">
            {avatarState === 'error' ? 'Avatar 3D indisponible' : 'Chargement de l’avatar…'}
        </div>
    );

    return (
        <div className="w-full h-full relative">
            {avatarState !== 'ready' && (
                <div
                    className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
                    data-testid="avatar-fallback"
                >
                    {fallbackContent}
                </div>
            )}
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
                        userId={userId}
                        scale={0.01}
                        onAnimationsLoaded={onAnimationsLoaded}
                        replayToken={replayToken}
                        onReadinessChange={handleReadinessChange}
                        onActiveClipChange={scheduleReady}
                    />
                </Suspense>
            </Canvas>
            {avatarState === 'error' && (
                <div
                    role="alert"
                    className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 rounded-full bg-gray-900/90 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg"
                >
                    Avatar 3D indisponible — repli affiché
                </div>
            )}
        </div>
    );
};
