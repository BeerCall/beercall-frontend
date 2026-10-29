import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { preparedThumbnailEnvelope, thumbnailClipKey, type ThumbnailEnvelopeCatalog } from '../lib/thumbnailEnvelopeCatalog';

function fixture() {
    const clip = new THREE.AnimationClip('Idle', 2, [new THREE.VectorKeyframeTrack('root.position', [0, 2], [0, 0, 0, 0, 1, 0])]);
    const wrapper = new THREE.Group();
    const model = new THREE.Group();
    model.userData.beercallSourceSha256 = 'model-hash';
    wrapper.add(model);
    wrapper.position.set(10, 20, -5);
    wrapper.rotation.z = Math.PI / 2;
    wrapper.scale.set(2, 3, 1);
    wrapper.updateMatrixWorld(true);
    const catalog: ThumbnailEnvelopeCatalog = { version: 1, threeRevision: THREE.REVISION, clip: thumbnailClipKey(clip),
        models: { 'model-hash': { min: [-1, -2, -3], max: [1, 2, 3], guard: [0.1, 0.2, 0.3], samples: 247 } } };
    return { clip, parts: [{ partKey: 'head', root: wrapper }], model, wrapper, catalog };
}

describe('prepared thumbnail envelopes', () => {
    it('assembles validated bounds in the real wrapper space without remeasuring meshes', () => {
        const { clip, parts, wrapper, catalog } = fixture();
        const result = preparedThumbnailEnvelope({ clip, parts }, catalog);
        expect(result?.ok).toBe(true);
        const expected = new THREE.Box3(new THREE.Vector3(-1, -2, -3), new THREE.Vector3(1, 2, 3)).applyMatrix4(wrapper.matrixWorld);
        expect(result?.box.equals(expected)).toBe(true);
        expect(result?.sampleCount).toBe(247);
        expect(result?.measuredGuard[0]).toBeCloseTo(0.6);
        expect(result?.measuredGuard[1]).toBeCloseTo(0.2);
        expect(result?.duration).toBe(2);
    });

    it('unions all parts, including static accessories, rather than using only the body', () => {
        const { clip, parts, catalog } = fixture();
        const accessory = new THREE.Group();
        const source = new THREE.Group();
        source.userData.beercallSourceSha256 = 'model-hash';
        accessory.add(source);
        accessory.position.x = 1000;
        accessory.updateMatrixWorld(true);
        const result = preparedThumbnailEnvelope({ clip, parts: [...parts, { partKey: 'accessory', root: accessory }] }, catalog);
        expect(result?.box.max.x).toBe(1001);
        expect(result?.box.min.x).toBeCloseTo(4);
    });

    it('distinguishes clips with the same name and number of tracks but different motion', () => {
        const { clip, parts, catalog } = fixture();
        const changed = clip.clone();
        changed.tracks[0].values[4] = 50;
        expect(preparedThumbnailEnvelope({ clip: changed, parts }, catalog)).toBeNull();
        expect(preparedThumbnailEnvelope({ clip: new THREE.AnimationClip('Sitting', 2, clip.tracks), parts }, catalog)).toBeNull();
    });

    it.each(['unknown-model', 'missing-part', 'wrong-version', 'wrong-three', 'invalid-box', 'non-finite', 'negative-guard', 'override-transform'])(
        'refuses %s so the exact runtime fallback remains responsible', reason => {
            const { clip, parts, model, catalog } = fixture();
            if (reason === 'unknown-model') model.userData.beercallSourceSha256 = 'not-prepared';
            if (reason === 'missing-part') parts.push({ partKey: 'body', root: new THREE.Group() });
            if (reason === 'wrong-version') catalog.version = 2;
            if (reason === 'wrong-three') catalog.threeRevision = '182';
            if (reason === 'invalid-box') catalog.models['model-hash'].min[0] = 5;
            if (reason === 'non-finite') catalog.models['model-hash'].max[0] = Infinity;
            if (reason === 'negative-guard') catalog.models['model-hash'].guard[0] = -1;
            const input = reason === 'override-transform'
                ? { clip, parts: parts.map(part => ({ ...part, transform: { scale: [2, 2, 2] as [number, number, number] } })) }
                : { clip, parts };
            expect(preparedThumbnailEnvelope(input, catalog)).toBeNull();
        },
    );
});
