/**
 * Vignettes d'articles du catalogue : une pièce GLB seule, cadrée sur sa bbox,
 * rendue par le renderer hors DOM existant (aucun canvas dans le Vestiaire).
 *
 * Le rendu est carré, transparent, puis publié en WebP 192x192 par le serveur
 * de rendu. La marge est calculée sur la plus grande dimension pour ne jamais
 * rogner les objets hauts et fins (Beer) ni les objets larges (voitures).
 */

import {
    AnimationClip,
    AnimationMixer,
    Box3,
    Color,
    DirectionalLight,
    Group,
    HemisphereLight,
    OrthographicCamera,
    Scene,
    Vector3,
    WebGLRenderer,
} from 'three';

import { cheapMaterials } from '../glb/cheapMaterials';
import { cloneGlbInstance, loadGlb } from '../glb/loadGlb';
import type { GlbManifestItem } from '../glb/manifest';
import { deformedBounds } from './renderSprites';

export const THUMBNAIL_RENDER_SIZE = 256;
export const THUMBNAIL_SIZE = 192;
export const THUMBNAIL_MARGIN = 1.3;

function isSkinned(root: Group): boolean {
    let found = false;
    root.traverse((node) => {
        if ((node as { isSkinnedMesh?: boolean }).isSkinnedMesh) found = true;
    });
    return found;
}

/**
 * Étendue carrée : boîte englobante projetée à l'écran, largeur et hauteur
 * uniquement. La profondeur ne doit pas réduire le cadrage d'un objet long
 * (F1, Sword) vu de face.
 */
export function thumbnailExtent(bounds: Box3): number {
    const size = bounds.getSize(new Vector3());
    const projectedDimension = Math.max(size.x, size.y);
    return Math.max(projectedDimension, 1e-6) * THUMBNAIL_MARGIN;
}

export function thumbnailFraming(bounds: Box3): {
    camera: OrthographicCamera;
    center: Vector3;
    extent: number;
} {
    const center = bounds.getCenter(new Vector3());
    const extent = thumbnailExtent(bounds);
    const distance = Math.max(1000, extent * 3);
    const camera = new OrthographicCamera(-extent / 2, extent / 2, extent / 2, -extent / 2, 0.1, distance * 2);
    camera.position.set(center.x, center.y, center.z + distance);
    camera.lookAt(center.x, center.y, center.z);
    return { camera, center, extent };
}

export function createThumbnailScene(object: Group): Scene {
    const scene = new Scene();
    scene.background = null;

    const hemi = new HemisphereLight(new Color('#ffffff'), new Color('#94a3b8'), 2.2);
    const key = new DirectionalLight(new Color('#ffffff'), 2.4);
    key.position.set(0.6, 2.4, 3);
    const fill = new DirectionalLight(new Color('#ffffff'), 1.2);
    fill.position.set(-3, 1.2, 2.4);
    const rim = new DirectionalLight(new Color('#ffffff'), 0.9);
    rim.position.set(0, 2, -3);

    scene.add(hemi, key, fill, rim, object);
    return scene;
}

export interface RenderThumbnailOptions {
    item: GlbManifestItem;
    clip?: AnimationClip | null;
    size?: number;
}

/**
 * Rend une pièce seule en PNG transparent. La pièce skinée reçoit la pose Idle
 * à t=0 ; l'accessoire statique est rendu tel quel.
 */
export async function renderThumbnail(
    renderer: WebGLRenderer,
    { item, clip, size = THUMBNAIL_RENDER_SIZE }: RenderThumbnailOptions,
): Promise<string> {
    const gltf = await loadGlb(item.url);
    const instance = cloneGlbInstance(gltf);
    cheapMaterials(instance);

    if (clip && isSkinned(instance)) {
        const mixer = new AnimationMixer(instance);
        const action = mixer.clipAction(clip);
        action.play();
        action.time = 0;
        mixer.update(0);
    }

    instance.updateMatrixWorld(true);
    let bounds = deformedBounds(instance);
    if (bounds.isEmpty()) bounds = new Box3().setFromObject(instance);

    const { camera } = thumbnailFraming(bounds);
    renderer.setSize(size, size, false);
    renderer.setClearColor(0x000000, 0);
    renderer.render(createThumbnailScene(instance), camera);
    return renderer.domElement.toDataURL('image/png');
}
