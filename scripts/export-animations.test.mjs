import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';
import * as THREE from 'three';
import {
  EXPECTED_SOURCE_HASH,
  EXPECTED_CLIPS,
  sha256Hex,
  deterministicUuid,
  encodeFloat32Array,
  decodeFloat32Array,
  decodeFloat32ArrayBrowser,
  generatePacks,
  reconstructClip,
  runCli,
} from './export-animations.mjs';

const TEMP_ROOT = resolve(process.env.LOCALAPPDATA || 'C:/Users/Migz3rrr/AppData/Local', 'Temp/opencode');

const FBX_SOURCE_PATH = resolve('../beercall-backend/static/models/Animations.fbx');

test('EXPECTED_SOURCE_HASH is immutable and matches Animations.fbx', async () => {
  assert.equal(EXPECTED_SOURCE_HASH, 'b455d642cd874130c3aba3ae03b207cc67c1817af3881cfbc3877e0921748d6e');
  const buffer = await readFile(FBX_SOURCE_PATH);
  const actualHash = sha256Hex(buffer);
  assert.equal(actualHash, EXPECTED_SOURCE_HASH);
});

test('generatePacks throws when source hash does not match', async () => {
  const buffer = await readFile(FBX_SOURCE_PATH);
  const wrongHash = '0'.repeat(64);
  assert.throws(
    () => generatePacks(buffer, wrongHash),
    /Source hash mismatch/
  );
});

test('deterministicUuid produces stable, distinct UUIDs', () => {
  const uuid1 = deterministicUuid(EXPECTED_SOURCE_HASH, 'Idle');
  const uuid2 = deterministicUuid(EXPECTED_SOURCE_HASH, 'Idle');
  const uuid3 = deterministicUuid(EXPECTED_SOURCE_HASH, 'Walk');

  assert.equal(uuid1, uuid2);
  assert.notEqual(uuid1, uuid3);
  assert.match(uuid1, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

test('encodeFloat32Array and decodeFloat32Array achieve bit-for-bit round-trip including -0 and subnormals', () => {
  const input = new Float32Array([
    -0.0,
    0.0,
    1.0,
    -1.0,
    1.25,
    -42.5,
    3.1415927,
    1e-10,
    -1e20,
    Infinity,
    -Infinity,
    1.4e-45, // subnormal min float32
  ]);

  const base64 = encodeFloat32Array(input);
  const decodedNode = decodeFloat32Array(base64);
  const decodedBrowser = decodeFloat32ArrayBrowser(base64);

  assert.equal(decodedNode.length, input.length);
  assert.equal(decodedBrowser.length, input.length);

  for (let i = 0; i < input.length; i++) {
    assert.ok(
      Object.is(input[i], decodedNode[i]),
      `Node decode mismatch at index ${i}: expected ${input[i]}, got ${decodedNode[i]}`
    );
    assert.ok(
      Object.is(input[i], decodedBrowser[i]),
      `Browser decode mismatch at index ${i}: expected ${input[i]}, got ${decodedBrowser[i]}`
    );
  }

  // Specifically verify -0 vs +0 distinction
  assert.equal(1 / decodedNode[0], -Infinity);
  assert.equal(1 / decodedBrowser[0], -Infinity);
  assert.equal(1 / decodedNode[1], Infinity);
  assert.equal(1 / decodedBrowser[1], Infinity);
});

test('decodeFloat32Array rejects invalid byte lengths', () => {
  // 'AAA=' decodes to 2 bytes, not a multiple of 4
  assert.throws(
    () => decodeFloat32Array('AAA='),
    /Invalid f32le-base64 byte length/
  );
  assert.throws(
    () => decodeFloat32ArrayBrowser('AAA='),
    /Invalid f32le-base64 byte length/
  );
});

test('generatePacks generates exactly 25 clips, critical Idle isolated, deferred has 24 clips in order', async () => {
  const buffer = await readFile(FBX_SOURCE_PATH);
  const packs = generatePacks(buffer, EXPECTED_SOURCE_HASH);

  assert.equal(packs.manifest.formatVersion, 1);
  assert.equal(packs.manifest.sourceHash, EXPECTED_SOURCE_HASH);
  assert.equal(packs.manifest.threeVersion, THREE.REVISION);
  assert.equal(packs.manifest.clips.length, 25);
  assert.deepEqual(packs.manifest.clips, EXPECTED_CLIPS);

  // Critical pack assertions
  assert.equal(packs.manifest.critical.name, 'idle');
  assert.equal(packs.manifest.critical.file, `idle.${packs.idleSha256}.json`);
  assert.equal(packs.manifest.critical.url, `/animations/idle.${packs.idleSha256}.json`);
  assert.equal(packs.manifest.critical.sha256, packs.idleSha256);
  assert.equal(packs.manifest.critical.byteLength, Buffer.byteLength(packs.idleJson, 'utf8'));
  assert.deepEqual(packs.manifest.critical.clips, ['Idle']);

  // Deferred pack assertions
  const expectedDeferredClips = EXPECTED_CLIPS.filter(name => name !== 'Idle');
  assert.equal(packs.manifest.deferred.name, 'deferred');
  assert.equal(packs.manifest.deferred.file, `deferred.${packs.deferredSha256}.json`);
  assert.equal(packs.manifest.deferred.url, `/animations/deferred.${packs.deferredSha256}.json`);
  assert.equal(packs.manifest.deferred.sha256, packs.deferredSha256);
  assert.equal(packs.manifest.deferred.byteLength, Buffer.byteLength(packs.deferredJson, 'utf8'));
  assert.deepEqual(packs.manifest.deferred.clips, expectedDeferredClips);

  // Check parsed JSON content
  const parsedIdlePack = JSON.parse(packs.idleJson);
  assert.equal(parsedIdlePack.pack, 'idle');
  assert.equal(parsedIdlePack.clips.length, 1);
  assert.equal(parsedIdlePack.clips[0].name, 'Idle');
  assert.equal(parsedIdlePack.clips[0].fps, undefined, 'fps must not be serialized');

  const parsedDeferredPack = JSON.parse(packs.deferredJson);
  assert.equal(parsedDeferredPack.pack, 'deferred');
  assert.equal(parsedDeferredPack.clips.length, 24);
  for (const clip of parsedDeferredPack.clips) {
    assert.equal(clip.fps, undefined, 'fps must not be serialized');
  }
});

test('two successive pack generations are byte-identical (deterministic output)', async () => {
  const buffer = await readFile(FBX_SOURCE_PATH);
  const gen1 = generatePacks(buffer, EXPECTED_SOURCE_HASH);
  const gen2 = generatePacks(buffer, EXPECTED_SOURCE_HASH);

  assert.equal(gen1.manifestJson, gen2.manifestJson);
  assert.equal(gen1.idleJson, gen2.idleJson);
  assert.equal(gen1.deferredJson, gen2.deferredJson);
  assert.equal(gen1.idleSha256, gen2.idleSha256);
  assert.equal(gen1.deferredSha256, gen2.deferredSha256);
});

test('round-trip reconstructs all 25 clips with bit-for-bit Float32 equality on all tracks', async () => {
  const buffer = await readFile(FBX_SOURCE_PATH);
  const packs = generatePacks(buffer, EXPECTED_SOURCE_HASH);

  const idlePack = JSON.parse(packs.idleJson);
  const deferredPack = JSON.parse(packs.deferredJson);
  const allSerialized = [...deferredPack.clips, ...idlePack.clips];

  assert.equal(packs.rawClips.length, 25);
  assert.equal(allSerialized.length, 25);

  let totalTracksTested = 0;
  let totalKeyframesTested = 0;

  for (const rawClip of packs.rawClips) {
    const serialized = allSerialized.find(c => c.name === rawClip.name);
    assert.ok(serialized, `Serialized clip ${rawClip.name} found`);

    const reconstructedNode = reconstructClip(serialized, decodeFloat32Array);
    const reconstructedBrowser = reconstructClip(serialized, decodeFloat32ArrayBrowser);

    assert.equal(reconstructedNode.name, rawClip.name);
    assert.equal(reconstructedNode.duration, rawClip.duration);
    assert.equal(reconstructedNode.blendMode, rawClip.blendMode);
    assert.equal(reconstructedNode.tracks.length, rawClip.tracks.length);
    assert.equal(reconstructedBrowser.tracks.length, rawClip.tracks.length);

    for (let i = 0; i < rawClip.tracks.length; i++) {
      const origTrack = rawClip.tracks[i];
      const recoTrackNode = reconstructedNode.tracks[i];
      const recoTrackBrowser = reconstructedBrowser.tracks[i];

      assert.equal(recoTrackNode.name, origTrack.name);
      assert.equal(recoTrackNode.ValueTypeName, origTrack.ValueTypeName);
      assert.equal(recoTrackNode.getInterpolation(), origTrack.getInterpolation());

      assert.equal(recoTrackNode.times.length, origTrack.times.length);
      assert.equal(recoTrackNode.values.length, origTrack.values.length);

      for (let t = 0; t < origTrack.times.length; t++) {
        assert.ok(
          Object.is(origTrack.times[t], recoTrackNode.times[t]),
          `Track time mismatch in ${rawClip.name} track ${origTrack.name} at time index ${t}`
        );
        assert.ok(
          Object.is(origTrack.times[t], recoTrackBrowser.times[t]),
          `Browser track time mismatch in ${rawClip.name} track ${origTrack.name} at time index ${t}`
        );
      }

      for (let v = 0; v < origTrack.values.length; v++) {
        assert.ok(
          Object.is(origTrack.values[v], recoTrackNode.values[v]),
          `Track value mismatch in ${rawClip.name} track ${origTrack.name} at value index ${v}`
        );
        assert.ok(
          Object.is(origTrack.values[v], recoTrackBrowser.values[v]),
          `Browser track value mismatch in ${rawClip.name} track ${origTrack.name} at value index ${v}`
        );
      }

      totalTracksTested++;
      totalKeyframesTested += origTrack.times.length + origTrack.values.length;
    }
  }

  assert.equal(totalTracksTested, 25 * 252, 'All 25 clips with 252 tracks tested (6,300 tracks)');
  assert.ok(totalKeyframesTested > 0);
});

test('CLI generate and --check pass in temporary directory', async () => {
  const tmpDir = await mkdtemp(join(TEMP_ROOT, 'beercall-anim-test-'));
  try {
    // Initial export
    await runCli(['--source', FBX_SOURCE_PATH, '--out', tmpDir]);

    // Check pass
    await runCli(['--source', FBX_SOURCE_PATH, '--out', tmpDir, '--check']);

    // Check fails on tampered manifest
    await writeFile(join(tmpDir, 'manifest.json'), '{"corrupted": true}\n', 'utf8');
    await assert.rejects(
      () => runCli(['--source', FBX_SOURCE_PATH, '--out', tmpDir, '--check']),
      /does not match generated manifest/
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('CLI refuses destination directory with foreign files', async () => {
  const tmpDir = await mkdtemp(join(TEMP_ROOT, 'beercall-anim-foreign-'));
  try {
    await writeFile(join(tmpDir, 'unauthorized_file.txt'), 'hello', 'utf8');
    await assert.rejects(
      () => runCli(['--source', FBX_SOURCE_PATH, '--out', tmpDir]),
      /contains foreign files/
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('spoofed source hash and unauthorized destinations are rejected', async () => {
  const bytes = await readFile(FBX_SOURCE_PATH);
  bytes[0] ^= 1;
  assert.throws(() => generatePacks(bytes, EXPECTED_SOURCE_HASH), /Source hash mismatch/);
  await assert.rejects(runCli(['--source', FBX_SOURCE_PATH, '--out', resolve('.')]), /Unauthorized/);
});

test('two on-disk generations match; check is read-only and hashed packs are never replaced', async () => {
  const first = await mkdtemp(join(TEMP_ROOT, 'beercall-anim-generation-'));
  const second = await mkdtemp(join(TEMP_ROOT, 'beercall-anim-generation-'));
  try {
    await runCli(['--source', FBX_SOURCE_PATH, '--out', first]);
    await runCli(['--source', FBX_SOURCE_PATH, '--out', second]);
    const files = await readdir(first);
    assert.deepEqual(files, await readdir(second));
    const timestamps = new Map();
    for (const name of files) {
      assert.deepEqual(await readFile(join(first, name)), await readFile(join(second, name)));
      timestamps.set(name, (await stat(join(first, name))).mtimeMs);
    }
    await runCli(['--source', FBX_SOURCE_PATH, '--out', first, '--check']);
    for (const name of files) assert.equal((await stat(join(first, name))).mtimeMs, timestamps.get(name));
    const pack = files.find(name => name.startsWith('idle.'));
    await writeFile(join(first, pack), 'corrupt');
    await assert.rejects(runCli(['--source', FBX_SOURCE_PATH, '--out', first]), /Existing hashed pack differs/);
    assert.equal(await readFile(join(first, pack), 'utf8'), 'corrupt');
  } finally {
    await rm(first, { recursive: true, force: true });
    await rm(second, { recursive: true, force: true });
  }
});
