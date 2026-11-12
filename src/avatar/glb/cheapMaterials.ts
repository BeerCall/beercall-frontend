/**
 * B11 — Matériaux Lambert économiques partagés (CHAL-02 / PERF).
 *
 * Remplace le shading PBR (MeshStandardMaterial) par MeshLambertMaterial
 * afin de réduire la charge fragmentaire sur GPU mobile.
 * Les matériaux sont mémorisés dans une WeakMap pour être partagés entre instances.
 * Désactive systématiquement les ombres portées/reçues (castShadow/receiveShadow false).
 */

import {
    type Material,
    Mesh,
    MeshLambertMaterial,
    type MeshStandardMaterial,
    type Object3D,
} from 'three';

const cheapMaterialCache = new WeakMap<Material, MeshLambertMaterial>();

export function getOrCreateCheapMaterial(source: Material): Material {
    if (source instanceof MeshLambertMaterial) return source;

    const cached = cheapMaterialCache.get(source);
    if (cached) return cached;

    const std = source as MeshStandardMaterial;
    const cheap = new MeshLambertMaterial({
        color: std.color ? std.color.clone() : undefined,
        map: std.map ?? null,
        alphaMap: std.alphaMap ?? null,
        transparent: std.transparent,
        opacity: std.opacity,
        side: std.side,
        depthWrite: std.depthWrite,
        depthTest: std.depthTest,
        vertexColors: std.vertexColors,
        emissive: 0x000000,
        name: std.name,
    });

    cheapMaterialCache.set(source, cheap);
    return cheap;
}

export function cheapMaterials(root: Object3D): void {
    root.traverse((node) => {
        const mesh = node as Mesh;
        if (!mesh.isMesh) return;

        mesh.castShadow = false;
        mesh.receiveShadow = false;

        if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map(getOrCreateCheapMaterial);
        } else if (mesh.material) {
            mesh.material = getOrCreateCheapMaterial(mesh.material);
        }
    });
}
