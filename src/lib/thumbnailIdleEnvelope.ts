import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';

export interface AvatarPartMeasurementInput {
  /** Clé de la pièce ('head' | 'body' | 'legs' | 'feet' | 'accessory' ou identifiant). */
  partKey: string;
  /** Racine locale de la pièce (ex: groupe de la pièce ou objet FBX). */
  root: THREE.Object3D;
  /** Transformations optionnelles d'assemblage (position, rotation, scale). */
  transform?: {
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
  };
}

export interface ThumbnailIdleEnvelopeInput {
  parts: AvatarPartMeasurementInput[];
  clip: THREE.AnimationClip;
}

export interface ThumbnailIdleEnvelopeReady {
  ok: true;
  box: THREE.Box3;
  /** Garde de mouvement mesurée par axe (dx, dy, dz) */
  measuredGuard: [number, number, number];
  /** Nombre d'échantillons temporels évalués pendant l'échantillonnage */
  sampleCount: number;
  /** Durée CPU de la mesure en millisecondes */
  cpuTimeMs: number;
  /** Durée du clip Idle en secondes */
  duration: number;
}

export interface ThumbnailIdleEnvelopeUnavailable {
  ok: false;
  reason:
    | 'no-parts'
    | 'invalid-clip'
    | 'invalid-duration'
    | 'too-many-samples'
    | 'broken-skeleton'
    | 'broken-binding'
    | 'empty-envelope'
    | 'non-finite-box'
    | 'validation-failed';
  details?: string;
}

export type ThumbnailIdleEnvelopeResult =
  | ThumbnailIdleEnvelopeReady
  | ThumbnailIdleEnvelopeUnavailable;

interface ClonedPartContext {
  partKey: string;
  clone: THREE.Object3D;
  skinnedMeshes: THREE.SkinnedMesh[];
  staticMeshes: THREE.Mesh[];
  mixer: THREE.AnimationMixer | null;
  action: THREE.AnimationAction | null;
}

/**
 * Vérifie si un nœud cible dans le clone influence directement ou indirectement
 * au moins un mesh mesuré (par ancêtre géométrique ou par os d'un squelette).
 */
function influencesMeasuredMesh(
  node: THREE.Object3D,
  skinnedMeshes: THREE.SkinnedMesh[],
  staticMeshes: THREE.Mesh[]
): boolean {
  // 1. Est-ce un ancêtre ou le mesh mesuré lui-même ?
  for (const m of skinnedMeshes) {
    let cur: THREE.Object3D | null = m;
    while (cur) {
      if (cur === node) return true;
      cur = cur.parent;
    }
  }
  for (const m of staticMeshes) {
    let cur: THREE.Object3D | null = m;
    while (cur) {
      if (cur === node) return true;
      cur = cur.parent;
    }
  }

  // 2. Est-ce un os (ou ancêtre d'os) d'un squelette mesuré ?
  for (const sm of skinnedMeshes) {
    if (sm.skeleton?.bones) {
      for (const bone of sm.skeleton.bones) {
        let cur: THREE.Object3D | null = bone;
        while (cur) {
          if (cur === node) return true;
          cur = cur.parent;
        }
      }
    }
  }

  return false;
}

/**
 * Filtre les pistes d'animation applicables au clone et valide l'intégrité
 * des bindings nécessaires aux meshes mesurés (CHAL-V53-01).
 */
function resolveTracksForClone(
  clone: THREE.Object3D,
  clip: THREE.AnimationClip,
  skinnedMeshes: THREE.SkinnedMesh[],
  staticMeshes: THREE.Mesh[]
): { ok: true; tracks: THREE.KeyframeTrack[] } | { ok: false; reason: 'broken-binding' | 'broken-skeleton'; details: string } {
  // Squelette cassé : si SkinnedMesh présent sans squelette ou avec 0 os
  for (const sm of skinnedMeshes) {
    if (!sm.skeleton || !Array.isArray(sm.skeleton.bones) || sm.skeleton.bones.length === 0) {
      return { ok: false, reason: 'broken-skeleton', details: `SkinnedMesh ${sm.name || 'unnamed'} has invalid skeleton` };
    }
    for (const b of sm.skeleton.bones) {
      if (!b || !(b as THREE.Bone).isBone) {
        return { ok: false, reason: 'broken-skeleton', details: `Skeleton contains invalid bone reference` };
      }
    }
  }

  const applicableTracks: THREE.KeyframeTrack[] = [];

  for (const track of clip.tracks) {
    // Vérification de base des données de la piste
    if (!track.times || !track.values || track.times.length === 0 || track.values.length === 0) {
      return { ok: false, reason: 'broken-binding', details: `Track ${track.name} has empty times or values` };
    }
    for (let i = 0; i < track.values.length; i++) {
      if (!Number.isFinite(track.values[i])) {
        return { ok: false, reason: 'broken-binding', details: `Track ${track.name} has non-finite values` };
      }
    }

    const parsed = THREE.PropertyBinding.parseTrackName(track.name);
    const nodeName = parsed.nodeName;

    // Recherche de la cible dans ce clone
    let targetNode: THREE.Object3D | undefined;
    if (!nodeName || nodeName === clone.name) {
      targetNode = clone;
    } else {
      targetNode = clone.getObjectByName(nodeName);
    }

    if (targetNode) {
      if (influencesMeasuredMesh(targetNode, skinnedMeshes, staticMeshes)) {
        // La piste cible un mesh ou un os mesuré : valider que la propriété est applicable
        try {
          const binding = new THREE.PropertyBinding(clone, track.name);
          binding.bind();
          if (!binding.node) {
            return { ok: false, reason: 'broken-binding', details: `Property on ${track.name} could not be bound` };
          }
          binding.unbind();
        } catch {
          return { ok: false, reason: 'broken-binding', details: `PropertyBinding failed for track ${track.name}` };
        }
        applicableTracks.push(track);
      }
      // Si targetNode n'influence aucun mesh mesuré (ex: caméra, lumière), on l'ignore sans erreur
    }
  }

  // Pour une pièce skinnée, l'animation du squelette est requise
  if (skinnedMeshes.length > 0 && applicableTracks.length === 0) {
    return {
      ok: false,
      reason: 'broken-binding',
      details: 'Skinned piece has zero applicable animation tracks in clip',
    };
  }

  return { ok: true, tracks: applicableTracks };
}

/**
 * Calcule la boîte englobante monde de tous les meshes visibles d'un clone.
 */
function computeCloneWorldBox(clone: THREE.Object3D, targetBox: THREE.Box3): void {
  const tempBox = new THREE.Box3();
  clone.updateMatrixWorld(true);

  clone.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || mesh.visible === false) return;

    let localBox: THREE.Box3 | null = null;
    const skinned = mesh as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh && typeof skinned.computeBoundingBox === 'function') {
      skinned.computeBoundingBox();
      localBox = skinned.boundingBox ?? null;
    } else if (mesh.geometry) {
      if (!mesh.geometry.boundingBox) {
        mesh.geometry.computeBoundingBox();
      }
      localBox = mesh.geometry.boundingBox ?? null;
    }

    if (localBox && !localBox.isEmpty()) {
      tempBox.copy(localBox).applyMatrix4(mesh.matrixWorld);
      if (!tempBox.isEmpty()) {
        targetBox.union(tempBox);
      }
    }
  });
}

/**
 * Helper synchrone mesurant l'enveloppe d'animation Idle complète sur clones isolés
 * (T36a / VER-13 / CHAL-V53-01).
 */
export function computeThumbnailIdleEnvelope({
  parts,
  clip,
}: ThumbnailIdleEnvelopeInput): ThumbnailIdleEnvelopeResult {
  const startCpu = performance.now();

  if (!parts || parts.length === 0) {
    return { ok: false, reason: 'no-parts', details: 'No parts provided' };
  }
  if (!clip || !Array.isArray(clip.tracks)) {
    return { ok: false, reason: 'invalid-clip', details: 'Clip or tracks missing' };
  }
  if (!Number.isFinite(clip.duration) || clip.duration <= 0 || clip.duration > 10) {
    return { ok: false, reason: 'invalid-duration', details: `Duration must be in (0, 10], got ${clip.duration}` };
  }

  // 1. Cloner chaque pièce et préparer son AnimationMixer isolé
  const contexts: ClonedPartContext[] = [];

  try {
    for (const part of parts) {
      if (!part.root) continue;

      const clone = SkeletonUtils.clone(part.root);
      if (part.transform) {
        if (part.transform.position) clone.position.set(...part.transform.position);
        if (part.transform.rotation) clone.rotation.set(...part.transform.rotation);
        if (part.transform.scale) clone.scale.set(...part.transform.scale);
      }
      clone.updateMatrixWorld(true);

      const skinnedMeshes: THREE.SkinnedMesh[] = [];
      const staticMeshes: THREE.Mesh[] = [];

      clone.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && child.visible !== false) {
          if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
            skinnedMeshes.push(child as THREE.SkinnedMesh);
          } else {
            staticMeshes.push(child as THREE.Mesh);
          }
        }
      });

      // Valider et filtrer les pistes
      const trackResolution = resolveTracksForClone(clone, clip, skinnedMeshes, staticMeshes);
      if (!trackResolution.ok) {
        return { ok: false, reason: trackResolution.reason, details: trackResolution.details };
      }

      let mixer: THREE.AnimationMixer | null = null;
      let action: THREE.AnimationAction | null = null;

      if (trackResolution.tracks.length > 0) {
        mixer = new THREE.AnimationMixer(clone);
        const filteredClip = new THREE.AnimationClip(
          `${clip.name}_${part.partKey}`,
          clip.duration,
          trackResolution.tracks
        );
        action = mixer.clipAction(filteredClip);
        // Fade-in 0.2s identique au runtime AvatarPart
        action.reset().fadeIn(0.2).play();
      }

      contexts.push({
        partKey: part.partKey,
        clone,
        skinnedMeshes,
        staticMeshes,
        mixer,
        action,
      });
    }

    if (contexts.length === 0) {
      return { ok: false, reason: 'no-parts', details: 'No valid roots in parts' };
    }

    // 2. Construire la liste ordonnée et dédupliquée des instants d'échantillonnage
    // - t=0 et durée
    // - tous les temps de clés des pistes du clip dans [0, duration]
    // - grille 120Hz sur [0, duration]
    // - transition fade-in 0.2s au pas 120Hz
    const sampleSet = new Set<number>();
    sampleSet.add(0);
    sampleSet.add(clip.duration);

    // Clés du clip
    for (const track of clip.tracks) {
      if (track.times) {
        for (let i = 0; i < track.times.length; i++) {
          const t = track.times[i];
          if (t >= 0 && t <= clip.duration) {
            sampleSet.add(t);
          }
        }
      }
    }

    // Grille 120 Hz
    const step120 = 1 / 120;
    const stepsCount = Math.ceil(clip.duration * 120);
    for (let i = 0; i <= stepsCount; i++) {
      const t = Math.min(clip.duration, i * step120);
      sampleSet.add(t);
    }

    // Transition fade-in 0.2s
    const fadeMax = Math.min(0.2, clip.duration);
    const fadeSteps = Math.ceil(fadeMax * 120);
    for (let i = 0; i <= fadeSteps; i++) {
      sampleSet.add(Math.min(fadeMax, i * step120));
    }

    const sampleTimes = Array.from(sampleSet).sort((a, b) => a - b);
    if (sampleTimes.length > 2400) {
      return {
        ok: false,
        reason: 'too-many-samples',
        details: `Sample count ${sampleTimes.length} exceeds maximum 2400`,
      };
    }

    // 3. Échantillonner toutes les poses et mesurer les boîtes
    const envelope = new THREE.Box3();
    const sampleBoxes: THREE.Box3[] = [];

    // Pose de repos initiale (mixers à t=0, poids 0)
    const restBox = new THREE.Box3();
    for (const ctx of contexts) {
      computeCloneWorldBox(ctx.clone, restBox);
    }
    if (!restBox.isEmpty()) {
      envelope.union(restBox);
      sampleBoxes.push(restBox.clone());
    }

    // Échantillonnage à chaque temps
    for (const t of sampleTimes) {
      const currentBox = new THREE.Box3();

      for (const ctx of contexts) {
        if (ctx.mixer) {
          ctx.mixer.setTime(t);
        }
        computeCloneWorldBox(ctx.clone, currentBox);
      }

      if (currentBox.isEmpty()) continue;

      const bounds = [
        currentBox.min.x, currentBox.min.y, currentBox.min.z,
        currentBox.max.x, currentBox.max.y, currentBox.max.z,
      ];
      if (!bounds.every(Number.isFinite)) {
        return { ok: false, reason: 'non-finite-box', details: `Non-finite coordinates at t=${t}` };
      }

      envelope.union(currentBox);
      sampleBoxes.push(currentBox);
    }

    if (envelope.isEmpty()) {
      return { ok: false, reason: 'empty-envelope', details: 'Envelope is empty after sampling' };
    }

    // 4. Calculer la garde de mouvement mesurée par axe (plus grand delta entre deux échantillons adjacents)
    let maxDeltaX = 0;
    let maxDeltaY = 0;
    let maxDeltaZ = 0;

    for (let i = 0; i < sampleBoxes.length - 1; i++) {
      const b1 = sampleBoxes[i];
      const b2 = sampleBoxes[i + 1];

      const dxMin = Math.abs(b2.min.x - b1.min.x);
      const dxMax = Math.abs(b2.max.x - b1.max.x);
      const dyMin = Math.abs(b2.min.y - b1.min.y);
      const dyMax = Math.abs(b2.max.y - b1.max.y);
      const dzMin = Math.abs(b2.min.z - b1.min.z);
      const dzMax = Math.abs(b2.max.z - b1.max.z);

      if (dxMin > maxDeltaX) maxDeltaX = dxMin;
      if (dxMax > maxDeltaX) maxDeltaX = dxMax;
      if (dyMin > maxDeltaY) maxDeltaY = dyMin;
      if (dyMax > maxDeltaY) maxDeltaY = dyMax;
      if (dzMin > maxDeltaZ) maxDeltaZ = dzMin;
      if (dzMax > maxDeltaZ) maxDeltaZ = dzMax;
    }

    // Élargir l'enveloppe de la garde mesurée
    envelope.min.x -= maxDeltaX;
    envelope.max.x += maxDeltaX;
    envelope.min.y -= maxDeltaY;
    envelope.max.y += maxDeltaY;
    envelope.min.z -= maxDeltaZ;
    envelope.max.z += maxDeltaZ;

    // 5. Valider séparément sur les milieux de la grille 240Hz
    const step240 = 1 / 240;
    const midStepsCount = Math.floor(clip.duration * 240);
    const midBox = new THREE.Box3();

    for (let i = 0; i < midStepsCount; i++) {
      const tMid = (i + 0.5) * step240;
      if (tMid > clip.duration) break;

      midBox.makeEmpty();
      for (const ctx of contexts) {
        if (ctx.mixer) {
          ctx.mixer.setTime(tMid);
        }
        computeCloneWorldBox(ctx.clone, midBox);
      }

      if (!midBox.isEmpty() && !envelope.containsBox(midBox)) {
        return {
          ok: false,
          reason: 'validation-failed',
          details: `Box at 240Hz midpoint t=${tMid.toFixed(4)}s exceeds envelope`,
        };
      }
    }

    const cpuTimeMs = performance.now() - startCpu;

    return {
      ok: true,
      box: envelope,
      measuredGuard: [maxDeltaX, maxDeltaY, maxDeltaZ],
      sampleCount: sampleTimes.length,
      cpuTimeMs,
      duration: clip.duration,
    };
  } finally {
    // 6. Nettoyage strict : arrêter et uncache les mixers, détacher les clones
    for (const ctx of contexts) {
      if (ctx.mixer) {
        ctx.mixer.stopAllAction();
        ctx.mixer.uncacheRoot(ctx.clone);
      }
    }
  }
}
