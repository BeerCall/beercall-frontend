import { Object3D, Vector3 } from 'three';

import { CUSTOM_ITEMS_CONFIG } from './accessoryTransforms';
import type { ManifestAccessoryTransform } from './glb/manifest';
import type { AvatarTransform } from '../types/avatar';

export interface NormalizedAccessoryTransform {
    position: [number, number, number];
    /** Radians, comme Three.js. */
    rotation: [number, number, number];
    scale: [number, number, number];
    bone: string | null;
}

const IDENTITY: NormalizedAccessoryTransform = {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    bone: null,
};

function fromLegacy(transform: AvatarTransform | undefined): NormalizedAccessoryTransform {
    if (!transform) return { ...IDENTITY };
    return {
        position: [...(transform.position ?? [0, 0, 0])],
        rotation: [...(transform.rotation ?? [0, 0, 0])],
        scale: [...(transform.scale ?? [1, 1, 1])],
        bone: null,
    };
}

function fromManifest(transform: ManifestAccessoryTransform): NormalizedAccessoryTransform {
    const scale = transform.scale;
    return {
        position: [...transform.position],
        // Le manifeste stocke les degrés ; Three.js attend des radians.
        rotation: transform.rotation.map((value) => (value * Math.PI) / 180) as [number, number, number],
        scale: [scale, scale, scale],
        bone: transform.bone ?? null,
    };
}

/**
 * Transform effectif d'un accessoire.
 *
 * Tant que le manifeste n'a pas de transform (période 5f-1), on retombe sur
 * les valeurs historiques. La Beer conserve exceptionnellement son os pour
 * ne pas modifier l'affichage avant le renommage 5f-3.
 */
export function normalizeAccessoryTransform(
    accessoryId: string,
    manifestTransform?: ManifestAccessoryTransform | null,
): NormalizedAccessoryTransform {
    if (manifestTransform) return fromManifest(manifestTransform);

    if (accessoryId.endsWith('_Beer_500')) {
        return {
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [100, 100, 100],
            bone: 'WristR',
        };
    }

    return fromLegacy(CUSTOM_ITEMS_CONFIG[accessoryId]);
}

/**
 * Applique le transform et attache l'instance à l'os demandé, avec repli
 * WristR → HandR, puis à la racine si aucun os n'existe.
 *
 * L'échelle locale compense l'échelle monde de l'os pour que le transform
 * du manifeste reste dans la même unité que l'avatar.
 */
export function attachAccessory({
    accessoryId,
    instance,
    body,
    root,
    manifestTransform,
}: {
    accessoryId: string;
    instance: Object3D;
    body: Object3D;
    root: Object3D;
    manifestTransform?: ManifestAccessoryTransform | null;
}): NormalizedAccessoryTransform {
    const transform = normalizeAccessoryTransform(accessoryId, manifestTransform);
    root.updateMatrixWorld(true);
    let bone: Object3D | null = null;

    if (transform.bone) {
        bone = body.getObjectByName(transform.bone) ?? null;
        if (!bone && transform.bone === 'WristR') {
            bone = body.getObjectByName('HandR') ?? null;
        }
    }

    if (bone) {
        const worldScale = bone.getWorldScale(new Vector3()).x || 1;
        instance.position.set(...transform.position);
        instance.rotation.set(...transform.rotation);
        instance.scale.setScalar(transform.scale[0] / worldScale);
        bone.add(instance);
    } else {
        instance.position.set(...transform.position);
        instance.rotation.set(...transform.rotation);
        instance.scale.set(...transform.scale);
        root.add(instance);
    }

    instance.updateMatrixWorld(true);
    root.updateMatrixWorld(true);
    return transform;
}
