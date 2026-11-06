import { readFile, writeFile, mkdir, readdir, lstat } from 'node:fs/promises';
import { resolve, join, basename, dirname, relative, isAbsolute, sep, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

/**
 * Format d'un fichier source : un clip par fichier.
 * `l` = boucle, `o` = joué une fois puis dernière pose conservée.
 */
const SOURCE_NAME_PATTERN = /^Anim_(.+)_([lo])\.fbx$/;

/** Noeuds de scène qui ne font pas partie du rig humanoïde. */
const NON_HUMANOID = new Set(['Camera', 'Camera001', 'CharacterArmature', 'Light', 'Light001']);

/**
 * Tolérance de compactage des pistes quasi constantes. Le bake Blender écrit
 * une clé par image ; une piste immobile est ainsi dupliquée 51 fois. On la
 * ramène à ses deux extrémités, sans changer la pose au-delà du bruit du bake
 * (écart maximal observé ~7,85e-6, soit 4 ordres de grandeur sous le pixel).
 */
const NEAR_CONSTANT_EPSILON = 1e-6;

export const THUMBNAIL_GENDERS = Object.freeze(['Men', 'Women']);

export function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Analyse un nom de fichier `Anim_<Nom>_<l|o>.fbx`.
 * Un flag absent ou inconnu est refusé avec un message explicite.
 */
export function parseAnimationFileName(fileName) {
  if (typeof fileName !== 'string' || fileName.length === 0) {
    throw new Error('Nom de fichier d\'animation vide.');
  }
  if (basename(fileName) !== fileName || /[\\/]/.test(fileName)) {
    throw new Error(`Nom de fichier d'animation invalide (chemin interdit) : "${fileName}".`);
  }
  if (extname(fileName) !== '.fbx') {
    throw new Error(`Extension d'animation invalide pour "${fileName}": attendu .fbx.`);
  }
  const match = SOURCE_NAME_PATTERN.exec(fileName);
  if (!match) {
    throw new Error(
      `Nom de fichier d'animation invalide : "${fileName}". ` +
      'Format attendu : Anim_<Nom>_<l|o>.fbx (l = boucle, o = une fois).',
    );
  }
  const name = match[1];
  const flag = match[2];
  if (name.trim().length === 0) {
    throw new Error(`Nom de clip vide dans "${fileName}".`);
  }
  return {
    id: fileName.slice(0, -'.fbx'.length),
    name,
    loop: flag === 'l',
    flag,
  };
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
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: { innerWidth: 800, innerHeight: 600 }, configurable: true, writable: true });
  try {
    const loader = new FBXLoader();
    const group = loader.parse(
      sourceBuffer.buffer.slice(sourceBuffer.byteOffset, sourceBuffer.byteOffset + sourceBuffer.byteLength),
      ''
    );
    return group.animations || [];
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else delete globalThis.window;
  }
}

/** Une piste de rig humanoïde : ni caméra/lumière, ni os technique `*_end`. */
export function isHumanoidTrack(trackName) {
  const node = trackName.split('.')[0];
  if (!node) return false;
  if (NON_HUMANOID.has(node)) return false;
  if (node.endsWith('_end')) return false;
  return true;
}

/**
 * Ramène une piste immobile à deux clés (début et fin). Aucune autre piste
 * n'est touchée : les clips animés gardent toutes leurs images.
 */
export function compactTrack(times, values, stride) {
  const keyCount = times.length;
  if (keyCount <= 2) return { times, values };

  let maxDeviation = 0;
  for (let key = 1; key < keyCount; key += 1) {
    for (let component = 0; component < stride; component += 1) {
      const deviation = Math.abs(values[key * stride + component] - values[component]);
      if (deviation > maxDeviation) maxDeviation = deviation;
      if (maxDeviation >= NEAR_CONSTANT_EPSILON) return { times, values };
    }
  }

  const lastOffset = (keyCount - 1) * stride;
  const compactTimes = new Float32Array([times[0], times[keyCount - 1]]);
  const compactValues = new Float32Array(stride * 2);
  for (let component = 0; component < stride; component += 1) {
    compactValues[component] = values[component];
    compactValues[stride + component] = values[lastOffset + component];
  }
  return { times: compactTimes, values: compactValues };
}

function serializeTrack(track, clipName) {
  const type = track.ValueTypeName;
  if (type !== 'vector' && type !== 'quaternion') {
    throw new Error(`Type de piste non supporté "${type}" (clip ${clipName}, piste ${track.name}).`);
  }
  const stride = type === 'quaternion' ? 4 : 3;
  const compacted = compactTrack(track.times, track.values, stride);
  return {
    name: track.name,
    type,
    interpolation: track.getInterpolation(),
    times: encodeFloat32Array(compacted.times),
    values: encodeFloat32Array(compacted.values),
  };
}

function serializeSourceFile(file) {
  const parsed = parseAnimationFileName(file.fileName);
  if (parsed.name === 'Idle' && !parsed.loop) {
    throw new Error(`Idle doit boucler : "${file.fileName}" porte le flag o.`);
  }

  const rawClips = parseFbxAnimations(file.buffer);
  if (rawClips.length !== 1) {
    throw new Error(
      `Le fichier "${file.fileName}" doit contenir exactement 1 clip, il en contient ${rawClips.length}.`,
    );
  }
  const clip = rawClips[0];
  if (!Number.isFinite(clip.duration) || clip.duration <= 0) {
    throw new Error(`Durée invalide pour "${file.fileName}" : ${clip.duration}.`);
  }

  const tracks = [];
  const trackNames = new Set();
  for (const track of clip.tracks) {
    if (!isHumanoidTrack(track.name)) continue;
    const serialized = serializeTrack(track, parsed.name);
    if (trackNames.has(serialized.name)) {
      throw new Error(`Piste dupliquée "${serialized.name}" dans "${file.fileName}".`);
    }
    trackNames.add(serialized.name);
    tracks.push(serialized);
  }
  if (tracks.length === 0) {
    throw new Error(`Aucune piste humanoïde dans "${file.fileName}".`);
  }

  const sourceSha256 = sha256Hex(file.buffer);
  return {
    id: parsed.id,
    name: parsed.name,
    loop: parsed.loop,
    sourceSha256,
    duration: clip.duration,
    blendMode: clip.blendMode ?? 2500,
    uuid: deterministicUuid(sourceSha256, parsed.name),
    tracks,
  };
}

/**
 * Lit un répertoire de sources. Un seul type de fichier autorisé : `.fbx`
 * (un `.gitkeep` vide est toléré). Tout autre fichier est refusé.
 */
export async function loadSourceFiles(sourcesDir) {
  const entries = await readdir(sourcesDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      throw new Error(`Entrée non régulière dans les sources d'animation : ${entry.name}.`);
    }
    if (entry.name === '.gitkeep') continue;
    if (extname(entry.name) !== '.fbx') {
      throw new Error(`Fichier inattendu dans les sources d'animation : ${entry.name}.`);
    }
    files.push({ fileName: entry.name, buffer: await readFile(join(sourcesDir, entry.name)) });
  }
  if (files.length === 0) {
    throw new Error(`Aucun fichier .fbx dans ${sourcesDir}.`);
  }
  return files.sort((a, b) => a.fileName.localeCompare(b.fileName));
}

function defaultThumbnails() {
  return { Men: null, Women: null };
}

/**
 * Construit le manifeste v2 et les deux packs à partir des fichiers sources.
 * Aucune liste de clips, aucun compte et aucun ordre ne sont codés en dur :
 * tout dérive des fichiers scannés et du flag de leur nom.
 */
export function generatePacks(files, options = {}) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('Aucun fichier source fourni.');
  }
  const thumbnailsById = options.thumbnailsById ?? new Map();

  const serialized = files.map(serializeSourceFile);
  serialized.sort((a, b) => a.id.localeCompare(b.id));

  const ids = new Set();
  const names = new Set();
  for (const clip of serialized) {
    if (ids.has(clip.id)) throw new Error(`Identifiant de clip dupliqué : ${clip.id}.`);
    if (names.has(clip.name)) throw new Error(`Nom de clip dupliqué : ${clip.name}.`);
    ids.add(clip.id);
    names.add(clip.name);
  }

  const idleClips = serialized.filter((clip) => clip.name === 'Idle');
  if (idleClips.length !== 1) {
    throw new Error(`Le clip Idle est obligatoire et unique, ${idleClips.length} trouvé(s).`);
  }

  const criticalClips = serialized.filter((clip) => clip.name === 'Idle');
  const deferredClips = serialized.filter((clip) => clip.name !== 'Idle');
  if (deferredClips.length === 0) {
    throw new Error('Le pack différé ne peut pas être vide.');
  }

  const toPackClip = (clip) => ({
    name: clip.name,
    duration: clip.duration,
    blendMode: clip.blendMode,
    uuid: clip.uuid,
    tracks: clip.tracks,
  });

  const idleJson = JSON.stringify({
    pack: 'idle',
    formatVersion: 2,
    clips: criticalClips.map(toPackClip),
  }, null, 2) + '\n';

  const deferredJson = JSON.stringify({
    pack: 'deferred',
    formatVersion: 2,
    clips: deferredClips.map(toPackClip),
  }, null, 2) + '\n';

  const idleSha256 = sha256Hex(Buffer.from(idleJson, 'utf8'));
  const deferredSha256 = sha256Hex(Buffer.from(deferredJson, 'utf8'));
  const idleByteLength = Buffer.byteLength(idleJson, 'utf8');
  const deferredByteLength = Buffer.byteLength(deferredJson, 'utf8');

  const manifestClips = serialized.map((clip) => ({
    id: clip.id,
    name: clip.name,
    loop: clip.loop,
    duration: clip.duration,
    pack: clip.name === 'Idle' ? 'idle' : 'deferred',
    thumbnails: thumbnailsById.get(clip.id) ?? defaultThumbnails(),
    sourceSha256: clip.sourceSha256,
  }));

  const manifest = {
    formatVersion: 2,
    threeVersion: THREE.REVISION,
    clips: manifestClips,
    critical: {
      name: 'idle',
      file: `idle.${idleSha256}.json`,
      url: `/animations/idle.${idleSha256}.json`,
      sha256: idleSha256,
      byteLength: idleByteLength,
      clips: criticalClips.map((clip) => clip.name),
    },
    deferred: {
      name: 'deferred',
      file: `deferred.${deferredSha256}.json`,
      url: `/animations/deferred.${deferredSha256}.json`,
      sha256: deferredSha256,
      byteLength: deferredByteLength,
      clips: deferredClips.map((clip) => clip.name),
    },
  };

  return {
    manifest,
    manifestJson: JSON.stringify(manifest, null, 2) + '\n',
    idleSha256,
    idleJson,
    deferredSha256,
    deferredJson,
    serialized,
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

async function discoverThumbnails(outDir) {
  const map = new Map();
  const directory = join(outDir, 'thumbnails');
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return map;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isFile()) throw new Error(`Entrée non régulière dans les vignettes : ${entry.name}.`);
    const match = /^(.+)_(Men|Women)\.(?:png|webp|jpg|jpeg)$/.exec(entry.name);
    if (!match) throw new Error(`Vignette d'animation inattendue : ${entry.name}.`);
    const [, id, gender] = match;
    const current = map.get(id) ?? defaultThumbnails();
    current[gender] = `/animations/thumbnails/${entry.name}`;
    map.set(id, current);
  }
  return map;
}

export async function runCli(argv = process.argv.slice(2)) {
  const getArg = name => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const sourcesDir = resolve(getArg('--sources') ?? join(frontend, '../beercall-backend/static/models/animations/sources'));
  const outDirArg = getArg('--out');
  const resolvedOut = resolve(outDirArg ?? join(frontend, 'public/animations'));
  const isCheck = argv.includes('--check');

  const approvedTemporaryRoots = [
    resolve(frontend, '../bench/.runtime/remediation'),
    resolve(process.env.LOCALAPPDATA || 'C:/Users/Migz3rrr/AppData/Local', 'Temp/opencode'),
  ];
  const isWithin = (parent, child) => {
    const rel = relative(parent, child);
    return !!rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
  };
  if (resolvedOut !== join(frontend, 'public/animations') && !approvedTemporaryRoots.some(root => isWithin(root, resolvedOut))) {
    throw new Error('Unauthorized destination directory');
  }
  // Inspect existing ancestors as well as leaves; junctions must not escape an approved root.
  for (let path = resolvedOut; ; path = dirname(path)) {
    try { if ((await lstat(path)).isSymbolicLink()) throw new Error(`Destination contains a symbolic link/junction: ${path}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (path === dirname(path)) break;
  }

  const files = await loadSourceFiles(sourcesDir);
  const thumbnailsById = await discoverThumbnails(resolvedOut);
  const { manifestJson, idleSha256, idleJson, deferredSha256, deferredJson } = generatePacks(files, { thumbnailsById });

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

    console.log(`Check passed: all animation packs in ${resolvedOut} match sources in ${sourcesDir}.`);
    return;
  }

  let dirEntries = [];
  try {
    dirEntries = await readdir(resolvedOut);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await mkdir(resolvedOut, { recursive: true });
    } else {
      throw error;
    }
  }

  // Anciennes générations hachées autorisées ; les vignettes vivent dans un sous-dossier.
  const isAllowedFile = name =>
    name === 'manifest.json' ||
    name === '.gitkeep' ||
    /^(idle|deferred)\.[a-f0-9]{64}\.json$/.test(name);

  const foreign = dirEntries.filter(name => !isAllowedFile(name) && name !== 'thumbnails');
  if (foreign.length > 0) {
    throw new Error(`Destination directory contains foreign files: ${foreign.join(', ')}`);
  }
  for (const name of dirEntries) {
    const entryStat = await lstat(join(resolvedOut, name));
    if (name === 'thumbnails') {
      if (!entryStat.isDirectory()) throw new Error(`Destination entry is not a directory: ${name}`);
      continue;
    }
    if (!entryStat.isFile()) throw new Error(`Destination entry is not a regular file: ${name}`);
  }

  for (const [name, content] of [[idleFileName, idleJson], [deferredFileName, deferredJson]]) {
    try {
      await writeFile(join(resolvedOut, name), content, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if ((await readFile(join(resolvedOut, name), 'utf8')) !== content) throw new Error(`Existing hashed pack differs: ${name}`);
    }
  }
  await writeFile(join(resolvedOut, 'manifest.json'), manifestJson, 'utf8');

  console.log(`Generated animation packs in ${resolvedOut}:`);
  console.log(`  sources: ${files.length} clips (${basename(sourcesDir)})`);
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
