/**
 * 8l — cible PROBE de la machine à sous (diagnostic E2E uniquement).
 *
 * Le panneau de parcours a besoin de cliquer la machine en 3D : on publie sa
 * position NDC à la demande, sans projection par image. Rien n'est enregistré
 * hors du build probe.
 */
import { Vector3, type Camera, type Object3D } from 'three';

interface SlotTargetHandle {
    object: Object3D;
    camera: Camera;
}

export interface SlotMachineTarget {
    ndcX: number;
    ndcY: number;
}

let target: SlotTargetHandle | null = null;
const scratch = new Vector3();

/** Position écran de la machine, ou `null` si elle sort du cadre. */
export function resolveSlotMachineTarget(): SlotMachineTarget | null {
    if (!target) return null;
    target.object.getWorldPosition(scratch);
    scratch.project(target.camera);
    if (!Number.isFinite(scratch.x) || !Number.isFinite(scratch.y)) return null;
    if (Math.abs(scratch.x) > 1 || Math.abs(scratch.y) > 1 || scratch.z > 1) return null;
    return { ndcX: scratch.x, ndcY: scratch.y };
}

function publish(): void {
    if (typeof window === 'undefined') return;
    window.__beercallSlotMachineTarget = resolveSlotMachineTarget;
}

export function registerSlotMachineTarget(object: Object3D, camera: Camera): void {
    target = { object, camera };
    publish();
}

export function unregisterSlotMachineTarget(object: Object3D): void {
    if (target?.object !== object) return;
    target = null;
    publish();
}

export function resetSlotMachineTargetForTests(): void {
    target = null;
    if (typeof window !== 'undefined') window.__beercallSlotMachineTarget = undefined;
}

declare global {
    interface Window {
        /** Diagnostic PROBE : centre de la machine à sous du Bar, en NDC. */
        __beercallSlotMachineTarget?: () => SlotMachineTarget | null;
    }
}
