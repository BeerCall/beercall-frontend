/**
 * A13 — Composition d'un avatar complet à partir des pièces GLB publiées.
 *
 * Charge et assemble les 4 pièces et l'accessoire optionnel en un graphe Three.js.
 * - Un AnimationMixer par pièce skinnée (statique sans mixer).
 * - Clip partagé appliqué avec pose initiale t=0 (poseIdle0).
 * - L'accessoire reste racine sœur dans le groupe, positionné en radians via A01.
 * - Annotations userData.partKey sur chaque racine.
 * - Calcul de bodyBounds (avant accessoire) et fullBounds (après accessoire).
 * - stop/dispose propres sans détruire le cache CPU partagé.
 */

import { AnimationClip, AnimationMixer, Box3, Group, Object3D, SkinnedMesh } from 'three';
import { attachAccessory } from '../accessoryAttachment';
import { loadGlb, cloneGlbInstance } from '../glb/loadGlb';
import {
    type AvatarPartsConfig,
    type GlbManifest,
    type ResolvedAvatarParts,
    resolveAvatarParts,
} from '../glb/manifest';

export interface ComposedParts {
    head: Group;
    body: Group;
    legs: Group;
    feet: Group;
    accessory: Group | null;
}

export interface ComposedPerson {
    group: Group;
    parts: ComposedParts;
    mixers: AnimationMixer[];
    bodyBounds: Box3;
    fullBounds: Box3;
    resolved: ResolvedAvatarParts;
    stop: () => void;
    dispose: () => void;
}

export interface ComposePersonOptions {
    config?: AvatarPartsConfig;
    parts?: ResolvedAvatarParts;
    manifest?: GlbManifest;
    clip?: AnimationClip | null;
}

function hasSkinnedMesh(root: Object3D): boolean {
    let found = false;
    root.traverse((node) => {
        if ((node as SkinnedMesh).isSkinnedMesh) found = true;
    });
    return found;
}

export async function composePerson(options: ComposePersonOptions): Promise<ComposedPerson> {
    const resolved = options.parts ?? resolveAvatarParts(options.config ?? {}, options.manifest);

    // 1. Chargement concurrent des 4 pièces obligatoires
    const [headGltf, bodyGltf, legsGltf, feetGltf] = await Promise.all([
        loadGlb(resolved.head.url),
        loadGlb(resolved.body.url),
        loadGlb(resolved.legs.url),
        loadGlb(resolved.feet.url),
    ]);

    // 2. Clonage indépendant de chaque squelette
    const headInstance = cloneGlbInstance(headGltf);
    const bodyInstance = cloneGlbInstance(bodyGltf);
    const legsInstance = cloneGlbInstance(legsGltf);
    const feetInstance = cloneGlbInstance(feetGltf);

    headInstance.userData.partKey = 'head';
    headInstance.userData.sourceId = resolved.head.sourceId;
    bodyInstance.userData.partKey = 'body';
    bodyInstance.userData.sourceId = resolved.body.sourceId;
    legsInstance.userData.partKey = 'legs';
    legsInstance.userData.sourceId = resolved.legs.sourceId;
    feetInstance.userData.partKey = 'feet';
    feetInstance.userData.sourceId = resolved.feet.sourceId;

    const group = new Group();
    group.name = `avatar:${resolved.gender}`;
    group.add(headInstance, bodyInstance, legsInstance, feetInstance);

    // 3. Création des mixers pour les pièces skinnées
    const mixers: AnimationMixer[] = [];
    const coreInstances = [headInstance, bodyInstance, legsInstance, feetInstance];

    for (const inst of coreInstances) {
        if (hasSkinnedMesh(inst)) {
            const mixer = new AnimationMixer(inst);
            if (options.clip) {
                const action = mixer.clipAction(options.clip);
                action.play();
                action.time = 0;
                mixer.update(0); // Pose Idle t=0
            }
            mixers.push(mixer);
        }
    }

    // 4. Calcul de bodyBounds (corps pur sans accessoire)
    group.updateMatrixWorld(true);
    const bodyBounds = new Box3().setFromObject(group);

    // 5. Chargement et positionnement de l'accessoire
    let accessoryInstance: Group | null = null;
    if (resolved.accessory) {
        const accGltf = await loadGlb(resolved.accessory.url);
        accessoryInstance = cloneGlbInstance(accGltf);
        accessoryInstance.userData.partKey = 'accessory';
        accessoryInstance.userData.sourceId = resolved.accessory.sourceId;

        attachAccessory({
            accessoryId: resolved.accessory.sourceId,
            instance: accessoryInstance,
            body: bodyInstance,
            root: group,
            manifestTransform: resolved.accessory.transform,
        });

        if (hasSkinnedMesh(accessoryInstance)) {
            const accMixer = new AnimationMixer(accessoryInstance);
            if (options.clip) {
                const action = accMixer.clipAction(options.clip);
                action.play();
                action.time = 0;
                accMixer.update(0);
            }
            mixers.push(accMixer);
        }
    }

    // 6. Calcul de fullBounds (incluant l'accessoire)
    group.updateMatrixWorld(true);
    const fullBounds = new Box3().setFromObject(group);

    const parts: ComposedParts = {
        head: headInstance,
        body: bodyInstance,
        legs: legsInstance,
        feet: feetInstance,
        accessory: accessoryInstance,
    };

    const stop = () => {
        for (const mixer of mixers) {
            mixer.stopAllAction();
            mixer.uncacheRoot(mixer.getRoot());
        }
    };

    const dispose = () => {
        stop();
        group.clear();
    };

    return {
        group,
        parts,
        mixers,
        bodyBounds,
        fullBounds,
        resolved,
        stop,
        dispose,
    };
}
