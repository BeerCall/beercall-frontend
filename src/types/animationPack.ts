import type * as THREE from 'three';

export type AnimationTrackType = 'vector' | 'quaternion';

export interface SerializedTrack {
  name: string;
  type: AnimationTrackType;
  interpolation: number;
  times: string;
  values: string;
}

export interface SerializedClip {
  name: string;
  duration: number;
  blendMode: number;
  uuid: string;
  tracks: SerializedTrack[];
}

export interface PackMetadata {
  name: string;
  file: string;
  url: string;
  sha256: string;
  byteLength: number;
  clips: string[];
}

export interface AnimationManifest {
  formatVersion: 1;
  sourceHash: string;
  threeVersion: string;
  clips: string[];
  critical: PackMetadata;
  deferred: PackMetadata;
}

export interface SerializedPack {
  pack: 'idle' | 'deferred';
  formatVersion: 1;
  sourceHash: string;
  clips: SerializedClip[];
}

export interface PackValidationOptions {
  subtle?: SubtleCrypto;
  maxByteLength?: number;
}

export interface AnimationPackManager {
  readonly manifest: AnimationManifest;
  readonly criticalClip: THREE.AnimationClip;
  readonly clipNames: readonly string[];
  hasClip(name: string): boolean;
  getClip(name: string): THREE.AnimationClip;
  isClipDecoded(name: string): boolean;
  loadDeferredPack(rawBytes: Uint8Array | ArrayBuffer): void;
  isDeferredLoaded(): boolean;
}
