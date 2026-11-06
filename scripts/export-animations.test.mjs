import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile, readdir, stat, copyFile, mkdir, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';
import * as THREE from 'three';
import {
  parseAnimationFileName,
  isHumanoidTrack,
  sha256Hex,
  deterministicUuid,
  encodeFloat32Array,
  decodeFloat32Array,
  decodeFloat32ArrayBrowser,
  loadSourceFiles,
  generatePacks,
  reconstructClip,
  parseFbxAnimations,
  runCli,
} from './export-animations.mjs';
import { checkAnimations } from './check-animations.mjs';

const TEMP_ROOT = resolve(process.env.LOCALAPPDATA || 'C:/Users/Migz3rrr/AppData/Local', 'Temp/opencode');
const SOURCES_DIR = resolve('../beercall-backend/static/models/animations/sources');
const ORIGINAL_FBX = resolve('../beercall-backend/static/models/Animations.fbx');
const GLB_BODY = resolve('../beercall-backend/static/models/glb/v1/pieces/Men/Men_body_Casual_0.446c8496.glb');

test('parseAnimationFileName lit le flag l/o et refuse un flag absent ou inconnu', () => {
  assert.deepEqual(
    (({ id, name, loop }) => ({ id, name, loop }))(parseAnimationFileName('Anim_Wave_l.fbx')),
    { id: 'Anim_Wave_l', name: 'Wave', loop: true },
  );
  assert.deepEqual(
    (({ id, name, loop }) => ({ id, name, loop }))(parseAnimationFileName('Anim_Death_o.fbx')),
    { id: 'Anim_Death_o', name: 'Death', loop: false },
  );
  assert.equal(parseAnimationFileName('Anim_Idle_Gun_Pointing_l.fbx').name, 'Idle_Gun_Pointing');

  assert.throws(() => parseAnimationFileName('Anim_Wave.fbx'), /Format attendu/);
  assert.throws(() => parseAnimationFileName('Anim_Wave_x.fbx'), /Format attendu/);
  assert.throws(() => parseAnimationFileName('Wave_l.fbx'), /Format attendu/);
  assert.throws(() => parseAnimationFileName('Anim_Wave_l.FBX'), /Extension/);
  assert.throws(() => parseAnimationFileName('sub/Anim_Wave_l.fbx'), /chemin interdit/);
  assert.throws(() => parseAnimationFileName(''), /vide/);
});

test('deterministicUuid produit des UUID stables et distincts', () => {
  const hash = sha256Hex(Buffer.from('BeerCall'));
  const uuid1 = deterministicUuid(hash, 'Idle');
  const uuid2 = deterministicUuid(hash, 'Idle');
  const uuid3 = deterministicUuid(hash, 'Walk');
  assert.equal(uuid1, uuid2);
  assert.notEqual(uuid1, uuid3);
  assert.match(uuid1, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

test('encodeFloat32Array et decodeFloat32Array font un aller-retour bit à bit', () => {
  const input = new Float32Array([-0.0, 0.0, 1.25, -42.5, 1e-10, 1.4e-45]);
  const base64 = encodeFloat32Array(input);
  const node = decodeFloat32Array(base64);
  const browser = decodeFloat32ArrayBrowser(base64);
  for (let i = 0; i < input.length; i += 1) {
    assert.ok(Object.is(input[i], node[i]), `node index ${i}`);
    assert.ok(Object.is(input[i], browser[i]), `browser index ${i}`);
  }
});

test('les 25 sources portent un flag cohérent et Idle boucle', async () => {
  const files = await loadSourceFiles(SOURCES_DIR);
  assert.equal(files.length, 25);
  const parsed = files.map(file => parseAnimationFileName(file.fileName));
  assert.equal(new Set(parsed.map(entry => entry.name)).size, 25);
  const idle = parsed.filter(entry => entry.name === 'Idle');
  assert.equal(idle.length, 1);
  assert.equal(idle[0].loop, true);
  assert.equal(parsed.find(entry => entry.name === 'Wave').loop, true);
  assert.equal(parsed.find(entry => entry.name === 'Death').loop, false);
});

test('generatePacks construit un manifeste v2 sans liste, compte ni ordre en dur', async () => {
  const files = await loadSourceFiles(SOURCES_DIR);
  const packs = generatePacks(files);
  const manifest = packs.manifest;

  assert.equal(manifest.formatVersion, 2);
  assert.equal('sourceHash' in manifest, false);
  assert.equal(manifest.threeVersion, THREE.REVISION);
  assert.equal(manifest.clips.length, files.length);
  assert.deepEqual(new Set(manifest.clips.map(entry => entry.id)), new Set(files.map(file => file.id ?? file.fileName.slice(0, -4))));

  for (const entry of manifest.clips) {
    const parsed = parseAnimationFileName(`${entry.id}.fbx`);
    assert.equal(entry.name, parsed.name);
    assert.equal(entry.loop, parsed.loop);
    assert.equal(entry.duration > 0, true);
    assert.equal(entry.pack, entry.name === 'Idle' ? 'idle' : 'deferred');
    assert.match(entry.sourceSha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(entry.thumbnails, { Men: null, Women: null });
  }

  assert.equal(manifest.critical.clips.length, 1);
  assert.equal(manifest.critical.clips[0], 'Idle');
  assert.equal(manifest.deferred.clips.length, manifest.clips.length - 1);
  assert.equal(manifest.deferred.clips.includes('Idle'), false);

  const scrambled = generatePacks([...files].reverse());
  assert.equal(scrambled.manifestJson, packs.manifestJson);
  assert.equal(scrambled.idleJson, packs.idleJson);
  assert.equal(scrambled.deferredJson, packs.deferredJson);
});

test('generatePacks échoue explicitement quand Idle est absent', async () => {
  const files = (await loadSourceFiles(SOURCES_DIR))
    .filter(file => parseAnimationFileName(file.fileName).name !== 'Idle');
  assert.throws(() => generatePacks(files), /Idle est obligatoire/);
});

test('generatePacks échoue explicitement sur un nom dupliqué', async () => {
  const files = await loadSourceFiles(SOURCES_DIR);
  const wave = files.find(file => parseAnimationFileName(file.fileName).name === 'Wave');
  assert.ok(wave);
  const duplicate = { fileName: 'Anim_Wave_o.fbx', buffer: wave.buffer };
  assert.throws(() => generatePacks([...files, duplicate]), /Nom de clip dupliqué/);
});

test('generatePacks échoue sur un fichier sans flag', async () => {
  const files = await loadSourceFiles(SOURCES_DIR);
  assert.throws(
    () => generatePacks([{ fileName: 'Anim_Wave.fbx', buffer: files[0].buffer }]),
    /Format attendu/,
  );
});

test('les 25 clips découpés gardent les mêmes pistes et durées que Animations.fbx', async () => {
  const files = await loadSourceFiles(SOURCES_DIR);
  const packs = generatePacks(files);
  const originalClips = parseFbxAnimations(await readFile(ORIGINAL_FBX));

  let checkedTracks = 0;
  let expectedTracks = 0;
  for (const original of originalClips) {
    expectedTracks += original.tracks.filter(track => isHumanoidTrack(track.name)).length;
  }

  for (const serialized of packs.serialized) {
    const original = originalClips.find(clip => clip.name === serialized.name);
    assert.ok(original, `clip original ${serialized.name}`);
    assert.ok(Math.abs(original.duration - serialized.duration) < 1e-9,
      `durée identique pour ${serialized.name}`);

    const originalTracks = new Map(
      original.tracks.filter(track => isHumanoidTrack(track.name)).map(track => [track.name, track]),
    );
    assert.equal(serialized.tracks.length, originalTracks.size, `nombre de pistes pour ${serialized.name}`);

    for (const track of serialized.tracks) {
      const originalTrack = originalTracks.get(track.name);
      assert.ok(originalTrack, `piste originale ${track.name} dans ${serialized.name}`);
      assert.equal(track.type, originalTrack.ValueTypeName);
      checkedTracks += 1;
    }
  }

  assert.equal(checkedTracks, expectedTracks);
});

test('les 186 pistes couvrent les os deformants du GLB et aucun os du squelette n’est perdu', async () => {
  const clips = parseFbxAnimations(await readFile(ORIGINAL_FBX));
  const humanoidBones = new Set();
  const excludedNodes = new Set();
  for (const clip of clips) {
    for (const track of clip.tracks) {
      const node = track.name.split('.')[0];
      if (isHumanoidTrack(track.name)) humanoidBones.add(node);
      else excludedNodes.add(node);
    }
  }

  assert.equal(clips[0].tracks.length, 252);
  assert.equal(clips[0].tracks.filter(track => isHumanoidTrack(track.name)).length, 186);
  assert.equal(humanoidBones.size, 62);

  const glb = await readFile(GLB_BODY);
  const jsonLength = glb.readUInt32LE(12);
  const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
  const joints = new Set((gltf.skins?.[0]?.joints ?? []).map(index => gltf.nodes[index]?.name));
  for (const bone of humanoidBones) {
    assert.ok(joints.has(bone), `os deformant absent du GLB : ${bone}`);
  }

  const expectedExcluded = [
    'Camera', 'Camera001', 'CharacterArmature', 'Light', 'Light001',
    'Head_end', 'Index4L_end', 'Middle4L_end', 'Ring4L_end', 'Pinky4L_end', 'Thumb3L_end',
    'Index4R_end', 'Middle4R_end', 'Ring4R_end', 'Pinky4R_end', 'Thumb3R_end',
    'LowerLegL_end', 'LowerLegR_end', 'FootL_end', 'PTL_end', 'FootR_end', 'PTR_end',
  ].sort();
  assert.deepEqual([...excludedNodes].sort(), expectedExcluded);
  assert.equal([...joints].filter(name => name.endsWith('_end')).length, 0);
});

test('aller-retour de sérialisation sans perte', async () => {
  const packs = generatePacks(await loadSourceFiles(SOURCES_DIR));
  for (const serialized of packs.serialized) {
    const reconstructed = reconstructClip(serialized, decodeFloat32Array);
    assert.equal(reconstructed.name, serialized.name);
    assert.equal(reconstructed.duration, serialized.duration);
    assert.equal(reconstructed.tracks.length, serialized.tracks.length);
    for (const track of reconstructed.tracks) {
      assert.ok(track.times instanceof Float32Array);
      assert.equal(track.times[0], 0);
    }
  }
});

test('supprimer une source retire le clip, le pack et les vignettes orphelines (simulation)', async () => {
  const sources = await mkdtemp(join(TEMP_ROOT, 'beercall-anim-remove-src-'));
  const out = await mkdtemp(join(TEMP_ROOT, 'beercall-anim-remove-out-'));
  try {
    const entries = await readdir(SOURCES_DIR);
    for (const name of entries) {
      if (name === '.gitkeep' || name === 'Anim_Walk_l.fbx') continue;
      await copyFile(join(SOURCES_DIR, name), join(sources, name));
    }

    await mkdir(join(out, 'thumbnails'), { recursive: true });
    const realThumbnails = resolve('public/animations/thumbnails');
    for (const name of await readdir(realThumbnails)) {
      await copyFile(join(realThumbnails, name), join(out, 'thumbnails', name));
    }
    const orphanThumbnail = join(out, 'thumbnails', 'Anim_Walk_l_Men.webp');
    const orphanIdlePack = join(out, `idle.${'0'.repeat(64)}.json`);
    const orphanDeferredPack = join(out, `deferred.${'1'.repeat(64)}.json`);
    await writeFile(orphanIdlePack, '{"old":true}\n', 'utf8');
    await writeFile(orphanDeferredPack, '{"old":true}\n', 'utf8');

    await runCli(['--sources', sources, '--out', out]);

    const manifest = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'));
    assert.equal(manifest.clips.length, 24);
    assert.equal(manifest.clips.some((clip) => clip.name === 'Walk'), false);
    assert.equal(manifest.deferred.clips.includes('Walk'), false);
    assert.equal(manifest.critical.clips.includes('Idle'), true);
    assert.equal(
      manifest.clips.every((clip) => clip.thumbnails.Men && clip.thumbnails.Women),
      true,
    );

    const deferred = JSON.parse(await readFile(join(out, manifest.deferred.file), 'utf8'));
    assert.equal(deferred.clips.some((clip) => clip.name === 'Walk'), false);

    await assert.rejects(access(orphanThumbnail), /ENOENT/);
    await assert.rejects(access(join(out, 'thumbnails', 'Anim_Walk_l_Women.webp')), /ENOENT/);
    await assert.rejects(access(orphanIdlePack), /ENOENT/);
    await assert.rejects(access(orphanDeferredPack), /ENOENT/);
    await access(join(out, manifest.critical.file));
    await access(join(out, manifest.deferred.file));
    await access(join(out, 'thumbnails', 'Anim_Idle_l_Men.webp'));

    const checked = await checkAnimations(out);
    assert.equal(checked.totalClips, 24);
    assert.equal(checked.thumbnailCount, 48);
  } finally {
    await rm(sources, { recursive: true, force: true });
    await rm(out, { recursive: true, force: true });
  }
});

test('CLI export et --check passent, puis détectent un manifeste altéré', async () => {
  const tmpDir = await mkdtemp(join(TEMP_ROOT, 'beercall-anim-test-'));
  try {
    await runCli(['--sources', SOURCES_DIR, '--out', tmpDir]);
    await runCli(['--sources', SOURCES_DIR, '--out', tmpDir, '--check']);
    await writeFile(join(tmpDir, 'manifest.json'), '{"corrupted": true}\n', 'utf8');
    await assert.rejects(
      () => runCli(['--sources', SOURCES_DIR, '--out', tmpDir, '--check']),
      /does not match generated manifest/,
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('CLI refuse un dossier de destination contenant un fichier étranger', async () => {
  const tmpDir = await mkdtemp(join(TEMP_ROOT, 'beercall-anim-foreign-'));
  try {
    await writeFile(join(tmpDir, 'unauthorized_file.txt'), 'hello', 'utf8');
    await assert.rejects(
      () => runCli(['--sources', SOURCES_DIR, '--out', tmpDir]),
      /contains foreign files/,
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('CLI refuse une destination non autorisée', async () => {
  await assert.rejects(
    () => runCli(['--sources', SOURCES_DIR, '--out', resolve('.')]),
    /Unauthorized/,
  );
});

test('deux générations sur disque sont identiques et --check ne réécrit rien', async () => {
  const first = await mkdtemp(join(TEMP_ROOT, 'beercall-anim-generation-'));
  const second = await mkdtemp(join(TEMP_ROOT, 'beercall-anim-generation-'));
  try {
    await runCli(['--sources', SOURCES_DIR, '--out', first]);
    await runCli(['--sources', SOURCES_DIR, '--out', second]);
    const files = await readdir(first);
    assert.deepEqual(files.sort(), (await readdir(second)).sort());
    const timestamps = new Map();
    for (const name of files) {
      assert.deepEqual(await readFile(join(first, name)), await readFile(join(second, name)));
      timestamps.set(name, (await stat(join(first, name))).mtimeMs);
    }
    await runCli(['--sources', SOURCES_DIR, '--out', first, '--check']);
    for (const name of files) assert.equal((await stat(join(first, name))).mtimeMs, timestamps.get(name));

    const pack = files.find(name => name.startsWith('idle.'));
    await writeFile(join(first, pack), 'corrupt');
    await assert.rejects(
      () => runCli(['--sources', SOURCES_DIR, '--out', first]),
      /Existing hashed pack differs/,
    );
    assert.equal(await readFile(join(first, pack), 'utf8'), 'corrupt');
  } finally {
    await rm(first, { recursive: true, force: true });
    await rm(second, { recursive: true, force: true });
  }
});
