import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

export const EXPECTED_SOURCE_HASH = 'b455d642cd874130c3aba3ae03b207cc67c1817af3881cfbc3877e0921748d6e';

export const EXPECTED_CLIPS = [
  'Punch_Right',
  'Idle_Gun',
  'Sword_Slash',
  'Punch_Left',
  'Idle_Gun_Pointing',
  'Idle_Gun_Shoot',
  'Interact',
  'Idle_Neutral',
  'Kick_Left',
  'HitRecieve_2',
  'Run_Back',
  'Idle_Sword',
  'Run_Right',
  'Wave',
  'Kick_Right',
  'HitRecieve',
  'Run',
  'Gun_Shoot',
  'Walk',
  'Sitting',
  'Death',
  'Roll',
  'Run_Shoot',
  'Run_Left',
  'Idle',
];

export function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

export function deterministicUuid(sourceHash, clipName) {
  const hash = sha256Hex(`v1:${sourceHash}:${clipName}`);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

export function encodeFloat32Array(f32Array) {
  if (!(f32Array instanceof Float32Array)) {
    throw new TypeError('Expected Float32Array instance');
  }
  const buf = Buffer.alloc(f32Array.length * 4);
  for (let i = 0; i < f32Array.length; i++) {
    buf.writeFloatLE(f32Array[i], i * 4);
  }
  return buf.toString('base64');
}

export function decodeFloat32Array(base64Str) {
  const buf = Buffer.from(base64Str, 'base64');
  if (buf.byteLength % 4 !== 0) {
    throw new Error(`Invalid f32le-base64 byte length: ${buf.byteLength} is not a multiple of 4`);
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out = new Float32Array(buf.byteLength / 4);
  for (let i = 0; i < out.length; i++) {
    out[i] = view.getFloat32(i * 4, true);
  }
  return out;
}

export function decodeFloat32ArrayBrowser(base64Str) {
  const binaryString = atob(base64Str);
  const len = binaryString.length;
  if (len % 4 !== 0) {
    throw new Error(`Invalid f32le-base64 byte length: ${len} is not a multiple of 4`);
  }
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(len / 4);
  for (let i = 0; i < out.length; i++) {
    out[i] = view.getFloat32(i * 4, true);
  }
  return out;
}

export function parseFbxAnimations(sourceBuffer) {
  const prevWindow = globalThis.window;
  globalThis.window = { innerWidth: 800, innerHeight: 600 };
  try {
    const loader = new FBXLoader();
    const group = loader.parse(
      sourceBuffer.buffer.slice(sourceBuffer.byteOffset, sourceBuffer.byteOffset + sourceBuffer.byteLength),
      ''
    );
    return group.animations || [];
  } finally {
    if (prevWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = prevWindow;
    }
  }
}

export function generatePacks(sourceBuffer, sourceHash) {
  if (sourceHash !== EXPECTED_SOURCE_HASH) {
    throw new Error(`Source hash mismatch: expected ${EXPECTED_SOURCE_HASH}, got ${sourceHash}`);
  }

  const rawClips = parseFbxAnimations(sourceBuffer);
  if (rawClips.length !== EXPECTED_CLIPS.length) {
    throw new Error(`Expected ${EXPECTED_CLIPS.length} clips, found ${rawClips.length}`);
  }

  const clipNames = rawClips.map(c => c.name);
  for (let i = 0; i < EXPECTED_CLIPS.length; i++) {
    if (clipNames[i] !== EXPECTED_CLIPS[i]) {
      throw new Error(`Unexpected clip catalogue at index ${i}: expected ${EXPECTED_CLIPS[i]}, got ${clipNames[i]}`);
    }
  }

  const serializedClips = rawClips.map(clip => {
    const tracks = clip.tracks.map(t => {
      const type = t.ValueTypeName;
      if (type !== 'vector' && type !== 'quaternion') {
        throw new Error(`Unsupported track type: ${type} on clip ${clip.name}, track ${t.name}`);
      }
      return {
        name: t.name,
        type,
        interpolation: t.getInterpolation(),
        times: encodeFloat32Array(t.times),
        values: encodeFloat32Array(t.values),
      };
    });

    return {
      name: clip.name,
      duration: clip.duration,
      blendMode: clip.blendMode ?? 2500,
      uuid: deterministicUuid(sourceHash, clip.name),
      tracks,
    };
  });

  const idleClip = serializedClips.find(c => c.name === 'Idle');
  if (!idleClip) throw new Error('Critical Idle clip missing');

  const deferredClips = serializedClips.filter(c => c.name !== 'Idle');
  if (deferredClips.length !== 24) {
    throw new Error(`Expected 24 deferred clips, found ${deferredClips.length}`);
  }

  const idlePack = {
    pack: 'idle',
    formatVersion: 1,
    sourceHash,
    clips: [idleClip],
  };

  const deferredPack = {
    pack: 'deferred',
    formatVersion: 1,
    sourceHash,
    clips: deferredClips,
  };

  const idleJson = JSON.stringify(idlePack, null, 2) + '\n';
  const deferredJson = JSON.stringify(deferredPack, null, 2) + '\n';

  const idleSha256 = sha256Hex(Buffer.from(idleJson, 'utf8'));
  const deferredSha256 = sha256Hex(Buffer.from(deferredJson, 'utf8'));

  const idleByteLength = Buffer.byteLength(idleJson, 'utf8');
  const deferredByteLength = Buffer.byteLength(deferredJson, 'utf8');

  const manifest = {
    formatVersion: 1,
    sourceHash,
    threeVersion: THREE.REVISION,
    clips: EXPECTED_CLIPS,
    critical: {
      name: 'idle',
      file: `idle.${idleSha256}.json`,
      url: `/animations/idle.${idleSha256}.json`,
      sha256: idleSha256,
      byteLength: idleByteLength,
      clips: ['Idle'],
    },
    deferred: {
      name: 'deferred',
      file: `deferred.${deferredSha256}.json`,
      url: `/animations/deferred.${deferredSha256}.json`,
      sha256: deferredSha256,
      byteLength: deferredByteLength,
      clips: deferredClips.map(c => c.name),
    },
  };

  const manifestJson = JSON.stringify(manifest, null, 2) + '\n';

  return {
    manifest,
    manifestJson,
    idleSha256,
    idleJson,
    deferredSha256,
    deferredJson,
    rawClips,
  };
}

export function reconstructClip(serializedClip, decodeFn = decodeFloat32Array) {
  const parsedTracks = serializedClip.tracks.map(t => ({
    name: t.name,
    type: t.type,
    interpolation: t.interpolation,
    times: decodeFn(t.times),
    values: decodeFn(t.values),
  }));

  return THREE.AnimationClip.parse({
    name: serializedClip.name,
    duration: serializedClip.duration,
    blendMode: serializedClip.blendMode,
    uuid: serializedClip.uuid,
    tracks: parsedTracks,
  });
}

export async function runCli(argv = process.argv.slice(2)) {
  const getArg = name => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const sourcePath = getArg('--source');
  const outDir = getArg('--out');
  const isCheck = argv.includes('--check');

  if (!sourcePath || !outDir) {
    throw new Error('Usage: node scripts/export-animations.mjs --source <path> --out <path> [--check]');
  }

  const resolvedSource = resolve(sourcePath);
  const resolvedOut = resolve(outDir);

  const sourceBuffer = await readFile(resolvedSource);
  const sourceHash = sha256Hex(sourceBuffer);

  const { manifestJson, idleSha256, idleJson, deferredSha256, deferredJson } = generatePacks(
    sourceBuffer,
    sourceHash
  );

  const idleFileName = `idle.${idleSha256}.json`;
  const deferredFileName = `deferred.${deferredSha256}.json`;

  if (isCheck) {
    const existingManifest = await readFile(join(resolvedOut, 'manifest.json'), 'utf8');
    const existingIdle = await readFile(join(resolvedOut, idleFileName), 'utf8');
    const existingDeferred = await readFile(join(resolvedOut, deferredFileName), 'utf8');

    if (existingManifest !== manifestJson) {
      throw new Error(`manifest.json in ${resolvedOut} does not match generated manifest`);
    }
    if (existingIdle !== idleJson) {
      throw new Error(`${idleFileName} in ${resolvedOut} does not match generated idle pack`);
    }
    if (existingDeferred !== deferredJson) {
      throw new Error(`${deferredFileName} in ${resolvedOut} does not match generated deferred pack`);
    }

    console.log(`Check passed: all animation packs in ${resolvedOut} match source ${basename(sourcePath)}.`);
    return;
  }

  let dirEntries = [];
  try {
    dirEntries = await readdir(resolvedOut);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await mkdir(resolvedOut, { recursive: true });
    } else {
      throw err;
    }
  }

  // Refuse directory with foreign / unexpected files (only allowed: manifest.json, idle.*.json, deferred.*.json, .gitkeep)
  const isAllowedFile = name =>
    name === 'manifest.json' ||
    name === '.gitkeep' ||
    (name.startsWith('idle.') && name.endsWith('.json')) ||
    (name.startsWith('deferred.') && name.endsWith('.json'));

  const foreign = dirEntries.filter(name => !isAllowedFile(name));
  if (foreign.length > 0) {
    throw new Error(`Destination directory contains foreign files: ${foreign.join(', ')}`);
  }

  await writeFile(join(resolvedOut, idleFileName), idleJson, 'utf8');
  await writeFile(join(resolvedOut, deferredFileName), deferredJson, 'utf8');
  await writeFile(join(resolvedOut, 'manifest.json'), manifestJson, 'utf8');

  console.log(`Generated animation packs in ${resolvedOut}:`);
  console.log(`  manifest.json: ${Buffer.byteLength(manifestJson, 'utf8')} bytes`);
  console.log(`  ${idleFileName}: ${Buffer.byteLength(idleJson, 'utf8')} bytes (SHA-256: ${idleSha256})`);
  console.log(`  ${deferredFileName}: ${Buffer.byteLength(deferredJson, 'utf8')} bytes (SHA-256: ${deferredSha256})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli().catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}
