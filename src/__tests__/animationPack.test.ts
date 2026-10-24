import { describe, it, expect } from 'vitest';
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
} from '../lib/animationPack';
import type { AnimationManifest } from '../types/animationPack';

const ANIMATIONS_DIR = resolve(__dirname, '../../public/animations');

describe('animationPack', () => {
  describe('decodeFloat32Array', () => {
    it('preserves -0.0 and distinguishes it from +0.0', () => {
      // Build a buffer with -0.0, +0.0, 1.25, -42.5
      const buf = new ArrayBuffer(16);
      const view = new DataView(buf);
      view.setFloat32(0, -0.0, true);
      view.setFloat32(4, 0.0, true);
      view.setFloat32(8, 1.25, true);
      view.setFloat32(12, -42.5, true);

      const uint8 = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
      const base64 = btoa(binary);

      const decoded = decodeFloat32Array(base64);

      expect(decoded.length).toBe(4);
      expect(Object.is(decoded[0], -0.0)).toBe(true);
      expect(1 / decoded[0]).toBe(-Infinity);

      expect(Object.is(decoded[1], 0.0)).toBe(true);
      expect(1 / decoded[1]).toBe(Infinity);

      expect(decoded[2]).toBe(1.25);
      expect(decoded[3]).toBe(-42.5);
    });

    it('rejects base64 payload when decoded byte length is not a multiple of 4 (truncated track)', () => {
      // 'AAA=' decodes to 2 bytes
      expect(() => decodeFloat32Array('AAA=')).toThrow(/not a multiple of 4/);
    });

    it('rejects non-finite float32 values (NaN, Infinity)', () => {
      const buf = new ArrayBuffer(4);
      const view = new DataView(buf);
      view.setFloat32(0, NaN, true);

      const uint8 = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
      const base64 = btoa(binary);

      expect(() => decodeFloat32Array(base64)).toThrow(/non-finite float32 value/);
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
    const validManifestJson: AnimationManifest = {
      formatVersion: 1,
      sourceHash: 'b455d642cd874130c3aba3ae03b207cc67c1817af3881cfbc3877e0921748d6e',
      threeVersion: '183',
      clips: [
        'Punch_Right', 'Idle_Gun', 'Sword_Slash', 'Punch_Left', 'Idle_Gun_Pointing',
        'Idle_Gun_Shoot', 'Interact', 'Idle_Neutral', 'Kick_Left', 'HitRecieve_2',
        'Run_Back', 'Idle_Sword', 'Run_Right', 'Wave', 'Kick_Right',
        'HitRecieve', 'Run', 'Gun_Shoot', 'Walk', 'Sitting',
        'Death', 'Roll', 'Run_Shoot', 'Run_Left', 'Idle',
      ],
      critical: {
        name: 'idle',
        file: 'idle.094b63c30916cca91dc00a676754613d85a0961adf5f7f958689d153e1ab4a3a.json',
        url: '/animations/idle.094b63c30916cca91dc00a676754613d85a0961adf5f7f958689d153e1ab4a3a.json',
        sha256: '094b63c30916cca91dc00a676754613d85a0961adf5f7f958689d153e1ab4a3a',
        byteLength: 62383,
        clips: ['Idle'],
      },
      deferred: {
        name: 'deferred',
        file: 'deferred.3edd43ab8180cf94263f53dcd37618c9b90090e46ffc662f0d0f8dfe557d8f79.json',
        url: '/animations/deferred.3edd43ab8180cf94263f53dcd37618c9b90090e46ffc662f0d0f8dfe557d8f79.json',
        sha256: '3edd43ab8180cf94263f53dcd37618c9b90090e46ffc662f0d0f8dfe557d8f79',
        byteLength: 1523590,
        clips: [
          'Punch_Right', 'Idle_Gun', 'Sword_Slash', 'Punch_Left', 'Idle_Gun_Pointing',
          'Idle_Gun_Shoot', 'Interact', 'Idle_Neutral', 'Kick_Left', 'HitRecieve_2',
          'Run_Back', 'Idle_Sword', 'Run_Right', 'Wave', 'Kick_Right',
          'HitRecieve', 'Run', 'Gun_Shoot', 'Walk', 'Sitting',
          'Death', 'Roll', 'Run_Shoot', 'Run_Left',
        ],
      },
    };

    it('accepts valid manifest and preserves all 25 clip names', () => {
      const manifest = validateManifest(validManifestJson);
      expect(manifest.formatVersion).toBe(1);
      expect(manifest.clips.length).toBe(25);
      expect(manifest.critical.clips).toEqual(['Idle']);
      expect(manifest.deferred.clips.length).toBe(24);
      expect(manifest.deferred.clips).not.toContain('Idle');
    });

    it('rejects unsupported formatVersion', () => {
      const invalid = { ...validManifestJson, formatVersion: 2 };
      expect(() => validateManifest(invalid)).toThrow(/Unsupported manifest formatVersion/);
    });

    it('rejects invalid sourceHash', () => {
      const invalid = { ...validManifestJson, sourceHash: 'not-a-sha256' };
      expect(() => validateManifest(invalid)).toThrow(/Invalid sourceHash/);
    });

    it('rejects clip count !== 25', () => {
      const invalid = { ...validManifestJson, clips: validManifestJson.clips.slice(0, 24) };
      expect(() => validateManifest(invalid)).toThrow(/must contain exactly 25 items/);
    });

    it('rejects duplicate clip names in catalogue', () => {
      const dupClips = [...validManifestJson.clips.slice(0, 24), validManifestJson.clips[0]];
      const invalid = { ...validManifestJson, clips: dupClips };
      expect(() => validateManifest(invalid)).toThrow(/Duplicate clip name/);
    });

    it('rejects critical pack missing Idle', () => {
      const invalid = {
        ...validManifestJson,
        critical: { ...validManifestJson.critical, clips: ['Walk'] },
      };
      expect(() => validateManifest(invalid)).toThrow(/Critical idle pack must contain exactly \['Idle'\]/);
    });

    it('rejects deferred pack containing Idle', () => {
      const invalid = {
        ...validManifestJson,
        deferred: { ...validManifestJson.deferred, clips: [...validManifestJson.deferred.clips.slice(0, 23), 'Idle'] },
      };
      expect(() => validateManifest(invalid)).toThrow(/Deferred pack must not contain critical clip 'Idle'/);
    });
  });

  describe('Web Crypto SHA-256 verification', () => {
    it('verifies SHA-256 with explicit test crypto', async () => {
      const testData = new TextEncoder().encode('BeerCall Fluidite 2026');
      const hashHex = await computeSha256Hex(testData, globalThis.crypto.subtle);

      expect(hashHex).toMatch(/^[0-9a-f]{64}$/);

      const isValid = await verifySha256(testData, hashHex, globalThis.crypto.subtle);
      expect(isValid).toBe(true);

      const isInvalid = await verifySha256(testData, '0'.repeat(64), globalThis.crypto.subtle);
      expect(isInvalid).toBe(false);
    });

    it('verifies SHA-256 on real manifest and packs from disk', async () => {
      const manifestBytes = await readFile(resolve(ANIMATIONS_DIR, 'manifest.json'));
      const manifest = validateManifest(JSON.parse(new TextDecoder().decode(manifestBytes)));

      const idleBytes = await readFile(resolve(ANIMATIONS_DIR, manifest.critical.file));
      const isIdleValid = await verifySha256(idleBytes, manifest.critical.sha256, globalThis.crypto.subtle);
      expect(isIdleValid).toBe(true);

      const deferredBytes = await readFile(resolve(ANIMATIONS_DIR, manifest.deferred.file));
      const isDeferredValid = await verifySha256(deferredBytes, manifest.deferred.sha256, globalThis.crypto.subtle);
      expect(isDeferredValid).toBe(true);
    });
  });

  describe('parseAndValidatePack and decodeSingleClip', () => {
    it('parses critical idle pack and reconstructs Three AnimationClip', async () => {
      const manifestBytes = await readFile(resolve(ANIMATIONS_DIR, 'manifest.json'));
      const manifest = validateManifest(JSON.parse(new TextDecoder().decode(manifestBytes)));

      const idleBytes = await readFile(resolve(ANIMATIONS_DIR, manifest.critical.file));
      const pack = parseAndValidatePack(idleBytes, 'idle', manifest.sourceHash);

      expect(pack.pack).toBe('idle');
      expect(pack.clips.length).toBe(1);
      expect(pack.clips[0].name).toBe('Idle');

      const clip = decodeSingleClip(pack.clips[0]);
      expect(clip).toBeInstanceOf(THREE.AnimationClip);
      expect(clip.name).toBe('Idle');
      expect(clip.duration).toBeCloseTo(1.66666, 4);
      expect(clip.tracks.length).toBe(252);

      // Verify no FPS scaling was applied
      for (const track of clip.tracks) {
        expect(track.times).toBeInstanceOf(Float32Array);
        expect(track.values).toBeInstanceOf(Float32Array);
        expect(track.times[0]).toBe(0);
      }
    });

    it('rejects pack type mismatch', async () => {
      const manifestBytes = await readFile(resolve(ANIMATIONS_DIR, 'manifest.json'));
      const manifest = validateManifest(JSON.parse(new TextDecoder().decode(manifestBytes)));

      const idleBytes = await readFile(resolve(ANIMATIONS_DIR, manifest.critical.file));
      expect(() => parseAndValidatePack(idleBytes, 'deferred', manifest.sourceHash)).toThrow(/Pack type mismatch/);
    });

    it('rejects sourceHash mismatch', async () => {
      const manifestBytes = await readFile(resolve(ANIMATIONS_DIR, 'manifest.json'));
      const manifest = validateManifest(JSON.parse(new TextDecoder().decode(manifestBytes)));

      const idleBytes = await readFile(resolve(ANIMATIONS_DIR, manifest.critical.file));
      expect(() => parseAndValidatePack(idleBytes, 'idle', '0'.repeat(64))).toThrow(/Source hash mismatch/);
    });
  });

  describe('AnimationPackManager and CHAL-05 Lazy Decoding', () => {
    it('implements lazy decoding of deferred clips with instant Idle decode and memoization', async () => {
      const manifestBytes = await readFile(resolve(ANIMATIONS_DIR, 'manifest.json'));
      const manifestRaw = JSON.parse(new TextDecoder().decode(manifestBytes));
      const idleBytes = await readFile(resolve(ANIMATIONS_DIR, manifestRaw.critical.file));
      const deferredBytes = await readFile(resolve(ANIMATIONS_DIR, manifestRaw.deferred.file));

      // 1. Initialize manager: only critical pack is parsed and decoded
      const manager = await createAnimationPackManager(manifestRaw, idleBytes, globalThis.crypto.subtle);

      expect(manager.criticalClip).toBeDefined();
      expect(manager.criticalClip.name).toBe('Idle');
      expect(manager.isClipDecoded('Idle')).toBe(true);
      expect(manager.isDeferredLoaded()).toBe(false);

      // 2. All 25 clip names are known from manifest
      expect(manager.clipNames.length).toBe(25);
      expect(manager.hasClip('Idle')).toBe(true);
      expect(manager.hasClip('Walk')).toBe(true);
      expect(manager.hasClip('Sitting')).toBe(true);
      expect(manager.hasClip('Unknown_Clip')).toBe(false);

      // 3. Deferred clip 'Walk' is recognized but NOT yet decoded
      expect(manager.isClipDecoded('Walk')).toBe(false);
      expect(() => manager.getClip('Walk')).toThrow(/deferred and not yet loaded/);
      expect(() => manager.getClip('Unknown_Clip')).toThrow(/Unknown animation clip/);

      // 4. Load deferred pack bytes (verifies SHA-256 and byteLength)
      await manager.loadDeferredPack(deferredBytes, globalThis.crypto.subtle);
      expect(manager.isDeferredLoaded()).toBe(true);

      // CHAL-05 KEY ASSERTION: deferred clips must NOT be decoded upon loadDeferredPack!
      // This prevents a Long Task freeze of decoding 12,096 base64 tracks synchronously.
      expect(manager.isClipDecoded('Walk')).toBe(false);
      expect(manager.isClipDecoded('Sitting')).toBe(false);
      expect(manager.isClipDecoded('Death')).toBe(false);

      // 5. On-demand decoding: getClip('Walk') decodes ONLY the requested clip
      const walkClip1 = manager.getClip('Walk');
      expect(walkClip1).toBeInstanceOf(THREE.AnimationClip);
      expect(walkClip1.name).toBe('Walk');
      expect(walkClip1.tracks.length).toBe(252);
      expect(manager.isClipDecoded('Walk')).toBe(true);

      // Other deferred clips are STILL not decoded
      expect(manager.isClipDecoded('Sitting')).toBe(false);

      // 6. Memoization / Cache hit: second call returns EXACT SAME instance reference
      const walkClip2 = manager.getClip('Walk');
      expect(walkClip2).toBe(walkClip1);

      // 7. Decode another clip on demand
      const sittingClip = manager.getClip('Sitting');
      expect(sittingClip).toBeInstanceOf(THREE.AnimationClip);
      expect(sittingClip.name).toBe('Sitting');
      expect(manager.isClipDecoded('Sitting')).toBe(true);
      expect(manager.isClipDecoded('Death')).toBe(false);

      // 8. Verify all 25 clips can be retrieved without error
      for (const clipName of manager.clipNames) {
        const clip = manager.getClip(clipName);
        expect(clip).toBeInstanceOf(THREE.AnimationClip);
        expect(clip.name).toBe(clipName);
        expect(clip.tracks.length).toBe(252);
        expect(manager.isClipDecoded(clipName)).toBe(true);
      }
    });

    it('rejects loading deferred pack with mismatched byteLength or corrupted SHA-256', async () => {
      const manifestBytes = await readFile(resolve(ANIMATIONS_DIR, 'manifest.json'));
      const manifestRaw = JSON.parse(new TextDecoder().decode(manifestBytes));
      const idleBytes = await readFile(resolve(ANIMATIONS_DIR, manifestRaw.critical.file));

      const manager = await createAnimationPackManager(manifestRaw, idleBytes, globalThis.crypto.subtle);

      // Truncated bytes
      const truncatedBytes = new Uint8Array(100);
      await expect(manager.loadDeferredPack(truncatedBytes, globalThis.crypto.subtle)).rejects.toThrow(
        /byteLength mismatch/
      );

      // Corrupted bytes matching length
      const realDeferredBytes = await readFile(resolve(ANIMATIONS_DIR, manifestRaw.deferred.file));
      const corruptedBytes = new Uint8Array(realDeferredBytes);
      corruptedBytes[50] = (corruptedBytes[50] + 1) % 256;

      await expect(manager.loadDeferredPack(corruptedBytes, globalThis.crypto.subtle)).rejects.toThrow(
        /SHA-256 verification failed/
      );
    });
  });
});
