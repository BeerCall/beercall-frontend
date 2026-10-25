import { useMemo } from 'react';
import { ContactShadows } from '@react-three/drei';
import {
    calculateSharedShadowBounds,
    type Position3D,
    LEGACY_SHADOW_FOOTPRINT_RADIUS,
} from '../../lib/renderPolicy';

export interface WorldContactShadowsProps {
    positions: Position3D[];
    groundY: number;
    opacity?: number;
    blur?: number;
    far?: number;
    color?: string;
    frames?: number;
    resolution?: number;
    padding?: number;
}

/**
 * Composant d'ombre de contact partagée (option 'shared' de CHAL-06).
 * Calcule dynamiquement le rectangle englobant étendu de 75 unités (empreinte legacy 150)
 * et rend un unique ContactShadows sur le plan du sol fourni.
 * Ne rend rien si aucun avatar n'est présent.
 */
export default function WorldContactShadows({
    positions,
    groundY,
    opacity = 0.6,
    blur = 2,
    far = 100,
    color = '#000000',
    frames = Infinity,
    resolution = 512,
    padding = LEGACY_SHADOW_FOOTPRINT_RADIUS,
}: WorldContactShadowsProps) {
    const bounds = useMemo(
        () => calculateSharedShadowBounds(positions, groundY, padding),
        [positions, groundY, padding]
    );

    if (!bounds) {
        return null;
    }

    return (
        <ContactShadows
            position={bounds.position}
            scale={bounds.scale}
            opacity={opacity}
            blur={blur}
            far={far}
            color={color}
            frames={frames}
            resolution={resolution}
        />
    );
}
