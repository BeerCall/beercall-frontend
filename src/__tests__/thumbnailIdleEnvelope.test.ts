import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  computeThumbnailIdleEnvelope,
  type AvatarPartMeasurementInput,
} from '../lib/thumbnailIdleEnvelope';
import { computeAvatarFraming, FRAMING_MARGIN } from '../lib/avatarFraming';

function createSkinnedPart(
  name: string,
  boneNames: string[] = ['root', 'spine', 'head'],
  yOffset = 0
): {
  group: THREE.Group;
  bones: THREE.Bone[];
  skeleton: THREE.Skeleton;
  skinnedMesh: THREE.SkinnedMesh;
} {
  const group = new THREE.Group();
  group.name = `group_${name}`;
  group.position.y = yOffset;

  const bones: THREE.Bone[] = [];
  let prevBone: THREE.Bone | null = null;
  for (let i = 0; i < boneNames.length; i++) {
    const bone = new THREE.Bone();
    bone.name = `${name}_${boneNames[i]}`;
    bone.position.set(0, i * 0.3, 0);
    if (prevBone) {
      prevBone.add(bone);
    } else {
      group.add(bone);
    }
    prevBone = bone;
    bones.push(bone);
  }

  const skeleton = new THREE.Skeleton(bones);

  const geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3, 1, 2, 1);
  const posAttr = geometry.attributes.position;
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];

  for (let i = 0; i < posAttr.count; i++) {
    const y = posAttr.getY(i);
    const bIndex = y > 0 ? Math.min(bones.length - 1, 1) : 0;
    skinIndices.push(bIndex, 0, 0, 0);
    skinWeights.push(1, 0, 0, 0);
  }

  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

  const material = new THREE.MeshBasicMaterial({ color: 0x888888 });
  const skinnedMesh = new THREE.SkinnedMesh(geometry, material);
  skinnedMesh.name = `skinned_${name}`;
  skinnedMesh.bind(skeleton);

  group.add(skinnedMesh);

  return { group, bones, skeleton, skinnedMesh };
}

function createStaticAccessory(name: string, position: [number, number, number] = [0, 1.2, 0]): {
  group: THREE.Group;
  mesh: THREE.Mesh;
} {
  const group = new THREE.Group();
  group.name = `group_${name}`;
  const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
  const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `mesh_${name}`;
  mesh.position.set(...position);
  group.add(mesh);
  return { group, mesh };
}

function createMultiPartIdleClip(
  parts: { name: string; boneNames: string[] }[],
  duration = 2.0
): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  const times = [0, 0.5, 1.0, 1.5, 2.0];

  for (const part of parts) {
    for (const bName of part.boneNames) {
      const fullBoneName = `${part.name}_${bName}`;

      const q0 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0);
      const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.1);
      const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0);
      const q3 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.1);
      const q4 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0);

      tracks.push(
        new THREE.QuaternionKeyframeTrack(`${fullBoneName}.quaternion`, times, [
          q0.x, q0.y, q0.z, q0.w,
          q1.x, q1.y, q1.z, q1.w,
          q2.x, q2.y, q2.z, q2.w,
          q3.x, q3.y, q3.z, q3.w,
          q4.x, q4.y, q4.z, q4.w,
        ])
      );

      tracks.push(
        new THREE.VectorKeyframeTrack(`${fullBoneName}.position`, times, [
          0, 0, 0,
          0, 0.05, 0,
          0, 0, 0,
          0, -0.05, 0,
          0, 0, 0,
        ])
      );
    }
  }

  return new THREE.AnimationClip('Idle', duration, tracks);
}

describe('thumbnailIdleEnvelope (T36a / VER-13 / CHAL-V53-01)', () => {
  it('mesure une enveloppe Idle valide sur 4 corps + accessoire fixe avec garde de mouvement', () => {
    const head = createSkinnedPart('head', ['root', 'neck', 'head'], 1.0);
    const body = createSkinnedPart('body', ['root', 'spine', 'chest'], 0.6);
    const legs = createSkinnedPart('legs', ['root', 'hip_l', 'hip_r'], 0.3);
    const feet = createSkinnedPart('feet', ['root', 'foot_l', 'foot_r'], 0.0);
    const accessory = createStaticAccessory('kart_cap', [0, 1.4, 0]);

    const partsDef = [
      { name: 'head', boneNames: ['root', 'neck', 'head'] },
      { name: 'body', boneNames: ['root', 'spine', 'chest'] },
      { name: 'legs', boneNames: ['root', 'hip_l', 'hip_r'] },
      { name: 'feet', boneNames: ['root', 'foot_l', 'foot_r'] },
    ];
    const clip = createMultiPartIdleClip(partsDef, 2.0);

    const inputParts: AvatarPartMeasurementInput[] = [
      { partKey: 'head', root: head.group },
      { partKey: 'body', root: body.group },
      { partKey: 'legs', root: legs.group },
      { partKey: 'feet', root: feet.group },
      { partKey: 'accessory', root: accessory.group },
    ];

    const result = computeThumbnailIdleEnvelope({ parts: inputParts, clip });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.duration).toBe(2.0);
    expect(result.sampleCount).toBeGreaterThanOrEqual(240); // Au moins grille 120Hz sur 2s
    expect(result.sampleCount).toBeLessThanOrEqual(2400);
    expect(result.cpuTimeMs).toBeGreaterThan(0);
    expect(result.box.isEmpty()).toBe(false);

    // Garde de mouvement mesurée finie et >= 0
    expect(result.measuredGuard[0]).toBeGreaterThanOrEqual(0);
    expect(result.measuredGuard[1]).toBeGreaterThanOrEqual(0);
    expect(result.measuredGuard[2]).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(result.measuredGuard[0])).toBe(true);

    // Données de diagnostic consignées
    console.log(
      `[T36a diagnostic] samples=${result.sampleCount}, cpuTimeMs=${result.cpuTimeMs.toFixed(2)}, guard=[${result.measuredGuard.map(g => g.toFixed(4)).join(',')}]`
    );

    // Validation projection T30a
    const framing = computeAvatarFraming({
      box: result.box,
      width: 300,
      height: 300,
      fov: 45,
    });
    expect(framing.ok).toBe(true);
    if (!framing.ok) return;

    const camera = new THREE.PerspectiveCamera(45, 1, framing.near, framing.far);
    camera.position.set(...framing.position);
    camera.lookAt(...framing.center);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

    // Tous les coins de l'enveloppe projetés dans la caméra respectent la marge 0.8
    for (const x of [result.box.min.x, result.box.max.x]) {
      for (const y of [result.box.min.y, result.box.max.y]) {
        for (const z of [result.box.min.z, result.box.max.z]) {
          const pt = new THREE.Vector3(x, y, z).project(camera);
          expect(Math.abs(pt.x)).toBeLessThanOrEqual(FRAMING_MARGIN + 1e-4);
          expect(Math.abs(pt.y)).toBeLessThanOrEqual(FRAMING_MARGIN + 1e-4);
        }
      }
    }
  });

  it('accepte un accessoire statique Kart sans squelette et sans pistes (CHAL-V53-01)', () => {
    const body = createSkinnedPart('body', ['root', 'spine'], 0.5);
    const kart = createStaticAccessory('kart_vehicle', [0, 0, 0]);

    const clip = createMultiPartIdleClip([{ name: 'body', boneNames: ['root', 'spine'] }], 1.0);

    const result = computeThumbnailIdleEnvelope({
      parts: [
        { partKey: 'body', root: body.group },
        { partKey: 'accessory', root: kart.group },
      ],
      clip,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // L'enveloppe englobe le kart (centre y=0) et le corps (y=0.5)
    expect(result.box.min.y).toBeLessThan(0.2);
    expect(result.box.max.y).toBeGreaterThan(0.6);
  });

  it('ignore les pistes caméras et lumières hors périmètre sans lever d\'erreur (CHAL-V53-01)', () => {
    const body = createSkinnedPart('worker_body', ['root', 'spine'], 0.5);
    const clip = createMultiPartIdleClip([{ name: 'worker_body', boneNames: ['root', 'spine'] }], 1.0);

    // Ajout de pistes hors périmètre (caméra, lumière de scène)
    clip.tracks.push(
      new THREE.VectorKeyframeTrack('SceneCamera.position', [0, 1], [0, 1, 5, 0, 1, 6]),
      new THREE.NumberKeyframeTrack('SunLight.intensity', [0, 1], [1.0, 0.8])
    );

    const result = computeThumbnailIdleEnvelope({
      parts: [{ partKey: 'body', root: body.group }],
      clip,
    });

    expect(result.ok).toBe(true);
  });

  it('refuse une piste nécessaire malformée avec broken-binding (CHAL-V53-01)', () => {
    const body = createSkinnedPart('body', ['root', 'spine'], 0.5);
    const clip = new THREE.AnimationClip('Idle_Corrupt', 1.0, [
      // Piste ciblant un os mesuré mais avec une valeur NaN
      new THREE.VectorKeyframeTrack('body_root.position', [0, 1], [0, NaN, 0, 0, 0, 0]),
    ]);

    const result = computeThumbnailIdleEnvelope({
      parts: [{ partKey: 'body', root: body.group }],
      clip,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('broken-binding');
  });

  it('refuse un squelette cassé avec broken-skeleton (CHAL-V53-01)', () => {
    const body = createSkinnedPart('body', ['root', 'spine'], 0.5);
    // Casse délibérée du squelette : tableau d'os vide
    body.skinnedMesh.skeleton.bones = [];

    const clip = createMultiPartIdleClip([{ name: 'body', boneNames: ['root', 'spine'] }], 1.0);

    const result = computeThumbnailIdleEnvelope({
      parts: [{ partKey: 'body', root: body.group }],
      clip,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('broken-skeleton');
  });

  it('refuse une pièce skinnée dont l\'animation nécessaire est absente du clip', () => {
    const body = createSkinnedPart('body', ['root', 'spine'], 0.5);
    // Clip contenant uniquement des pistes pour une autre pièce
    const clip = createMultiPartIdleClip([{ name: 'unrelated', boneNames: ['root'] }], 1.0);

    const result = computeThumbnailIdleEnvelope({
      parts: [{ partKey: 'body', root: body.group }],
      clip,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('broken-binding');
  });

  it('refuse les durées et inputs invalides', () => {
    const body = createSkinnedPart('body', ['root'], 0.5);
    const clipNormal = createMultiPartIdleClip([{ name: 'body', boneNames: ['root'] }], 1.0);

    // Pas de pièces
    expect(computeThumbnailIdleEnvelope({ parts: [], clip: clipNormal }).ok).toBe(false);

    // Durée négative ou nulle
    const clipZero = createMultiPartIdleClip([{ name: 'body', boneNames: ['root'] }], 0);
    expect(computeThumbnailIdleEnvelope({ parts: [{ partKey: 'body', root: body.group }], clip: clipZero }).ok).toBe(false);

    // Durée supérieure à 10s
    const clipLong = createMultiPartIdleClip([{ name: 'body', boneNames: ['root'] }], 10.5);
    expect(computeThumbnailIdleEnvelope({ parts: [{ partKey: 'body', root: body.group }], clip: clipLong }).ok).toBe(false);
  });

  it('conserve les inputs d\'origine strictement inchangés après la mesure', () => {
    const body = createSkinnedPart('body', ['root', 'spine'], 0.5);
    const origPos = body.group.position.clone();
    const origRot = body.group.rotation.clone();
    const clip = createMultiPartIdleClip([{ name: 'body', boneNames: ['root', 'spine'] }], 1.0);
    const trackCountBefore = clip.tracks.length;

    const result = computeThumbnailIdleEnvelope({
      parts: [{ partKey: 'body', root: body.group }],
      clip,
    });

    expect(result.ok).toBe(true);
    expect(body.group.position.equals(origPos)).toBe(true);
    expect(body.group.rotation.equals(origRot)).toBe(true);
    expect(clip.tracks.length).toBe(trackCountBefore);
  });
});
