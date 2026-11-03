/**
 * A03 — Conversion FBX -> GLB dans le navigateur (Chromium piloté par `convert.mjs`).
 *
 * Porté depuis `poc/fluidite/src/tools/converter/browserConvert.ts` et son pilote
 * `scripts/build-avatars.mjs`, en gardant les invariants demandés par le plan :
 * hiérarchie, skin, unités, origine, orientation, noms d'os et géométrie inchangés ;
 * aucun recentrage, scale global, renommage, pose Idle cuite ni clip ajouté ;
 * export `animations: []` et `onlyVisible: true`.
 */
import {
    Box3,
    Color,
    DirectionalLight,
    Group,
    HemisphereLight,
    Mesh,
    PerspectiveCamera,
    Scene,
    SRGBColorSpace,
    SkinnedMesh,
    Vector3,
    WebGLRenderer,
} from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const fbxLoader = new FBXLoader();
const gltfLoader = new GLTFLoader();

type MaterialLike = {
    map?: { colorSpace?: string; image?: { width?: number; height?: number } } | null;
    opacity: number;
    transparent: boolean;
    depthWrite: boolean;
    needsUpdate: boolean;
    emissive?: { setRGB?: (r: number, g: number, b: number) => void; r: number; g: number; b: number };
    emissiveIntensity?: number;
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
    }
    return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes.buffer;
}

/** FBXLoader peut laisser des trous ou des valeurs non-Object3D dans `children`. */
function sanitize(root: Group): void {
    const stack = [root];
    while (stack.length) {
        const node = stack.pop() as Group;
        if (!Array.isArray(node.children)) continue;
        node.children = node.children.filter((child) => Boolean(child) && (child as { isObject3D?: boolean }).isObject3D === true);
        stack.push(...(node.children as Group[]));
    }
}

/** Retire caméras et lumières : un modèle publié ne contient que de la géométrie. */
function stripNonRenderable(root: Group): { removed: string[] } {
    sanitize(root);
    const removed: string[] = [];
    const doomed: object[] = [];
    root.traverse((node) => {
        if ((node as { isCamera?: boolean }).isCamera || (node as { isLight?: boolean }).isLight || (node as { userData?: { isCameraNode?: boolean } }).userData?.isCameraNode) {
            removed.push((node as { name?: string }).name || node.type);
            doomed.push(node);
        }
    });
    for (const node of doomed) (node as { removeFromParent?: () => void }).removeFromParent?.();
    return { removed };
}

/**
 * Attend le décodage des textures et normalise la convention FBX
 * « alpha 0 = non défini », sans uniformiser les couleurs (les décors gardent
 * leurs maps). Les textures de couleur passent en sRGB.
 */
async function prepareMaterials(root: Group, timeout = 10_000): Promise<{ materials: number; textures: number; missing: number }> {
    const materials: MaterialLike[] = [];
    root.traverse((node) => {
        const holder = node as unknown as { material?: MaterialLike | MaterialLike[] };
        if (!holder.material) return;
        for (const material of Array.isArray(holder.material) ? holder.material : [holder.material]) {
            materials.push(material);
            if (material.opacity === 0) material.opacity = 1;
            material.transparent = false;
            material.depthWrite = true;
            material.emissive?.setRGB?.(0, 0, 0);
            if (typeof material.emissiveIntensity === 'number') material.emissiveIntensity = 0;
            if (material.map && 'colorSpace' in material.map) material.map.colorSpace = SRGBColorSpace;
            material.needsUpdate = true;
        }
    });
    const mapped = materials.filter((material) => Boolean(material.map));
    const startedAt = performance.now();
    while (performance.now() - startedAt < timeout) {
        if (mapped.every((material) => (material.map?.image?.width ?? 0) > 0)) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const missing = mapped.filter((material) => !((material.map?.image?.width ?? 0) > 0)).length;
    return { materials: materials.length, textures: new Set(mapped.map((material) => material.map)).size, missing };
}

function countGeometry(root: Group): { meshes: number; skinned: number; bones: number } {
    let meshes = 0;
    let skinned = 0;
    let bones = 0;
    root.traverse((node) => {
        if ((node as Mesh).isMesh) meshes += 1;
        if ((node as SkinnedMesh).isSkinnedMesh) skinned += 1;
        if ((node as { isBone?: boolean }).isBone) bones += 1;
    });
    return { meshes, skinned, bones };
}

async function exportGlb(object: Group): Promise<ArrayBuffer> {
    const exporter = new GLTFExporter();
    const result = await exporter.parseAsync(object, { binary: true, animations: [], onlyVisible: true });
    if (!(result instanceof ArrayBuffer)) throw new Error('GLTFExporter: GLB binaire attendu');
    return result;
}

/** Recharge le GLB produit et vérifie meshes + textures réellement décodées. */
async function verifyGlb(buffer: ArrayBuffer): Promise<{ meshes: number; textures: number; decodedTextures: number }> {
    const gltf = await gltfLoader.parseAsync(buffer, '');
    const { meshes } = countGeometry(gltf.scene as Group);
    if (meshes < 1) throw new Error('GLB exporté sans aucun mesh');
    const materials: MaterialLike[] = [];
    const seen = new Set<MaterialLike>();
    gltf.scene.traverse((node) => {
        const holder = node as unknown as { material?: MaterialLike | MaterialLike[] };
        if (!holder.material) return;
        for (const material of Array.isArray(holder.material) ? holder.material : [holder.material]) {
            if (seen.has(material)) continue;
            seen.add(material);
            materials.push(material);
        }
    });
    const mapped = materials.filter((material) => Boolean(material.map));
    const startedAt = performance.now();
    while (performance.now() - startedAt < 5_000) {
        if (mapped.every((material) => (material.map?.image?.width ?? 0) > 0)) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const decodedTextures = mapped.filter((material) => (material.map?.image?.width ?? 0) > 0).length;
    if (decodedTextures !== mapped.length) {
        throw new Error(`GLB exporté : ${mapped.length - decodedTextures} texture(s) non décodée(s)`);
    }
    return { meshes, textures: mapped.length, decodedTextures };
}

async function loadFbx(sourceId: string): Promise<Group> {
    const url = `/models-src/${encodeURIComponent(sourceId)}.fbx`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`FBX introuvable: ${url} (${response.status})`);
    return fbxLoader.parse(await response.arrayBuffer(), '') as Group;
}

export interface ConvertResult {
    sourceId: string;
    base64: string;
    bytes: number;
    bbox: { min: [number, number, number]; max: [number, number, number] } | null;
    stats: { meshes: number; skinned: number; bones: number; materials: number; textures: number; missingTextures: number };
    removed: string[];
    verified: { meshes: number; textures: number; decodedTextures: number };
}

export async function convertFbx(sourceId: string): Promise<ConvertResult> {
    const object = await loadFbx(sourceId);
    const { removed } = stripNonRenderable(object);
    const materialReport = await prepareMaterials(object);
    const geometry = countGeometry(object);
    if (geometry.meshes < 1) throw new Error(`${sourceId}: aucun mesh`);
    if (materialReport.missing > 0) throw new Error(`${sourceId}: ${materialReport.missing} texture(s) non chargée(s)`);

    object.updateMatrixWorld(true);
    const box = new Box3().setFromObject(object);
    const finite = [box.min, box.max].every((v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z));
    const bbox = finite && !box.isEmpty()
        ? { min: [box.min.x, box.min.y, box.min.z] as [number, number, number], max: [box.max.x, box.max.y, box.max.z] as [number, number, number] }
        : null;
    if (!bbox) throw new Error(`${sourceId}: bbox non finie`);

    // Vérifie que les textures sont bien décodées avant export (FBXLoader rend
    // la main avant la fin du décodage des images embarquées).
    const size = new Vector3();
    box.getSize(size);
    if (size.length() === 0) throw new Error(`${sourceId}: géométrie vide`);

    const buffer = await exportGlb(object);
    const verified = await verifyGlb(buffer);

    return {
        sourceId,
        base64: arrayBufferToBase64(buffer),
        bytes: buffer.byteLength,
        bbox,
        stats: {
            meshes: geometry.meshes,
            skinned: geometry.skinned,
            bones: geometry.bones,
            materials: materialReport.materials,
            textures: materialReport.textures,
            missingTextures: materialReport.missing,
        },
        removed,
        verified,
    };
}

export interface WorldPosterRenderOptions {
    decorSourceId: string;
    decorTransform: { scale: number; position: [number, number, number]; rotation: [number, number, number] };
    camera: { position: [number, number, number]; fov: number; target: [number, number, number] };
    width?: number;
    height?: number;
}

export async function renderWorldPoster(options: WorldPosterRenderOptions): Promise<string> {
    const object = await loadFbx(options.decorSourceId);
    stripNonRenderable(object);
    await prepareMaterials(object);

    object.scale.set(options.decorTransform.scale, options.decorTransform.scale, options.decorTransform.scale);
    object.position.set(...options.decorTransform.position);
    object.rotation.set(...options.decorTransform.rotation);

    const scene = new Scene();
    scene.background = new Color('#0f172a');
    scene.add(new HemisphereLight(new Color('#ffffff'), new Color('#4a5568'), 2.4));
    const dir = new DirectionalLight(new Color('#ffffff'), 2.2);
    dir.position.set(0.6, 2.4, 3);
    scene.add(dir);
    scene.add(object);

    const width = options.width || 640;
    const height = options.height || 400;

    const camera = new PerspectiveCamera(options.camera.fov, width / height, 0.1, 5000);
    camera.position.set(...options.camera.position);
    camera.lookAt(...options.camera.target);

    const renderer = new WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.render(scene, camera);

    const dataUrl = renderer.domElement.toDataURL('image/png');
    renderer.dispose();
    return dataUrl.split(',')[1] ?? '';
}

declare global {
    interface Window {
        __convertFbx: (sourceId: string) => Promise<ConvertResult>;
        __renderWorldPoster: (options: WorldPosterRenderOptions) => Promise<string>;
    }
}

window.__convertFbx = convertFbx;
window.__renderWorldPoster = renderWorldPoster;
