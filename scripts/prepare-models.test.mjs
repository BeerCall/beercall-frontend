import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Group, Bone, Skeleton, SkinnedMesh, BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute,
    MeshPhongMaterial, AnimationMixer, AnimationClip, VectorKeyframeTrack, Texture } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { prepareModel } from './prepare-models.mjs';
import { parsePreparedModel } from '../src/lib/preparedModel.ts';

const source = createHash('sha256').update('fixture').digest('hex');
function fixture() {
    const group = new Group();
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.setAttribute('skinIndex', new Uint16BufferAttribute(new Array(12).fill(0), 4));
    geometry.setAttribute('skinWeight', new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    const mesh = new SkinnedMesh(geometry, new MeshPhongMaterial({ color: 0xffaa11, shininess: 37 }));
    const bone = new Bone(); bone.name = 'Hips';
    bone.rotation.set(0.123456789, 1.234567891, 0.000012345);
    mesh.add(bone); group.add(mesh); mesh.bind(new Skeleton([bone]));
    group.updateMatrixWorld(true);
    return group;
}
const ab = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

test('deterministic bytes, geometry, bind pose, Phong materials and skeleton cloning survive preparation', () => {
    const original = fixture();
    const bytes = prepareModel(original, source);
    assert.deepEqual(bytes, prepareModel(fixture(), source));
    const restored = parsePreparedModel(ab(bytes));
    const mesh = restored.children[0];
    assert.equal(mesh.material.type, 'MeshPhongMaterial');
    assert.equal(mesh.material.shininess, 37);
    assert.deepEqual(Array.from(mesh.geometry.attributes.position.array), Array.from(original.children[0].geometry.attributes.position.array));
    assert.deepEqual(mesh.bindMatrix.elements, original.children[0].bindMatrix.elements);
    assert.deepEqual(mesh.skeleton.boneInverses[0].elements, original.children[0].skeleton.boneInverses[0].elements);
    assert.deepEqual(mesh.skeleton.bones[0].quaternion.toArray(), original.children[0].skeleton.bones[0].quaternion.toArray());
    restored.updateMatrixWorld(true);
    assert.deepEqual(mesh.skeleton.bones[0].matrixWorld.elements, original.children[0].skeleton.bones[0].matrixWorld.elements);
    const cloned = clone(restored);
    assert.notEqual(cloned.children[0].skeleton.bones[0], mesh.skeleton.bones[0]);
    assert.equal(cloned.children[0].skeleton.bones[0].name, 'Hips');
});

test('existing animation tracks target the same named bones at multiple poses', () => {
    const original = fixture();
    const restored = parsePreparedModel(ab(prepareModel(original, source)));
    const clip = new AnimationClip('Idle', 1, [new VectorKeyframeTrack('Hips.position', [0, 1], [0, 0, 0, 2, 3, 4])]);
    const mixers = [original, restored].map(root => { const mixer = new AnimationMixer(root); mixer.clipAction(clip).play(); return mixer; });
    for (const time of [0, 0.25, 0.75]) {
        mixers.forEach(mixer => mixer.setTime(time));
        assert.deepEqual(restored.children[0].skeleton.bones[0].position.toArray(), original.children[0].skeleton.bones[0].position.toArray());
    }
});

test('invalid/truncated headers and out-of-bounds attributes are rejected', () => {
    assert.throws(() => parsePreparedModel(new ArrayBuffer(0)));
    const bytes = prepareModel(fixture(), source);
    assert.throws(() => parsePreparedModel(ab(bytes.subarray(0, bytes.length - 2))));
    const invalid = Buffer.from(bytes); invalid.writeUInt32LE(0xffffffff, 8);
    assert.throws(() => parsePreparedModel(ab(invalid)));
});

test('textured assets are explicitly refused instead of losing their textures', () => {
    const group = fixture(); group.children[0].material.map = new Texture();
    assert.throws(() => prepareModel(group, source), /Textured/);
});
