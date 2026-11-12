import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { AnimationClip, Box3, Quaternion, QuaternionKeyframeTrack, Vector3 } from 'three';

import {
    computeCommonFrame,
    computeKeyTime,
} from './animation-thumbnails.mjs';
import { checkThumbnailFile } from './check-animations.mjs';

const ANIMATIONS_DIR = resolve('public/animations');
const MANIFEST_PATH = resolve(ANIMATIONS_DIR, 'manifest.json');

function quaternionTrack(times, quaternions) {
    const values = [];
    for (const quaternion of quaternions) values.push(...quaternion.toArray());
    return new QuaternionKeyframeTrack('Bone.quaternion', times, values);
}

test('computeKeyTime choisit l’instant du plus grand écart à Idle', () => {
    const identity = new Quaternion();
    const rotated = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    const idle = new AnimationClip('Idle', 1, [quaternionTrack([0, 1], [identity, identity])]);
    const wave = new AnimationClip('Wave', 1, [
        quaternionTrack([0, 0.5, 1], [identity, rotated, identity]),
    ]);

    const keyTime = computeKeyTime(wave, idle);
    assert.ok(Math.abs(keyTime - 0.5) < 0.02, `instant clé ${keyTime} proche de 0.5`);
});

test('computeKeyTime garde t=0 pour Idle', () => {
    const identity = new Quaternion();
    const idle = new AnimationClip('Idle', 1, [quaternionTrack([0, 1], [identity, identity])]);
    assert.equal(computeKeyTime(idle, idle), 0);
});

test('computeCommonFrame part de la hauteur Idle et élargit pour toutes les poses', () => {
    const idleBounds = [new Box3(new Vector3(-1, 0, -1), new Vector3(1, 2, 1))];
    const clipBounds = [
        idleBounds[0].clone(),
        new Box3(new Vector3(-3, 0, -1), new Vector3(3, 2, 1)),
    ];
    const frame = computeCommonFrame(idleBounds, clipBounds, 1.15);
    assert.equal(frame.center[0], 0);
    assert.equal(frame.center[1], 1);
    assert.ok(Math.abs(frame.extent - 6.9) < 1e-9, `étendue ${frame.extent}`);
});

test('les 50 vignettes réelles passent l’anti-rognage 4 px et donnent leur remplissage', async () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    assert.equal(manifest.clips.length, 25);

    let count = 0;
    let fillMin = Infinity;
    let fillMax = 0;
    for (const entry of manifest.clips) {
        for (const gender of ['Men', 'Women']) {
            const result = await checkThumbnailFile(
                ANIMATIONS_DIR,
                entry.thumbnails[gender],
                entry.name,
                gender,
            );
            count += 1;
            fillMin = Math.min(fillMin, result.fill);
            fillMax = Math.max(fillMax, result.fill);
            assert.ok(result.fill > 0 && result.fill <= 1, `remplissage ${entry.name}/${gender} : ${result.fill}`);
        }
    }

    assert.equal(count, 50);
    assert.ok(fillMin <= fillMax);
    console.log(`[animation-thumbnails] ${count} vignettes, remplissage ${(fillMin * 100).toFixed(1)} % - ${(fillMax * 100).toFixed(1)} %`);
});
