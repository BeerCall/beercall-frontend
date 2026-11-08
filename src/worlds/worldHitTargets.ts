/**
 * 8i — diagnostic PROBE des zones de toucher des avatars.
 *
 * Les cibles ne sont enregistrées que dans le build probe. Chaque entrée garde
 * l'objet Three et la caméra ; la position NDC est calculée à la demande, au
 * moment où le parcours E2E la lit. Aucun travail par image, donc aucune
 * projection ajoutée aux 50 avatars d'un monde.
 */
import { Vector3, type Camera, type Object3D } from 'three';
import type { WorldKind } from './pocWorldScenario';

interface WorldHitTargetHandle {
    world: WorldKind;
    userId: string;
    username?: string | null;
    object: Object3D;
    camera: Camera;
}

export interface WorldHitTarget {
    world: WorldKind;
    userId: string;
    username: string | null;
    ndcX: number;
    ndcY: number;
}

const targets = new Map<string, WorldHitTargetHandle>();
const scratch = new Vector3();

function keyFor(world: WorldKind, userId: string): string {
    return `${world}:${userId}`;
}

/** Résout les cibles visibles à l'écran, en coordonnées NDC. */
export function resolveWorldHitTargets(): WorldHitTarget[] {
    const resolved: WorldHitTarget[] = [];
    for (const handle of targets.values()) {
        handle.object.getWorldPosition(scratch);
        scratch.project(handle.camera);
        if (!Number.isFinite(scratch.x) || !Number.isFinite(scratch.y)) continue;
        if (Math.abs(scratch.x) > 1 || Math.abs(scratch.y) > 1 || scratch.z > 1) continue;
        resolved.push({
            world: handle.world,
            userId: handle.userId,
            username: handle.username?.trim() || null,
            ndcX: scratch.x,
            ndcY: scratch.y,
        });
    }
    return resolved;
}

function publish(): void {
    if (typeof window === 'undefined') return;
    window.__beercallWorldHitTargets = resolveWorldHitTargets;
}

export function registerWorldHitTarget(target: WorldHitTargetHandle): void {
    targets.set(keyFor(target.world, target.userId), target);
    publish();
}

export function unregisterWorldHitTarget(world: WorldKind, userId: string): void {
    targets.delete(keyFor(world, userId));
    publish();
}

export function resetWorldHitTargetsForTests(): void {
    targets.clear();
    if (typeof window !== 'undefined') window.__beercallWorldHitTargets = undefined;
}

declare global {
    interface Window {
        /** Diagnostic PROBE : cibles de toucher de la couche active. */
        __beercallWorldHitTargets?: () => WorldHitTarget[];
    }
}
