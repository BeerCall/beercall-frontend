/**
 * Vignettes d'animations : avatar Casual_0 complet, de face, posé à l'instant
 * clé. Le cadrage est fourni par l'appelant pour garantir une échelle commune
 * à toutes les vignettes (choix B).
 */

import {
    AnimationClip,
    Box3,
    OrthographicCamera,
    type WebGLRenderer,
} from 'three';

import type { AvatarPartsConfig, GlbManifest } from '../glb/manifest';
import { composePerson, type ComposedPerson } from './composePerson';
import { deformedBounds } from './renderSprites';
import { createThumbnailScene } from './thumbnails';

export const ANIMATION_THUMBNAIL_RENDER_SIZE = 256;
export const ANIMATION_THUMBNAIL_SIZE = 192;
export const ANIMATION_THUMBNAIL_MARGIN = 1.15;

export type ThumbnailGender = 'Men' | 'Women';

export function casualConfig(gender: ThumbnailGender): AvatarPartsConfig {
    const prefix = gender;
    return {
        head: `${prefix}_head_Casual_0`,
        body: `${prefix}_body_Casual_0`,
        legs: `${prefix}_legs_Casual_0`,
        feet: `${prefix}_feet_Casual_0`,
        accessory: 'none',
        gender,
    };
}

function applyClip(composed: ComposedPerson, clip: AnimationClip, time: number): void {
    const clamped = Math.max(0, Math.min(time, clip.duration));
    for (const mixer of composed.mixers) {
        mixer.stopAllAction();
        const action = mixer.clipAction(clip);
        action.reset();
        action.play();
        action.time = clamped;
        mixer.update(0);
    }
    composed.group.updateMatrixWorld(true);
}

function boundsOf(composed: ComposedPerson): Box3 {
    const bounds = deformedBounds(composed.group);
    return bounds.isEmpty() ? new Box3().setFromObject(composed.group) : bounds;
}

export interface AnalyzeAnimationPoseOptions {
    manifest: GlbManifest;
    idleClip: AnimationClip;
    clip: AnimationClip;
    gender: ThumbnailGender;
    keyTime: number;
}

export interface AnimationPoseBounds {
    idleBounds: Box3;
    clipBounds: Box3;
}

/** Bornes réelles (géométrie déformée) de la pose Idle t=0 et de la pose clé. */
export async function analyzeAnimationPose({
    manifest,
    idleClip,
    clip,
    gender,
    keyTime,
}: AnalyzeAnimationPoseOptions): Promise<AnimationPoseBounds> {
    const composed = await composePerson({ config: casualConfig(gender), manifest });
    try {
        applyClip(composed, idleClip, 0);
        const idleBounds = boundsOf(composed);
        applyClip(composed, clip, keyTime);
        const clipBounds = boundsOf(composed);
        return { idleBounds, clipBounds };
    } finally {
        composed.stop();
        composed.dispose();
    }
}

export interface RenderAnimationThumbnailOptions {
    manifest: GlbManifest;
    clip: AnimationClip;
    gender: ThumbnailGender;
    keyTime: number;
    center: readonly [number, number, number];
    extent: number;
    size?: number;
}

/** Rend la pose clé en PNG transparent, avec un cadrage orthographique commun. */
export async function renderAnimationThumbnail(
    renderer: WebGLRenderer,
    {
        manifest,
        clip,
        gender,
        keyTime,
        center,
        extent,
        size = ANIMATION_THUMBNAIL_RENDER_SIZE,
    }: RenderAnimationThumbnailOptions,
): Promise<string> {
    const composed = await composePerson({ config: casualConfig(gender), manifest });
    try {
        applyClip(composed, clip, keyTime);

        const distance = Math.max(10, extent * 4);
        const camera = new OrthographicCamera(
            -extent / 2,
            extent / 2,
            extent / 2,
            -extent / 2,
            0.1,
            distance * 2,
        );
        camera.position.set(center[0], center[1], center[2] + distance);
        camera.lookAt(center[0], center[1], center[2]);

        const scene = createThumbnailScene(composed.group);
        renderer.setSize(size, size, false);
        renderer.setClearColor(0x000000, 0);
        renderer.render(scene, camera);
        return renderer.domElement.toDataURL('image/png');
    } finally {
        composed.stop();
        composed.dispose();
    }
}
