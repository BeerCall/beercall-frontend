import * as THREE from 'three';
import preparedCatalog from './thumbnailEnvelopes.generated.json' with { type: 'json' };
import type { ThumbnailIdleEnvelopeInput, ThumbnailIdleEnvelopeReady } from './thumbnailIdleEnvelope';

export interface ThumbnailEnvelopeCatalog {
    version: number;
    threeRevision: string;
    clip: string;
    models: Record<string, { min: number[]; max: number[]; guard: number[]; samples: number }>;
}

// Full clip content, not its name: an edited Idle must never reuse stale bounds.
const clipKeys = new WeakMap<THREE.AnimationClip, string>();
export function thumbnailClipKey(clip: THREE.AnimationClip): string {
    let key = clipKeys.get(clip);
    if (!key) {
        const json = THREE.AnimationClip.toJSON(clip);
        key = JSON.stringify({ name: json.name, duration: json.duration, blendMode: json.blendMode, tracks: json.tracks });
        clipKeys.set(clip, key);
    }
    return key;
}

/** Union of independently validated model envelopes, in the actual assembly space.
 * No clones, vertex skinning or animation sampling on the display path.
 * Any unknown model/clip falls back to the exact runtime measurement.
 */
export function preparedThumbnailEnvelope(
    { parts, clip }: ThumbnailIdleEnvelopeInput,
    catalog: ThumbnailEnvelopeCatalog = preparedCatalog,
): ThumbnailIdleEnvelopeReady | null {
    const started = performance.now();
    if (!parts.length || catalog.version !== 1 || catalog.threeRevision !== THREE.REVISION ||
        clip.name !== 'Idle' || catalog.clip !== thumbnailClipKey(clip)) return null;
    const box = new THREE.Box3();
    const guard = new THREE.Vector3();
    let sampleCount = 0;
    for (const { root, transform } of parts) {
        // Explicit override transforms require the runtime path. Canvas wrappers
        // already carry their transforms in matrixWorld.
        if (transform) return null;
        const sources: THREE.Object3D[] = [];
        root.traverse(node => { if (typeof node.userData.beercallSourceSha256 === 'string') sources.push(node); });
        if (sources.length !== 1) return null;
        const model = sources[0];
        const entry = catalog.models[model.userData.beercallSourceSha256 as string];
        if (!entry || ![entry.min, entry.max, entry.guard].every(values =>
            values.length === 3 && values.every(Number.isFinite)) ||
            entry.guard.some(value => value < 0) || !Number.isSafeInteger(entry.samples) || entry.samples <= 0) return null;
        const local = new THREE.Box3(new THREE.Vector3(...entry.min), new THREE.Vector3(...entry.max));
        if (local.isEmpty()) return null;
        // The offline box includes the model's own TRS, but not its parent wrapper.
        const parentMatrix = model.parent?.matrixWorld ?? new THREE.Matrix4();
        if (!parentMatrix.elements.every(Number.isFinite)) return null;
        box.union(local.applyMatrix4(parentMatrix));
        const m = parentMatrix.elements;
        const [x, y, z] = entry.guard;
        guard.max(new THREE.Vector3(
            Math.abs(m[0]) * x + Math.abs(m[4]) * y + Math.abs(m[8]) * z,
            Math.abs(m[1]) * x + Math.abs(m[5]) * y + Math.abs(m[9]) * z,
            Math.abs(m[2]) * x + Math.abs(m[6]) * y + Math.abs(m[10]) * z,
        ));
        sampleCount = Math.max(sampleCount, entry.samples);
    }
    if (box.isEmpty() || ![...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite)) return null;
    return { ok: true, box, measuredGuard: [guard.x, guard.y, guard.z], sampleCount,
        cpuTimeMs: performance.now() - started, duration: clip.duration };
}
