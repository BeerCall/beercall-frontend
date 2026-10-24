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
  readonly name: 'idle' | 'deferred';
  readonly file: string;
  readonly url: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly clips: readonly string[];
}

export interface AnimationManifest {
  readonly formatVersion: 1;
  readonly sourceHash: string;
  readonly threeVersion: string;
  readonly clips: readonly string[];
  readonly critical: PackMetadata;
  readonly deferred: PackMetadata;
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
  loadDeferredPack(rawBytes: Uint8Array | ArrayBuffer, subtle?: SubtleCrypto): Promise<void>;
  isDeferredLoaded(): boolean;
}

export interface AvatarAnimationsResult {
  readonly clipNames: readonly string[];
  readonly activeClip: THREE.AnimationClip | undefined;
  readonly isLoading: boolean;
  readonly deferredStatus: 'idle' | 'loading' | 'ready' | 'error';
  readonly error: Error | null;
  notifyInitialFrame(): void;
  getClip(name: string): Promise<THREE.AnimationClip>;
  retry(): Promise<void>;
}
