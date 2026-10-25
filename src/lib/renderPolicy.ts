export type WorldShadowPolicy = 'legacy' | 'static' | 'shared';

export interface WorldShadowPolicyDetails {
    policy: WorldShadowPolicy;
    localFrames: number;
    useSharedShadows: boolean;
    useLocalShadows: boolean;
}

export type Position3D = [number, number, number] | { x: number; y?: number; z: number };

export interface SharedShadowBounds {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    centerX: number;
    centerZ: number;
    width: number;
    depth: number;
    scale: [number, number];
    position: [number, number, number];
}

export const DEFAULT_SHADOW_POLICY: WorldShadowPolicy = 'legacy';
export const LEGACY_SHADOW_FOOTPRINT_RADIUS = 75; // Demi-empreinte de scale=150

/**
 * Résolution pure de la politique d'ombres à partir des variables d'environnement.
 * VITE_WORLD_SHADOW_POLICY prime sur l'ancien booléen VITE_SHARED_WORLD_SHADOWS.
 */
export function resolveWorldShadowPolicy(
    envPolicy?: string | null,
    legacySharedShadows?: string | boolean | null
): WorldShadowPolicy {
    if (typeof envPolicy === 'string' && envPolicy.trim().length > 0) {
        const normalized = envPolicy.trim().toLowerCase();
        if (normalized === 'legacy' || normalized === 'static' || normalized === 'shared') {
            return normalized;
        }
    }

    if (
        legacySharedShadows === true ||
        legacySharedShadows === 'true' ||
        legacySharedShadows === '1'
    ) {
        return 'shared';
    }

    return DEFAULT_SHADOW_POLICY;
}

/**
 * Retourne la politique d'ombres effective basée sur import.meta.env.
 */
export function getWorldShadowPolicy(): WorldShadowPolicy {
    const envPolicy = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_WORLD_SHADOW_POLICY : undefined;
    const legacyShared = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SHARED_WORLD_SHADOWS : undefined;
    return resolveWorldShadowPolicy(envPolicy, legacyShared);
}

/**
 * Fournit les détails de configuration pour une politique donnée.
 */
export function getShadowPolicyDetails(
    policy: WorldShadowPolicy = getWorldShadowPolicy()
): WorldShadowPolicyDetails {
    return {
        policy,
        localFrames: policy === 'static' ? 1 : Infinity,
        useSharedShadows: policy === 'shared',
        useLocalShadows: policy === 'legacy' || policy === 'static',
    };
}

function extractCoordinates(pos: Position3D): { x: number; y: number; z: number } {
    if (Array.isArray(pos)) {
        return { x: pos[0], y: pos[1], z: pos[2] };
    }
    return { x: pos.x, y: pos.y ?? 0, z: pos.z };
}

/**
 * Calcul pur des limites de l'ombre partagée englobante.
 * Couvre l'ensemble des centres d'avatars étendus de padding (défaut 75 unités, équivalent à l'empreinte legacy 150).
 */
export function calculateSharedShadowBounds(
    positions: Position3D[],
    groundY: number,
    padding: number = LEGACY_SHADOW_FOOTPRINT_RADIUS
): SharedShadowBounds | null {
    if (!positions || positions.length === 0) {
        return null;
    }

    const coords = positions.map(extractCoordinates);

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (const c of coords) {
        if (c.x < minX) minX = c.x;
        if (c.x > maxX) maxX = c.x;
        if (c.z < minZ) minZ = c.z;
        if (c.z > maxZ) maxZ = c.z;
    }

    // Extension de 75 unités de chaque côté (empreinte legacy de 150)
    const expandedMinX = minX - padding;
    const expandedMaxX = maxX + padding;
    const expandedMinZ = minZ - padding;
    const expandedMaxZ = maxZ + padding;

    const width = expandedMaxX - expandedMinX;
    const depth = expandedMaxZ - expandedMinZ;
    const centerX = (expandedMinX + expandedMaxX) / 2;
    const centerZ = (expandedMinZ + expandedMaxZ) / 2;

    return {
        minX: expandedMinX,
        maxX: expandedMaxX,
        minZ: expandedMinZ,
        maxZ: expandedMaxZ,
        centerX,
        centerZ,
        width,
        depth,
        scale: [width, depth],
        position: [centerX, groundY, centerZ],
    };
}
