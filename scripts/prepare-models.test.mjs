import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
    Group, Bone, Skeleton, SkinnedMesh, BufferGeometry,
    Float32BufferAttribute, Uint16BufferAttribute, MeshPhongMaterial, Texture,
} from 'three';
import { prepareModel } from './prepare-models.mjs';

const source = createHash('sha256').update('fixture').digest('hex');

function fixture() {
    const group = new Group();
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.setAttribute('skinIndex', new Uint16BufferAttribute(new Array(12).fill(0), 4));
    geometry.setAttribute('skinWeight', new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    const mesh = new SkinnedMesh(geometry, new MeshPhongMaterial({ color: 0xffaa11, shininess: 37 }));
    const bone = new Bone();
    bone.name = 'Hips';
    bone.rotation.set(0.123456789, 1.234567891, 0.000012345);
    mesh.add(bone);
    group.add(mesh);
    mesh.bind(new Skeleton([bone]));
    group.updateMatrixWorld(true);
    return group;
}

test('preparation keeps deterministic bytes, source hash, geometry, transforms and materials', () => {
    const original = fixture();
    const bytes = prepareModel(original, source);
    assert.deepEqual(bytes, prepareModel(fixture(), source));
    assert.equal(bytes.toString('ascii', 0, 8), 'BCMODEL1');
    const jsonLength = bytes.readUInt32LE(8);
    const payload = JSON.parse(bytes.toString('utf8', 12, 12 + jsonLength));
    assert.equal(payload.sourceSha256, source);
    assert.equal(payload.version, 1);
    const mesh = payload.model.object.children[0];
    const bone = mesh.children[0];
    assert.equal(bone.name, 'Hips');
    assert.deepEqual(bone.quaternion, original.children[0].skeleton.bones[0].quaternion.toArray());
    assert.deepEqual(mesh.bindMatrix, original.children[0].bindMatrix.toArray());
    assert.equal(payload.model.materials[0].type, 'MeshPhongMaterial');
    assert.equal(payload.model.materials[0].shininess, 37);
    const position = payload.model.geometries[0].data.attributes.position.array;
    const start = Math.ceil((12 + jsonLength) / 8) * 8 + position.$offset;
    assert.deepEqual(
        Array.from({length: position.length}, (_, i) => bytes.readFloatLE(start + i * 4)),
        Array.from(original.children[0].geometry.attributes.position.array),
    );
});

test('textured assets are explicitly refused instead of losing their textures', () => {
    const group = fixture();
    group.children[0].material.map = new Texture();
    assert.throws(() => prepareModel(group, source), /Textured/);
});
