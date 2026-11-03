/**
 * B11 — AvatarRenderer (CHAL-02 / PERF).
 *
 * Sélectionne le renderer 3D de l'avatar selon le format demandé ou le feature flag :
 * - `format="glb"` (par défaut si glbAvatar activé) : RealAvatar (pièces GLB modulaires).
 * - `format="fbx"` : ModularAvatar directement monté dans la scène (sans SafeAvatar ni AvatarCanvas).
 * Aucune création de contexte WebGL dans ce composant.
 */

import React from 'react';
import type { Group } from 'three';

import { isFeatureEnabled } from '../config/featureFlags';
import type { AvatarConfig } from '../types/avatar';
import { RealAvatar } from './glb/RealAvatar';
import { ModularAvatar } from '../components/3D/ModularAvatar';

export interface AvatarRendererProps {
    config: AvatarConfig;
    format?: 'glb' | 'fbx';
    onAnimationsLoaded?: (names: string[]) => void;
    onReadinessChange?: (ready: boolean, details?: { parts: string[]; meshCount: number }) => void;
    onActiveClipChange?: (clipName: string) => void;
    groupRef?: React.Ref<Group>;
    scale?: number;
    animate?: boolean;
}

export const AvatarRenderer: React.FC<AvatarRendererProps> = ({
    config,
    format,
    onAnimationsLoaded,
    onReadinessChange,
    onActiveClipChange,
    groupRef,
    scale = 1,
    animate = true,
}) => {
    const isGlb = format ? format === 'glb' : isFeatureEnabled('glbAvatar');

    if (isGlb) {
        return (
            <RealAvatar
                config={config}
                animate={animate}
                scale={scale}
                groupRef={groupRef}
                onAnimationsLoaded={onAnimationsLoaded}
                onReadinessChange={onReadinessChange}
                onActiveClipChange={onActiveClipChange}
            />
        );
    }

    return (
        <group ref={groupRef} scale={scale}>
            <ModularAvatar
                config={config}
                onAnimationsLoaded={onAnimationsLoaded}
            />
        </group>
    );
};
