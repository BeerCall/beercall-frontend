/**
 * A14 — Rendu des trois sprites d'avatar (tête 256², portrait 512², corps 256×512).
 *
 * Éclairage studio rigoureux : HemisphereLight (sol #4a5568, ciel blanc, 2.4) + DirectionalLight (2.2 à [0.6, 2.4, 3]).
 * Cadrages exacts :
 * - Portrait 512² : centré sur tête/buste selon bodyBounds (sans accessoire pour éviter tout dézoom).
 * - Tête 256² : centré sur les meshes de tête avec marge de 12 % (sans accessoire).
 * - Corps 256×512 : cadrage complet fullBounds avec pieds ancrés sur la marge basse (accessoire inclus).
 * Sortie PNG transparente pour sharp / encodage serveur.
 */

import {
    Box3,
    Color,
    DirectionalLight,
    HemisphereLight,
    Mesh,
    Object3D,
    OrthographicCamera,
    Scene,
    SkinnedMesh,
    Vector3,
    WebGLRenderer,
} from 'three';

import { composePerson, type ComposePersonOptions } from './composePerson';
import { loadIdleClip } from './idleClip';

export interface CameraFraming {
    camera: OrthographicCamera;
    width: number;
    height: number;
}

export interface SpriteRenderResults {
    head: string;
    portrait: string;
    body: string;
    bounds: {
        body: Box3;
        full: Box3;
        head: Box3;
    };
}

export function createOffscreenRenderer(width = 512, height = 512): WebGLRenderer {
    const renderer = new WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 0);
    return renderer;
}

export function createLitScene(object: Object3D): Scene {
    const scene = new Scene();
    scene.background = null;

    const hemi = new HemisphereLight(new Color('#ffffff'), new Color('#4a5568'), 2.4);
    const key = new DirectionalLight(new Color('#ffffff'), 2.2);
    key.position.set(0.6, 2.4, 3);

    scene.add(hemi);
    scene.add(key);
    scene.add(object);
    return scene;
}

/**
 * Calcule l'enveloppe réelle déformée d'un graphe skinné.
 * Un Box3 standard ne lit que la pose de bind ; cette fonction échantillonne la géométrie animée.
 */
export function deformedBounds(root: Object3D): Box3 {
    root.updateMatrixWorld(true);
    const box = new Box3();
    const point = new Vector3();

    root.traverse((node) => {
        const mesh = node as SkinnedMesh;
        if (mesh.isSkinnedMesh) {
            mesh.skeleton.update();
            const position = mesh.geometry.attributes.position;
            if (!position) return;
            const step = Math.max(1, Math.floor(position.count / 2500));
            for (let index = 0; index < position.count; index += step) {
                point.fromBufferAttribute(position, index);
                mesh.applyBoneTransform(index, point);
                point.applyMatrix4(mesh.matrixWorld);
                box.expandByPoint(point);
            }
        } else if ((node as Mesh).isMesh) {
            const staticMesh = node as Mesh;
            staticMesh.updateMatrixWorld(true);
            staticMesh.geometry.computeBoundingBox();
            if (staticMesh.geometry.boundingBox) {
                box.union(staticMesh.geometry.boundingBox.clone().applyMatrix4(staticMesh.matrixWorld));
            }
        }
    });

    return box;
}

/** Cadrage Portrait 512² : centré sur tête et buste d'après bodyBounds pur (sans accessoire). */
export function calculatePortraitFraming(bodyBounds: Box3, size = 512): CameraFraming {
    const bodyHeight = bodyBounds.max.y - bodyBounds.min.y;
    const windowSize = bodyHeight * 0.42;
    const centerX = (bodyBounds.min.x + bodyBounds.max.x) / 2;
    const centerY = bodyBounds.max.y - windowSize * 0.45;

    const camera = new OrthographicCamera(
        -windowSize / 2,
        windowSize / 2,
        windowSize / 2,
        -windowSize / 2,
        bodyHeight * 0.01,
        bodyHeight * 12,
    );
    camera.position.set(centerX, centerY, bodyHeight * 2.5);
    camera.lookAt(centerX, centerY, 0);

    return { camera, width: size, height: size };
}

/** Cadrage Tête 256² : boîte des meshes de tête avec marge de 12 % (sans accessoire). */
export function calculateHeadFraming(headBounds: Box3, size = 256): CameraFraming {
    const sizeVec = headBounds.getSize(new Vector3());
    const extent = Math.max(sizeVec.x, sizeVec.y, sizeVec.z) * 1.12;
    const center = headBounds.getCenter(new Vector3());

    const camera = new OrthographicCamera(
        -extent / 2,
        extent / 2,
        extent / 2,
        -extent / 2,
        0.01,
        Math.max(50, extent * 12),
    );
    camera.position.set(center.x, center.y, center.z + Math.max(10, extent * 2.5));
    camera.lookAt(center.x, center.y, center.z);

    return { camera, width: size, height: size };
}

/** Cadrage Corps 256×512 : fullBounds complet avec pieds calés sur la marge basse. */
export function calculateBodyFraming(
    bodyBounds: Box3,
    fullBounds: Box3,
    width = 256,
    height = 512,
): CameraFraming {
    const bottomY = Math.min(bodyBounds.min.y, fullBounds.min.y);
    const topY = Math.max(bodyBounds.max.y, fullBounds.max.y);
    const effectiveHeight = Math.max(bodyBounds.max.y - bodyBounds.min.y, topY - bottomY);

    const margin = effectiveHeight * 0.04;
    const baseWindowHeight = (effectiveHeight + margin * 2) * 1.06;
    const baseWindowWidth = baseWindowHeight * (width / height); // 1:2
    const centerX = (bodyBounds.min.x + bodyBounds.max.x) / 2;

    const requiredHalf = Math.max(
        centerX - Math.min(bodyBounds.min.x, fullBounds.min.x),
        Math.max(bodyBounds.max.x, fullBounds.max.x) - centerX,
    ) + effectiveHeight * 0.04;

    const windowWidth = Math.max(baseWindowWidth, requiredHalf * 2);
    const windowHeight = Math.max(baseWindowHeight, windowWidth * (height / width));
    const centerY = bottomY - margin + windowHeight / 2;

    const camera = new OrthographicCamera(
        -windowWidth / 2,
        windowWidth / 2,
        windowHeight / 2,
        -windowHeight / 2,
        effectiveHeight * 0.01,
        effectiveHeight * 12,
    );
    camera.position.set(centerX, centerY, effectiveHeight * 2.5);
    camera.lookAt(centerX, centerY, 0);

    return { camera, width, height };
}

function renderPass(
    renderer: WebGLRenderer,
    scene: Scene,
    framing: CameraFraming,
): string {
    renderer.setSize(framing.width, framing.height, false);
    renderer.render(scene, framing.camera);
    // Sortie PNG transparente
    return renderer.domElement.toDataURL('image/png');
}

/**
 * Rend les 3 sprites pour une tenue donnée avec UN seul assemblage et UN seul renderer.
 */
export async function renderSprites(
    renderer: WebGLRenderer,
    options: ComposePersonOptions,
): Promise<SpriteRenderResults> {
    const clip = options.clip ?? (await loadIdleClip());
    const composed = await composePerson({ ...options, clip });

    let headBounds = deformedBounds(composed.parts.head);
    if (headBounds.isEmpty()) {
        headBounds = new Box3().setFromObject(composed.parts.head);
    }

    const scene = createLitScene(composed.group);

    try {
        // 1. Passes sans accessoire (portrait et tête)
        if (composed.parts.accessory) {
            composed.parts.accessory.visible = false;
        }

        const portraitFraming = calculatePortraitFraming(composed.bodyBounds, 512);
        const portraitDataUrl = renderPass(renderer, scene, portraitFraming);

        const headFraming = calculateHeadFraming(headBounds, 256);
        const headDataUrl = renderPass(renderer, scene, headFraming);

        // 2. Passe avec accessoire (corps complet)
        if (composed.parts.accessory) {
            composed.parts.accessory.visible = true;
        }

        const bodyFraming = calculateBodyFraming(composed.bodyBounds, composed.fullBounds, 256, 512);
        const bodyDataUrl = renderPass(renderer, scene, bodyFraming);

        return {
            head: headDataUrl,
            portrait: portraitDataUrl,
            body: bodyDataUrl,
            bounds: {
                body: composed.bodyBounds,
                full: composed.fullBounds,
                head: headBounds,
            },
        };
    } finally {
        // Libération des ressources propres à cette requête sans altérer le cache CPU partagé
        composed.stop();
        composed.dispose();
    }
}
