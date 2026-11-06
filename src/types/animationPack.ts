import type * as THREE from 'three';

export type AnimationTrackType = 'vector' | 'quaternion';
export type AnimationPackName = 'idle' | 'deferred';
export type AnimationGender = 'Men' | 'Women';

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

export interface AnimationThumbnail {
  readonly url: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
}

/** Vignette d'un clip pour un genre ; null tant qu'elle n'est pas générée. */
export type ClipThumbnails = Readonly<Record<AnimationGender, AnimationThumbnail | null>>;

/** Une entrée du manifeste : seule source de vérité pour un clip. */
export interface AnimationClipEntry {
  readonly id: string;
  readonly name: string;
  readonly loop: boolean;
  readonly duration: number;
  readonly pack: AnimationPackName;
  readonly thumbnails: ClipThumbnails;
  readonly sourceSha256: string;
}

export interface PackMetadata {
  readonly name: AnimationPackName;
  readonly file: string;
  readonly url: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly clips: readonly string[];
}

export interface AnimationManifest {
  readonly formatVersion: 2;
  readonly threeVersion: string;
  readonly clips: readonly AnimationClipEntry[];
  readonly critical: PackMetadata;
  readonly deferred: PackMetadata;
}

export interface SerializedPack {
  pack: AnimationPackName;
  formatVersion: 2;
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
  getClipEntry(name: string): AnimationClipEntry | undefined;
  isLoop(name: string): boolean;
  isClipDecoded(name: string): boolean;
  loadDeferredPack(rawBytes: Uint8Array | ArrayBuffer, subtle?: SubtleCrypto): Promise<void>;
  isDeferredLoaded(): boolean;
}

export interface AvatarAnimationsResult {
  readonly clipNames: readonly string[];
  readonly activeClip: THREE.AnimationClip | undefined;
  /** Flag de boucle du clip réellement actif (Idle tant qu'un clip différé charge). */
  readonly activeClipLoop: boolean;
  /** Le clip demandé n'existe pas dans le manifeste (animation retirée). */
  readonly unknownClip: boolean;
  readonly isLoading: boolean;
  readonly deferredStatus: 'idle' | 'loading' | 'ready' | 'error';
  readonly error: Error | null;
  notifyInitialFrame(): void;
  getClip(name: string): Promise<THREE.AnimationClip>;
  retry(): Promise<void>;
}
