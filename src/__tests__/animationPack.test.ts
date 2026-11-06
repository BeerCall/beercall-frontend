import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { webcrypto, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as THREE from 'three';
import {
  decodeFloat32Array,
  validateUrl,
  validateManifest,
  computeSha256Hex,
  verifySha256,
  parseAndValidatePack,
  decodeSingleClip,
  createAnimationPackManager,
  validateSerializedTrack,
  ANIMATION_BYTE_LIMITS,
} from '../lib/animationPack';
import type { AnimationClipEntry, AnimationManifest } from '../types/animationPack';

const ANIMATIONS_DIR = resolve(__dirname, '../../public/animations');
const HEX_A = 'a'.repeat(64);
const HEX_B = 'b'.repeat(64);

let realManifest: AnimationManifest;

function packMetadata(name: 'idle' | 'deferred', sha: string, clips: string[], byteLength: number) {
  return {
    name,
    file: `${name}.${sha}.json`,
    url: `/animations/${name}.${sha}.json`,
    sha256: sha,
    byteLength,
    clips,
  };
}

function entry(name: string, overrides: Partial<AnimationClipEntry> = {}): AnimationClipEntry {
  return {
    id: `Anim_${name}_l`,
    name,
    loop: true,
    duration: 1,
    pack: name === 'Idle' ? 'idle' : 'deferred',
    thumbnails: { Men: null, Women: null },
    sourceSha256: HEX_A,
    ...overrides,
  };
}

describe('animationPack', () => {
  beforeAll(async () => {
    vi.stubGlobal('crypto', webcrypto);
    realManifest = validateManifest(JSON.parse(await readFile(resolve(ANIMATIONS_DIR, 'manifest.json'), 'utf8')));
  });
  afterAll(() => vi.unstubAllGlobals());

  describe('decodeFloat32Array', () => {
    it('preserves -0.0 and distinguishes it from +0.0', () => {
      const buf = new ArrayBuffer(16);
      const view = new DataView(buf);
      view.setFloat32(0, -0.0, true);
      view.setFloat32(4, 0.0, true);
      view.setFloat32(8, 1.25, true);
      view.setFloat32(12, -42.5, true);

      const uint8 = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
      const decoded = decodeFloat32Array(btoa(binary));

      expect(decoded.length).toBe(4);
      expect(Object.is(decoded[0], -0.0)).toBe(true);
      expect(1 / decoded[0]).toBe(-Infinity);
      expect(Object.is(decoded[1], 0.0)).toBe(true);
      expect(1 / decoded[1]).toBe(Infinity);
      expect(decoded[2]).toBe(1.25);
      expect(decoded[3]).toBe(-42.5);
    });

    it('rejects base64 payload when decoded byte length is not a multiple of 4', () => {
      expect(() => decodeFloat32Array('AAA=')).toThrow(/not a multiple of 4/);
    });

    it('rejects non-finite float32 values (NaN, Infinity)', () => {
      const buf = new ArrayBuffer(4);
      new DataView(buf).setFloat32(0, NaN, true);
      const uint8 = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
      expect(() => decodeFloat32Array(btoa(binary))).toThrow(/non-finite float32 value/);
    });
  });

  describe('validateUrl', () => {
    it('accepts valid relative URLs under /animations/', () => {
      expect(() => validateUrl('/animations/idle.abc.json', 'idle.abc.json')).not.toThrow();
      expect(() => validateUrl('/animations/deferred.xyz.json', 'deferred.xyz.json')).not.toThrow();
    });

    it('rejects URLs not starting with /animations/', () => {
      expect(() => validateUrl('https://evil.com/animations/idle.json', 'idle.json')).toThrow(/must start with \/animations\//);
      expect(() => validateUrl('/other/idle.json', 'idle.json')).toThrow(/must start with \/animations\//);
    });

    it('rejects URLs with path traversal or protocols', () => {
      expect(() => validateUrl('/animations/../idle.json', 'idle.json')).toThrow(/path traversal/);
      expect(() => validateUrl('/animations/http://evil.com/idle.json', 'idle.json')).toThrow(/path traversal/);
      expect(() => validateUrl('/animations//idle.json', 'idle.json')).toThrow(/path traversal/);
    });

    it('rejects URLs that do not match expected file name', () => {
      expect(() => validateUrl('/animations/wrong.json', 'idle.json')).toThrow(/does not match expected file name/);
    });
  });

  describe('validateManifest', () => {
    it('accepts the real manifest and preserves loop flags', () => {
      expect(realManifest.formatVersion).toBe(2);
      expect(realManifest.clips.length).toBeGreaterThan(1);
      expect(realManifest.clips.filter(clip => clip.name === 'Idle')).toHaveLength(1);
      expect(realManifest.clips.find(clip => clip.name === 'Wave')?.loop).toBe(true);
      expect(realManifest.clips.find(clip => clip.name === 'Death')?.loop).toBe(false);
      expect(realManifest.critical.clips).toEqual(['Idle']);
      expect(realManifest.deferred.clips).not.toContain('Idle');
    });

    it('accepts a thumbnail entry {url, sha256, bytes, width, height}', () => {
      const thumbnail = {
        url: '/animations/thumbnails/Anim_Idle_l_Men.webp',
        sha256: 'c'.repeat(64),
        bytes: 1234,
        width: 192,
        height: 192,
      };
      const clips = realManifest.clips.map((clip, index) => (
        index === 0
          ? { ...clip, thumbnails: { ...clip.thumbnails, Men: thumbnail } }
          : clip
      ));
      const validated = validateManifest({ ...realManifest, clips });
      expect(validated.clips[0].thumbnails.Men).toEqual(thumbnail);
    });

    it('rejects invalid thumbnail dimensions and sha256', () => {
      const thumbnail = {
        url: '/animations/thumbnails/Anim_Idle_l_Men.webp',
        sha256: 'c'.repeat(64),
        bytes: 1234,
        width: 192,
        height: 192,
      };
      const withThumbnail = (next: Record<string, unknown>) => ({
        ...realManifest,
        clips: realManifest.clips.map((clip, index) => (
          index === 0
            ? { ...clip, thumbnails: { ...clip.thumbnails, Men: next } }
            : clip
        )),
      });
      expect(() => validateManifest(withThumbnail({ ...thumbnail, width: 256 }))).toThrow(/dimensions/);
      expect(() => validateManifest(withThumbnail({ ...thumbnail, sha256: 'bad' }))).toThrow(/sha256/);
      expect(() => validateManifest(withThumbnail({ ...thumbnail, url: '/other/x.webp' }))).toThrow(/URL/);
    });

    it('accepts a manifest with an arbitrary catalogue, without any hardcoded list or count', () => {
      const synthetic = {
        formatVersion: 2,
        threeVersion: realManifest.threeVersion,
        clips: [
          entry('Custom_Clip', { id: 'Anim_Custom_Clip_o', loop: false }),
          entry('Idle'),
        ],
        critical: packMetadata('idle', HEX_A, ['Idle'], 10),
        deferred: packMetadata('deferred', HEX_B, ['Custom_Clip'], 20),
      };
      const validated = validateManifest(synthetic);
      expect(validated.clips.map(clip => clip.name)).toEqual(['Custom_Clip', 'Idle']);
      expect(validated.clips[0].loop).toBe(false);
      expect(validated.deferred.clips).toEqual(['Custom_Clip']);
    });

    it('rejects unsupported formatVersion', () => {
      expect(() => validateManifest({ ...realManifest, formatVersion: 1 })).toThrow(/Unsupported manifest formatVersion/);
    });

    it('rejects invalid sourceSha256 on a clip', () => {
      const invalid = {
        ...realManifest,
        clips: [{ ...realManifest.clips[0], sourceSha256: 'not-a-sha256' }, ...realManifest.clips.slice(1)],
      };
      expect(() => validateManifest(invalid)).toThrow(/Invalid sourceSha256/);
    });

    it('rejects a manifest without Idle', () => {
      const withoutIdle = realManifest.clips.filter(clip => clip.name !== 'Idle');
      const invalid = {
        ...realManifest,
        clips: withoutIdle,
        critical: packMetadata('idle', HEX_A, ['Walk'], 10),
        deferred: packMetadata('deferred', HEX_B, withoutIdle.map(clip => clip.name), 20),
      };
      expect(() => validateManifest(invalid)).toThrow(/must include critical clip "Idle"/);
    });

    it('rejects duplicate clip names and ids', () => {
      const duplicateName = {
        ...realManifest,
        clips: [...realManifest.clips, { ...realManifest.clips[1], id: 'Anim_Autre_l' }],
      };
      expect(() => validateManifest(duplicateName)).toThrow(/Duplicate clip name/);

      const duplicateId = {
        ...realManifest,
        clips: [...realManifest.clips, { ...realManifest.clips[1], name: 'Autre' }],
      };
      expect(() => validateManifest(duplicateId)).toThrow(/Duplicate clip id/);
    });

    it('rejects critical pack missing Idle', () => {
      const invalid = {
        ...realManifest,
        critical: { ...realManifest.critical, clips: ['Walk'] },
      };
      expect(() => validateManifest(invalid)).toThrow(/Critical idle pack must contain exactly \['Idle'\]/);
    });

    it('rejects deferred pack containing Idle', () => {
      const invalid = {
        ...realManifest,
        deferred: { ...realManifest.deferred, clips: [...realManifest.deferred.clips, 'Idle'] },
      };
      expect(() => validateManifest(invalid)).toThrow(/Deferred pack must not contain critical clip 'Idle'/);
    });

    it('does not impose any clip order', () => {
      expect(() => validateManifest({ ...realManifest, clips: [...realManifest.clips].reverse() })).not.toThrow();
    });
  });

  describe('Web Crypto SHA-256 verification', () => {
    it('verifies SHA-256 with explicit test crypto', async () => {
      const testData = new TextEncoder().encode('BeerCall Fluidite 2026');
      const hashHex = await computeSha256Hex(testData, globalThis.crypto.subtle);
      expect(hashHex).toMatch(/^[0-9a-f]{64}$/);
      expect(hashHex).toBe(createHash('sha256').update(testData).digest('hex'));
      expect(await verifySha256(testData, hashHex, globalThis.crypto.subtle)).toBe(true);
      expect(await verifySha256(testData, '0'.repeat(64), globalThis.crypto.subtle)).toBe(false);
    });

    it('verifies SHA-256 on real manifest and packs from disk', async () => {
      const idleBytes = await readFile(resolve(ANIMATIONS_DIR, realManifest.critical.file));
      expect(await verifySha256(idleBytes, realManifest.critical.sha256, globalThis.crypto.subtle)).toBe(true);
      const deferredBytes = await readFile(resolve(ANIMATIONS_DIR, realManifest.deferred.file));
      expect(await verifySha256(deferredBytes, realManifest.deferred.sha256, globalThis.crypto.subtle)).toBe(true);
    });
  });

  describe('parseAndValidatePack and decodeSingleClip', () => {
    it('parses the critical idle pack and reconstructs a Three AnimationClip', async () => {
      const idleBytes = await readFile(resolve(ANIMATIONS_DIR, realManifest.critical.file));
      const pack = parseAndValidatePack(idleBytes, 'idle', realManifest);
      expect(pack.pack).toBe('idle');
      expect(pack.clips).toHaveLength(1);
      expect(pack.clips[0].name).toBe('Idle');

      const clip = decodeSingleClip(pack.clips[0]);
      expect(clip).toBeInstanceOf(THREE.AnimationClip);
      expect(clip.name).toBe('Idle');
      expect(clip.duration).toBeCloseTo(1.66666, 4);
      expect(clip.tracks.length).toBe(186);
      expect(clip.tracks.some(track => ['Camera', 'Camera001', 'CharacterArmature', 'Light', 'Light001'].includes(track.name.split('.')[0]))).toBe(false);
      expect(clip.tracks.some(track => track.name.split('.')[0].endsWith('_end'))).toBe(false);
      for (const track of clip.tracks) {
        expect(track.times).toBeInstanceOf(Float32Array);
        expect(track.values).toBeInstanceOf(Float32Array);
        expect(track.times[0]).toBe(0);
      }
    });

    it('rejects pack type mismatch', async () => {
      const idleBytes = await readFile(resolve(ANIMATIONS_DIR, realManifest.critical.file));
      expect(() => parseAndValidatePack(idleBytes, 'deferred', realManifest)).toThrow(/Pack type mismatch/);
    });

    it('rejects a pack whose clip catalogue does not match the manifest', async () => {
      const idleBytes = await readFile(resolve(ANIMATIONS_DIR, realManifest.critical.file));
      const pack = JSON.parse(new TextDecoder().decode(idleBytes));
      pack.clips[0].name = 'FakeIdle';
      expect(() => parseAndValidatePack(new TextEncoder().encode(JSON.stringify(pack)), 'idle', realManifest))
        .toThrow(/Unexpected clip/);
    });
  });

  describe('AnimationPackManager and lazy decoding', () => {
    it('decodes only the selected deferred clip and memoizes it', async () => {
      const idleBytes = await readFile(resolve(ANIMATIONS_DIR, realManifest.critical.file));
      const deferredBytes = await readFile(resolve(ANIMATIONS_DIR, realManifest.deferred.file));

      const manager = await createAnimationPackManager(realManifest, idleBytes, globalThis.crypto.subtle);
      expect(manager.criticalClip.name).toBe('Idle');
      expect(manager.isClipDecoded('Idle')).toBe(true);
      expect(manager.isDeferredLoaded()).toBe(false);

      expect(manager.clipNames).toEqual(realManifest.clips.map(clip => clip.name));
      expect(manager.hasClip('Idle')).toBe(true);
      expect(manager.hasClip('Walk')).toBe(true);
      expect(manager.hasClip('Unknown_Clip')).toBe(false);
      expect(manager.isLoop('Walk')).toBe(true);
      expect(manager.isLoop('Death')).toBe(false);
      expect(manager.getClipEntry('Death')?.loop).toBe(false);

      expect(manager.isClipDecoded('Walk')).toBe(false);
      expect(() => manager.getClip('Walk')).toThrow(/deferred and not yet loaded/);
      expect(() => manager.getClip('Unknown_Clip')).toThrow(/Unknown animation clip/);

      await manager.loadDeferredPack(deferredBytes, globalThis.crypto.subtle);
      expect(manager.isDeferredLoaded()).toBe(true);
      expect(manager.isClipDecoded('Walk')).toBe(false);
      expect(manager.isClipDecoded('Sitting')).toBe(false);

      const walk1 = manager.getClip('Walk');
      expect(walk1).toBeInstanceOf(THREE.AnimationClip);
      expect(walk1.name).toBe('Walk');
      expect(walk1.tracks.length).toBe(186);
      expect(manager.isClipDecoded('Walk')).toBe(true);
      expect(manager.isClipDecoded('Sitting')).toBe(false);
      expect(manager.getClip('Walk')).toBe(walk1);

      for (const clipName of manager.clipNames) {
        const clip = manager.getClip(clipName);
        expect(clip).toBeInstanceOf(THREE.AnimationClip);
        expect(clip.name).toBe(clipName);
        expect(clip.tracks.length).toBe(186);
        expect(clip.tracks.some(track => track.name.split('.')[0].endsWith('_end'))).toBe(false);
      }
    });

    it('rejects a deferred pack with mismatched byteLength or corrupted SHA-256', async () => {
      const idleBytes = await readFile(resolve(ANIMATIONS_DIR, realManifest.critical.file));
      const manager = await createAnimationPackManager(realManifest, idleBytes, globalThis.crypto.subtle);

      await expect(manager.loadDeferredPack(new Uint8Array(100), globalThis.crypto.subtle)).rejects.toThrow(/byteLength mismatch/);

      const realDeferredBytes = await readFile(resolve(ANIMATIONS_DIR, realManifest.deferred.file));
      const corruptedBytes = new Uint8Array(realDeferredBytes);
      corruptedBytes[50] = (corruptedBytes[50] + 1) % 256;
      await expect(manager.loadDeferredPack(corruptedBytes, globalThis.crypto.subtle)).rejects.toThrow(/SHA-256 verification failed/);
    });
  });
});

describe('strict animation format v2 regressions', () => {
  const subtle = webcrypto.subtle as unknown as SubtleCrypto;
  async function fixture() {
    const manifest = validateManifest(JSON.parse(await readFile(resolve(ANIMATIONS_DIR, 'manifest.json'), 'utf8')));
    const idleBytes = new Uint8Array(await readFile(resolve(ANIMATIONS_DIR, manifest.critical.file)));
    const deferredBytes = new Uint8Array(await readFile(resolve(ANIMATIONS_DIR, manifest.deferred.file)));
    return { manifest, idleBytes, deferredBytes };
  }

  it('rejects encoded/traversal/nested URLs, non-hashed names and unreasonable byte declarations', async () => {
    const { manifest } = await fixture();
    for (const url of [`/animations/%2e%2e/${manifest.critical.file}`, `/animations/nested/${manifest.critical.file}`, `/animations/${manifest.critical.file}?x=1`]) {
      expect(() => validateManifest({ ...manifest, critical: { ...manifest.critical, url } })).toThrow();
    }
    expect(() => validateManifest({ ...manifest, critical: { ...manifest.critical, file: 'idle.anything.json', url: '/animations/idle.anything.json' } })).toThrow(/file name/);
    expect(() => validateManifest({ ...manifest, critical: { ...manifest.critical, byteLength: ANIMATION_BYTE_LIMITS.idle + 1 } })).toThrow(/byteLength/);
    expect(() => validateManifest({ ...manifest, threeVersion: '0' })).toThrow(/threeVersion/);
  });

  it('takes immutable defensive copies of the catalogue', async () => {
    const { manifest } = await fixture();
    const result = validateManifest(manifest);
    expect(Object.isFrozen(result.clips)).toBe(true);
    expect(result.clips).not.toBe(manifest.clips);
    expect(Object.isFrozen(result.clips[0])).toBe(true);
    expect(Object.isFrozen(result.critical)).toBe(true);
  });

  it('rejects unknown interpolation, non-canonical base64 and whole-Float32 truncation', async () => {
    const { manifest, idleBytes } = await fixture();
    const pack = parseAndValidatePack(idleBytes, 'idle', manifest);
    const track = pack.clips[0].tracks[0];
    expect(() => validateSerializedTrack({ ...track, interpolation: 9999 }, 'Idle')).toThrow(/interpolation/);
    expect(() => decodeFloat32Array('AAAAAB==')).toThrow(/canonical/);
    const values = atob(track.values).slice(0, -4);
    expect(() => validateSerializedTrack({ ...track, values: btoa(values) }, 'Idle')).toThrow(/Truncated/);
    expect(() => decodeSingleClip({ ...pack.clips[0], tracks: [] })).toThrow(/at least one track/);
  });

  it('rejects substituted names and fps even if JSON is otherwise valid', async () => {
    const { manifest, idleBytes } = await fixture();
    const pack = JSON.parse(new TextDecoder().decode(idleBytes));
    pack.clips[0].name = 'FakeIdle';
    expect(() => parseAndValidatePack(new TextEncoder().encode(JSON.stringify(pack)), 'idle', manifest)).toThrow(/Unexpected clip/);
    pack.clips[0].name = 'Idle';
    pack.clips[0].fps = 30;
    expect(() => parseAndValidatePack(new TextEncoder().encode(JSON.stringify(pack)), 'idle', manifest)).toThrow(/fps/);
  });

  it('verifies SHA before JSON and leaves the previous cache unchanged on failure/reload', async () => {
    const { manifest, idleBytes, deferredBytes } = await fixture();
    const manager = await createAnimationPackManager(manifest, idleBytes, subtle);
    const idle = manager.getClip('Idle');
    const bad = new Uint8Array(deferredBytes);
    bad[0] = 0;
    await expect(manager.loadDeferredPack(bad, subtle)).rejects.toThrow(/SHA-256/);
    expect(manager.isDeferredLoaded()).toBe(false);
    const promise = manager.loadDeferredPack(deferredBytes, subtle);
    expect(promise).toBeInstanceOf(Promise);
    expect(manager.isDeferredLoaded()).toBe(false);
    await promise;
    const walk = manager.getClip('Walk');
    await manager.loadDeferredPack(deferredBytes, subtle);
    expect(manager.getClip('Walk')).toBe(walk);
    expect(manager.getClip('Idle')).toBe(idle);
    expect(manager.isClipDecoded('Death')).toBe(false);
  });

  it('validates deferred numeric values only when the affected clip is selected', async () => {
    const { manifest, idleBytes, deferredBytes } = await fixture();
    const pack = JSON.parse(new TextDecoder().decode(deferredBytes));
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setFloat32(0, Infinity, true);
    const track = pack.clips.find((clip: { name: string }) => clip.name === 'Walk').tracks[0];
    const originalValues = atob(pack.clips.find((clip: { name: string }) => clip.name === 'Walk').tracks[0].values);
    track.values = btoa(String.fromCharCode(...bytes) + originalValues.slice(4));
    const changed = new TextEncoder().encode(JSON.stringify(pack));
    const hash = await computeSha256Hex(changed, subtle);
    const modifiedManifest = {
      ...manifest,
      deferred: {
        ...manifest.deferred,
        sha256: hash,
        file: `deferred.${hash}.json`,
        url: `/animations/deferred.${hash}.json`,
        byteLength: changed.byteLength,
      },
    };
    const manager = await createAnimationPackManager(modifiedManifest, idleBytes, subtle);
    await manager.loadDeferredPack(changed, subtle);
    expect(manager.isClipDecoded('Walk')).toBe(false);
    expect(() => manager.getClip('Walk')).toThrow(/non-finite/);
    expect(manager.isClipDecoded('Walk')).toBe(false);
    expect(manager.getClip('Idle').name).toBe('Idle');
  });

  it('fails closed when Web Crypto is unavailable', async () => {
    vi.stubGlobal('crypto', {});
    try {
      await expect(computeSha256Hex(new Uint8Array(4))).rejects.toThrow(/Web Crypto/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
