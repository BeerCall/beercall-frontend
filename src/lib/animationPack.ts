import * as THREE from 'three';
import type {
  AnimationClipEntry,
  AnimationGender,
  AnimationManifest,
  AnimationPackManager,
  ClipThumbnails,
  PackMetadata,
  SerializedClip,
  SerializedPack,
  SerializedTrack,
} from '../types/animationPack';

const HEX_64_REGEX = /^[0-9a-f]{64}$/;
/** Scene nodes that are not part of the humanoid rig and must not reach a part mixer. */
const NON_HUMANOID = new Set(['Camera', 'Camera001', 'CharacterArmature', 'Light', 'Light001']);
const DEFAULT_LOOP_CLIP = 'Idle';
const THUMBNAIL_PREFIX = '/animations/thumbnails/';
const GENDERS: readonly AnimationGender[] = Object.freeze(['Men', 'Women']);
export const ANIMATION_BYTE_LIMITS = Object.freeze({ manifest: 64 * 1024, idle: 1024 * 1024, deferred: 8 * 1024 * 1024 });
const UUID_REGEX = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

function base64ByteLength(value: string): number {
  if (!value || value.length % 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('Invalid canonical base64 payload');
  }
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  if ((padding === 2 && (alphabet.indexOf(value.at(-3)!) & 15)) ||
      (padding === 1 && (alphabet.indexOf(value.at(-2)!) & 3))) {
    throw new Error('Invalid canonical base64 padding');
  }
  const length = value.length / 4 * 3 - padding;
  if (length % 4) throw new Error(`Invalid f32le-base64 payload length: ${length} bytes is not a multiple of 4`);
  return length;
}

/** Compare deux catalogues comme des ensembles : aucun ordre n'est imposé. */
function sameNameSet(actual: readonly string[], expected: readonly string[]): boolean {
  if (actual.length !== expected.length) return false;
  const actualSet = new Set(actual);
  if (actualSet.size !== actual.length) return false;
  return expected.every(name => actualSet.has(name));
}

export function decodeFloat32Array(base64Str: string): Float32Array {
  base64ByteLength(base64Str);
  const binaryString = atob(base64Str);
  const len = binaryString.length;
  if (len % 4 !== 0) {
    throw new Error(`Invalid f32le-base64 payload length: ${len} bytes is not a multiple of 4`);
  }

  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = len / 4;
  const out = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const val = view.getFloat32(i * 4, true);
    if (!Number.isFinite(val)) {
      throw new Error(`Invalid non-finite float32 value at index ${i}: ${val}`);
    }
    out[i] = val;
  }

  return out;
}

export function validateUrl(url: string, expectedFileName: string): void {
  if (typeof url !== 'string' || !url.startsWith('/animations/')) {
    throw new Error(`URL must start with /animations/: got "${url}"`);
  }
  if (url.includes('..') || url.includes(':') || url.includes('//')) {
    throw new Error(`URL contains invalid path traversal or protocol: "${url}"`);
  }
  if (url !== `/animations/${expectedFileName}` || /[%\\?#]/.test(url)) {
    throw new Error(`URL does not match expected file name "${expectedFileName}": "${url}"`);
  }
}

export function validateThumbnails(value: unknown, clipName: string): ClipThumbnails {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Thumbnails for clip "${clipName}" must be an object`);
  }
  const record = value as Record<string, unknown>;
  const thumbnails: Record<AnimationGender, string | null> = { Men: null, Women: null };
  for (const gender of GENDERS) {
    const url = record[gender];
    if (url === undefined || url === null) continue;
    if (typeof url !== 'string' || !url.startsWith(THUMBNAIL_PREFIX) || url.includes('..') || /[\\?#%]/.test(url)) {
      throw new Error(`Invalid ${gender} thumbnail for clip "${clipName}": "${String(url)}"`);
    }
    thumbnails[gender] = url;
  }
  return Object.freeze(thumbnails);
}

export function validateClipEntry(value: unknown): AnimationClipEntry {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Manifest clip entry must be an object');
  }
  const entry = value as Record<string, unknown>;

  if (typeof entry.id !== 'string' || entry.id.length === 0) {
    throw new Error('Manifest clip id must be a non-empty string');
  }
  if (typeof entry.name !== 'string' || entry.name.trim().length === 0) {
    throw new Error(`Invalid clip name in manifest for id "${entry.id}"`);
  }
  if (typeof entry.loop !== 'boolean') {
    throw new Error(`Clip "${entry.name}" must declare a boolean loop flag`);
  }
  if (typeof entry.duration !== 'number' || !Number.isFinite(entry.duration) || entry.duration <= 0) {
    throw new Error(`Invalid duration for clip "${entry.name}": ${entry.duration}`);
  }
  const expectedPack = entry.name === DEFAULT_LOOP_CLIP ? 'idle' : 'deferred';
  if (entry.pack !== expectedPack) {
    throw new Error(`Clip "${entry.name}" must belong to pack "${expectedPack}", got "${entry.pack}"`);
  }
  if (entry.name === DEFAULT_LOOP_CLIP && entry.loop !== true) {
    throw new Error(`Clip "${DEFAULT_LOOP_CLIP}" must loop`);
  }
  if (typeof entry.sourceSha256 !== 'string' || !HEX_64_REGEX.test(entry.sourceSha256)) {
    throw new Error(`Invalid sourceSha256 for clip "${entry.name}"`);
  }

  return Object.freeze({
    id: entry.id,
    name: entry.name,
    loop: entry.loop,
    duration: entry.duration,
    pack: expectedPack,
    thumbnails: validateThumbnails(entry.thumbnails, entry.name),
    sourceSha256: entry.sourceSha256,
  });
}

export function validatePackMetadata(meta: unknown, expectedName: 'idle' | 'deferred'): PackMetadata {
  if (typeof meta !== 'object' || meta === null) {
    throw new Error(`Pack metadata for "${expectedName}" must be an object`);
  }

  const m = meta as Record<string, unknown>;

  if (m.name !== expectedName) {
    throw new Error(`Pack name mismatch: expected "${expectedName}", got "${m.name}"`);
  }

  if (typeof m.file !== 'string' || !m.file.startsWith(`${expectedName}.`) || !m.file.endsWith('.json')) {
    throw new Error(`Invalid pack file name for "${expectedName}": "${m.file}"`);
  }

  if (typeof m.url !== 'string') {
    throw new Error(`Pack URL for "${expectedName}" must be a string`);
  }
  validateUrl(m.url, m.file);

  if (typeof m.sha256 !== 'string' || !HEX_64_REGEX.test(m.sha256)) {
    throw new Error(`Invalid pack sha256 for "${expectedName}": "${m.sha256}"`);
  }
  if (m.file !== `${expectedName}.${m.sha256}.json`) {
    throw new Error(`Pack file name does not match sha256 for "${expectedName}"`);
  }

  if (typeof m.byteLength !== 'number' || !Number.isSafeInteger(m.byteLength) || m.byteLength <= 0 || m.byteLength > ANIMATION_BYTE_LIMITS[expectedName]) {
    throw new Error(`Invalid pack byteLength for "${expectedName}": "${m.byteLength}"`);
  }

  if (!Array.isArray(m.clips) || m.clips.length === 0) {
    throw new Error(`Pack clips for "${expectedName}" must be a non-empty array of strings`);
  }

  for (const c of m.clips) {
    if (typeof c !== 'string' || c.length === 0) {
      throw new Error(`Invalid clip name in pack "${expectedName}": ${c}`);
    }
  }

  if (expectedName === 'idle') {
    if (m.clips.length !== 1 || m.clips[0] !== DEFAULT_LOOP_CLIP) {
      throw new Error(`Critical idle pack must contain exactly ['${DEFAULT_LOOP_CLIP}'], got ${JSON.stringify(m.clips)}`);
    }
  } else if (m.clips.includes(DEFAULT_LOOP_CLIP)) {
    throw new Error(`Deferred pack must not contain critical clip '${DEFAULT_LOOP_CLIP}'`);
  }

  return Object.freeze({
    name: expectedName,
    file: m.file,
    url: m.url,
    sha256: m.sha256,
    byteLength: m.byteLength,
    clips: Object.freeze([...m.clips] as string[]),
  });
}

export function validateManifest(data: unknown): AnimationManifest {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Manifest must be a non-null object');
  }

  const m = data as Record<string, unknown>;

  if (m.formatVersion !== 2) {
    throw new Error(`Unsupported manifest formatVersion: expected 2, got ${m.formatVersion}`);
  }

  if (typeof m.threeVersion !== 'string' || m.threeVersion !== THREE.REVISION) {
    throw new Error(`Invalid threeVersion: expected "${THREE.REVISION}", got "${m.threeVersion}"`);
  }

  if (!Array.isArray(m.clips) || m.clips.length === 0) {
    throw new Error('Manifest clips must be a non-empty array');
  }

  const clips: AnimationClipEntry[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const rawEntry of m.clips) {
    const entry = validateClipEntry(rawEntry);
    if (ids.has(entry.id)) throw new Error(`Duplicate clip id in manifest: "${entry.id}"`);
    if (names.has(entry.name)) throw new Error(`Duplicate clip name in manifest: "${entry.name}"`);
    ids.add(entry.id);
    names.add(entry.name);
    clips.push(entry);
  }

  const idleEntries = clips.filter(entry => entry.name === DEFAULT_LOOP_CLIP);
  if (idleEntries.length !== 1) {
    throw new Error(`Manifest clips must include critical clip "${DEFAULT_LOOP_CLIP}" exactly once`);
  }
  const criticalNames = clips.filter(entry => entry.pack === 'idle').map(entry => entry.name);
  const deferredNames = clips.filter(entry => entry.pack === 'deferred').map(entry => entry.name);
  if (criticalNames.length !== 1 || criticalNames[0] !== DEFAULT_LOOP_CLIP) {
    throw new Error(`Manifest critical pack must contain only "${DEFAULT_LOOP_CLIP}"`);
  }
  if (deferredNames.length === 0) {
    throw new Error('Manifest deferred pack must not be empty');
  }

  const critical = validatePackMetadata(m.critical, 'idle');
  const deferred = validatePackMetadata(m.deferred, 'deferred');

  if (!sameNameSet(critical.clips, criticalNames)) {
    throw new Error('Critical pack clips do not match manifest idle entries');
  }
  if (!sameNameSet(deferred.clips, deferredNames)) {
    throw new Error('Deferred pack clips do not match manifest deferred entries');
  }

  return Object.freeze({
    formatVersion: 2,
    threeVersion: m.threeVersion,
    clips: Object.freeze(clips) as readonly AnimationClipEntry[],
    critical,
    deferred,
  });
}

export async function computeSha256Hex(
  data: ArrayBuffer | Uint8Array,
  subtle?: SubtleCrypto
): Promise<string> {
  const cryptoSubtle = subtle || globalThis.crypto?.subtle;
  if (!cryptoSubtle || typeof cryptoSubtle.digest !== 'function') {
    throw new Error('Web Crypto API (SubtleCrypto.digest) is required for SHA-256 verification');
  }

  // Own ArrayBuffer, including when the input view starts at a nonzero offset.
  const bytes = new Uint8Array(data instanceof Uint8Array ? data : new Uint8Array(data));
  const hashBuffer = await cryptoSubtle.digest('SHA-256', bytes);
  const hashBytes = new Uint8Array(hashBuffer);

  let hex = '';
  for (let i = 0; i < hashBytes.length; i++) {
    hex += hashBytes[i].toString(16).padStart(2, '0');
  }
  return hex.toLowerCase();
}

export async function verifySha256(
  data: ArrayBuffer | Uint8Array,
  expectedSha256: string,
  subtle?: SubtleCrypto
): Promise<boolean> {
  const actual = await computeSha256Hex(data, subtle);
  return actual === expectedSha256.toLowerCase();
}

export function validateSerializedTrack(track: unknown, clipName: string): SerializedTrack {
  if (typeof track !== 'object' || track === null) {
    throw new Error(`Track in clip "${clipName}" must be an object`);
  }

  const t = track as Record<string, unknown>;

  if (typeof t.name !== 'string' || t.name.length === 0) {
    throw new Error(`Invalid track name in clip "${clipName}"`);
  }

  if (t.type !== 'vector' && t.type !== 'quaternion') {
    throw new Error(`Unsupported track type "${t.type}" in clip "${clipName}", track "${t.name}"`);
  }

  if (t.interpolation !== THREE.InterpolateLinear) {
    throw new Error(`Invalid track interpolation in clip "${clipName}", track "${t.name}"`);
  }

  if (typeof t.times !== 'string' || t.times.length === 0) {
    throw new Error(`Missing times base64 in clip "${clipName}", track "${t.name}"`);
  }

  if (typeof t.values !== 'string' || t.values.length === 0) {
    throw new Error(`Missing values base64 in clip "${clipName}", track "${t.name}"`);
  }
  const timeBytes = base64ByteLength(t.times);
  const valueBytes = base64ByteLength(t.values);
  if (valueBytes !== timeBytes * (t.type === 'vector' ? 3 : 4)) {
    throw new Error(`Truncated track values in clip "${clipName}", track "${t.name}"`);
  }

  return {
    name: t.name,
    type: t.type,
    interpolation: t.interpolation,
    times: t.times,
    values: t.values,
  };
}

export function validateSerializedClip(clip: unknown): SerializedClip {
  if (typeof clip !== 'object' || clip === null) {
    throw new Error('Serialized clip must be an object');
  }

  const c = clip as Record<string, unknown>;

  if (typeof c.name !== 'string' || c.name.length === 0) {
    throw new Error('Clip name must be a non-empty string');
  }

  if (typeof c.duration !== 'number' || !Number.isFinite(c.duration) || c.duration <= 0) {
    throw new Error(`Invalid clip duration for "${c.name}": ${c.duration}`);
  }

  if (c.blendMode !== THREE.NormalAnimationBlendMode) {
    throw new Error(`Invalid clip blendMode for "${c.name}": ${c.blendMode}`);
  }

  if (typeof c.uuid !== 'string' || !UUID_REGEX.test(c.uuid)) {
    throw new Error(`Missing or invalid uuid for clip "${c.name}"`);
  }

  if ('fps' in c) throw new Error('fps must not be serialized');
  if (!Array.isArray(c.tracks) || c.tracks.length === 0) {
    throw new Error(`Clip "${c.name}" must contain at least one track`);
  }

  const tracks: SerializedTrack[] = [];
  const trackNames = new Set<string>();

  for (const rawTrack of c.tracks) {
    const validTrack = validateSerializedTrack(rawTrack, c.name);
    if (trackNames.has(validTrack.name)) {
      throw new Error(`Duplicate track name "${validTrack.name}" in clip "${c.name}"`);
    }
    trackNames.add(validTrack.name);
    tracks.push(validTrack);
  }

  return {
    name: c.name,
    duration: c.duration,
    blendMode: c.blendMode,
    uuid: c.uuid,
    tracks,
  };
}

export function parseAndValidatePack(
  rawBytes: Uint8Array | ArrayBuffer,
  expectedType: 'idle' | 'deferred',
  manifest: AnimationManifest
): SerializedPack {
  const bytes = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes);
  if (bytes.byteLength > ANIMATION_BYTE_LIMITS[expectedType]) throw new Error('Pack exceeds byte limit');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Failed to parse JSON for ${expectedType} pack: ${(err as Error).message}`);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`Invalid pack format: expected object for ${expectedType} pack`);
  }

  const p = parsed as Record<string, unknown>;

  if (p.pack !== expectedType) {
    throw new Error(`Pack type mismatch: expected "${expectedType}", got "${p.pack}"`);
  }

  if (p.formatVersion !== 2) {
    throw new Error(`Unsupported pack formatVersion: expected 2, got ${p.formatVersion}`);
  }

  if (!Array.isArray(p.clips)) {
    throw new Error(`Pack "${expectedType}" must contain a clips array`);
  }

  const expectedEntries = manifest.clips.filter(entry => entry.pack === expectedType);
  const expectedNames = expectedEntries.map(entry => entry.name);
  const durations = new Map(expectedEntries.map(entry => [entry.name, entry.duration]));

  if (p.clips.length !== expectedNames.length) {
    throw new Error(`Pack "${expectedType}" must contain ${expectedNames.length} clips, got ${p.clips.length}`);
  }

  const clips: SerializedClip[] = [];
  const clipNames: string[] = [];

  for (const rawClip of p.clips) {
    const validClip = validateSerializedClip(rawClip);
    if (clipNames.includes(validClip.name)) {
      throw new Error(`Duplicate clip "${validClip.name}" in ${expectedType} pack`);
    }
    const expectedDuration = durations.get(validClip.name);
    if (expectedDuration === undefined) {
      throw new Error(`Unexpected clip "${validClip.name}" in ${expectedType} pack`);
    }
    if (Math.abs(validClip.duration - expectedDuration) > 1e-6) {
      throw new Error(`Clip "${validClip.name}" duration mismatch in ${expectedType} pack`);
    }
    clipNames.push(validClip.name);
    clips.push(validClip);
  }

  if (!sameNameSet(clipNames, expectedNames)) {
    throw new Error(`Pack "${expectedType}" clip catalogue does not match the manifest`);
  }
  if (expectedType === 'idle' && (clips.length !== 1 || clips[0].name !== DEFAULT_LOOP_CLIP)) {
    throw new Error(`Critical idle pack must contain exactly '${DEFAULT_LOOP_CLIP}'`);
  }
  if (expectedType === 'deferred' && clipNames.includes(DEFAULT_LOOP_CLIP)) {
    throw new Error(`Deferred pack must not contain critical clip '${DEFAULT_LOOP_CLIP}'`);
  }

  return {
    pack: expectedType,
    formatVersion: 2,
    clips,
  };
}

export function decodeSingleClip(serialized: SerializedClip): THREE.AnimationClip {
  const valid = validateSerializedClip(serialized);
  const parsedTracks = valid.tracks.map(t => {
    const times = decodeFloat32Array(t.times);
    const values = decodeFloat32Array(t.values);
    for (let i = 0; i < times.length; i++) {
      if (times[i] < 0 || times[i] > valid.duration + 1e-6 || (i > 0 && times[i] < times[i - 1])) {
        throw new Error(`Invalid track times in "${valid.name}"`);
      }
    }
    return {
      name: t.name,
      type: t.type,
      interpolation: t.interpolation,
      times,
      values,
    };
  });

  // Keep the humanoid tracks only: camera and light curves would fail to bind on a part rig.
  // Published GLBs also omit Blender leaf bones (`*_end`) that the PoC FBX sources keep.
  const humanoidTracks = parsedTracks.filter((track) => {
    const node = track.name.split('.')[0];
    return Boolean(node) && !NON_HUMANOID.has(node) && !node.endsWith('_end');
  });

  // Note: fps is intentionally omitted so AnimationClip.parse does not scale times by (1/fps)
  return THREE.AnimationClip.parse({
    name: serialized.name,
    duration: serialized.duration,
    blendMode: serialized.blendMode as THREE.AnimationBlendMode,
    uuid: serialized.uuid,
    tracks: humanoidTracks as unknown as THREE.KeyframeTrackJSON[],
  });
}

export class AnimationPackManagerImpl implements AnimationPackManager {
  readonly manifest: AnimationManifest;
  readonly criticalClip: THREE.AnimationClip;
  readonly clipNames: readonly string[];

  private readonly entries = new Map<string, AnimationClipEntry>();
  private readonly decodedClips = new Map<string, THREE.AnimationClip>();
  private readonly rawDeferredClips = new Map<string, SerializedClip>();
  private deferredLoaded = false;

  constructor(manifest: AnimationManifest, criticalClip: THREE.AnimationClip) {
    this.manifest = manifest;
    this.criticalClip = criticalClip;
    for (const entry of manifest.clips) this.entries.set(entry.name, entry);
    this.clipNames = Object.freeze(manifest.clips.map(entry => entry.name));

    this.decodedClips.set(criticalClip.name, criticalClip);
  }

  hasClip(name: string): boolean {
    return this.entries.has(name);
  }

  getClipEntry(name: string): AnimationClipEntry | undefined {
    return this.entries.get(name);
  }

  isLoop(name: string): boolean {
    return this.entries.get(name)?.loop ?? false;
  }

  isClipDecoded(name: string): boolean {
    return this.decodedClips.has(name);
  }

  isDeferredLoaded(): boolean {
    return this.deferredLoaded;
  }

  async loadDeferredPack(
    rawBytes: Uint8Array | ArrayBuffer,
    subtle?: SubtleCrypto
  ): Promise<void> {
    const bytes = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes);

    if (bytes.byteLength !== this.manifest.deferred.byteLength) {
      throw new Error(
        `Deferred pack byteLength mismatch: expected ${this.manifest.deferred.byteLength}, got ${bytes.byteLength}`
      );
    }

    const shaMatches = await verifySha256(bytes, this.manifest.deferred.sha256, subtle);
    if (!shaMatches) {
      throw new Error(`Deferred pack SHA-256 verification failed`);
    }

    const pack = parseAndValidatePack(bytes, 'deferred', this.manifest);
    if (!sameNameSet(pack.clips.map(clip => clip.name), this.manifest.deferred.clips)) {
      throw new Error('Deferred catalogue mismatch');
    }
    if (this.deferredLoaded) return;

    // CHAL-05 Lazy Decoding: store serialized clips in memory, DO NOT decode them all now!
    for (const clip of pack.clips) {
      this.rawDeferredClips.set(clip.name, clip);
    }

    this.deferredLoaded = true;
  }

  getClip(name: string): THREE.AnimationClip {
    if (this.decodedClips.has(name)) {
      return this.decodedClips.get(name)!;
    }

    if (this.rawDeferredClips.has(name)) {
      const rawClip = this.rawDeferredClips.get(name)!;
      const decoded = decodeSingleClip(rawClip);
      this.decodedClips.set(name, decoded);
      return decoded;
    }

    if (!this.hasClip(name)) {
      throw new Error(`Unknown animation clip requested: "${name}"`);
    }

    throw new Error(`Animation clip "${name}" is deferred and not yet loaded`);
  }
}

export async function createAnimationPackManager(
  manifestData: unknown,
  criticalBytes: Uint8Array | ArrayBuffer,
  subtle?: SubtleCrypto
): Promise<AnimationPackManager> {
  const manifest = validateManifest(manifestData);
  const bytes = criticalBytes instanceof Uint8Array ? criticalBytes : new Uint8Array(criticalBytes);

  if (bytes.byteLength !== manifest.critical.byteLength) {
    throw new Error(
      `Critical pack byteLength mismatch: expected ${manifest.critical.byteLength}, got ${bytes.byteLength}`
    );
  }

  const shaMatches = await verifySha256(bytes, manifest.critical.sha256, subtle);
  if (!shaMatches) {
    throw new Error(`Critical pack SHA-256 verification failed`);
  }

  const criticalPack = parseAndValidatePack(bytes, 'idle', manifest);
  const criticalClip = decodeSingleClip(criticalPack.clips[0]);

  return new AnimationPackManagerImpl(manifest, criticalClip);
}
