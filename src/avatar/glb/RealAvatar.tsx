/**
 * B11 — RealAvatar (CHAL-02 / PERF).
 *
 * Rendu 3D de l'avatar basé sur les pièces GLB modulaires publiées :
 * - Charge via le cache CPU partagé A13 (`loadGlb`).
 * - Clones de squelettes indépendants (`SkeletonUtils.clone`).
 * - Matériaux Lambert économiques partagés (`cheapMaterials`).
 * - Un mixer par pièce skinnée, sans mixer fictif pour accessoire statique.
 * - Échelle racine par défaut 1 (coordonnées historiques).
 * - Animation multi-clips avec crossfade 0.2s, delta borné à 0.05.
 * - Flag de boucle issu du manifeste : l = Repeat, o = Once + dernière pose.
 * - Nettoyage des mixers sans libérer les géométries en cache à l'unmount.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import {
    type AnimationAction,
    AnimationMixer,
    Group,
    type Mesh,
    type Object3D,
    type SkinnedMesh,
    Vector3,
} from 'three';

import { applyLoopMode, resolvePlaybackCommand } from './animationPlayback';
import { attachAccessory } from '../accessoryAttachment';
import { cheapMaterials } from './cheapMaterials';
import { cloneGlbInstance, loadGlb } from './loadGlb';
import {
    AvatarPieceNotFoundError,
    type AvatarPartsConfig,
    type GlbManifest,
    resolveAvatarParts,
} from './manifest';
import { useGlbManifest } from './useGlbManifest';
import { useAvatarAnimations } from '../../hooks/useAvatarAnimations';
import type { AvatarConfig } from '../../types/avatar';

export interface RealAvatarProps {
    config: AvatarConfig | AvatarPartsConfig;
    /** Propriétaire de la tenue, pour identifier toute pièce introuvable. */
    userId?: string | number;
    manifest?: GlbManifest;
    animate?: boolean | (() => boolean);
    scale?: number;
    onReady?: () => void;
    onAnimationsLoaded?: (names: string[]) => void;
    onReadinessChange?: (ready: boolean, details?: { parts: string[]; meshCount: number }) => void;
    /** Hauteur réelle du sommet de tête, mesurée une fois après l'assemblage. */
    onHeadAnchor?: (height: number) => void;
    onActiveClipChange?: (clipName: string) => void;
    /** Incrémenté à chaque appui sur une animation ; relance un clip `o`. */
    replayToken?: number;
    groupRef?: React.Ref<Group>;
}

function hasSkinnedMesh(root: Group): boolean {
    let found = false;
    root.traverse((node) => {
        if ((node as SkinnedMesh).isSkinnedMesh) found = true;
    });
    return found;
}

function countMeshes(root: Group): number {
    let count = 0;
    root.traverse((node) => {
        if ((node as Mesh).isMesh) count += 1;
    });
    return count;
}

export const RealAvatar: React.FC<RealAvatarProps> = ({
    config,
    userId,
    manifest: propManifest,
    animate = true,
    scale = 1,
    onReady,
    onAnimationsLoaded,
    onReadinessChange,
    onHeadAnchor,
    onActiveClipChange,
    replayToken = 0,
    groupRef,
}) => {
    const manifestQuery = useGlbManifest();
    const manifest = propManifest ?? manifestQuery.data;
    const isError = !propManifest && manifestQuery.isError;
    const error = manifestQuery.error;

    const targetAnimation =
        ('animation' in config && typeof config.animation === 'string' && config.animation) || 'Idle';

    const {
        clipNames,
        activeClip,
        activeClipLoop,
        unknownClip,
        notifyInitialFrame,
        error: animationError,
    } = useAvatarAnimations(targetAnimation);

    const [avatarRoot, setAvatarRoot] = useState<Group | null>(null);
    const [mixers, setMixers] = useState<AnimationMixer[]>([]);
    const [loadError, setLoadError] = useState<Error | null>(null);

    const activeActions = useRef<Map<AnimationMixer, AnimationAction>>(new Map());
    const currentClipName = useRef<string>('');
    const replayTokenRef = useRef(replayToken);
    const readinessReported = useRef(false);
    const loggedResolveError = useRef<Error | null>(null);
    const loggedManifestError = useRef<Error | null>(null);
    const loggedAnimationError = useRef<Error | null>(null);
    const callbacksRef = useRef({ onReady, onReadinessChange, onHeadAnchor });
    useEffect(() => {
        callbacksRef.current = { onReady, onReadinessChange, onHeadAnchor };
    }, [onReady, onReadinessChange, onHeadAnchor]);
    const headBoneRef = useRef<Object3D | null>(null);

    // 1. Résolution synchrone pure des pièces.
    // Les dépendances sont les champs de tenue, jamais l'objet config : un simple
    // changement d'animation ne doit pas démonter puis reconstruire l'avatar.
    const partHead = config.head;
    const partBody = config.body;
    const partLegs = config.legs;
    const partFeet = config.feet;
    const partAccessory = config.accessory;
    const partGender = 'gender' in config && typeof config.gender === 'string' ? config.gender : undefined;

    const { resolvedParts, resolveError } = useMemo(() => {
        if (!manifest) return { resolvedParts: null, resolveError: null };
        try {
            const partsConfig: AvatarPartsConfig = {
                head: partHead ?? undefined,
                body: partBody ?? undefined,
                legs: partLegs ?? undefined,
                feet: partFeet ?? undefined,
                accessory: partAccessory,
                gender: partGender,
            };
            const parts = resolveAvatarParts(partsConfig, manifest);
            return { resolvedParts: parts, resolveError: null };
        } catch (err) {
            return {
                resolvedParts: null,
                resolveError: err instanceof Error ? err : new Error(String(err)),
            };
        }
    }, [partHead, partBody, partLegs, partFeet, partAccessory, partGender, manifest]);

    // 2. Toute pièce introuvable est signalée, jamais avalée en silence
    useEffect(() => {
        if (!resolveError || loggedResolveError.current === resolveError) return;
        loggedResolveError.current = resolveError;
        const owner = userId ?? 'inconnu';
        if (resolveError instanceof AvatarPieceNotFoundError) {
            console.error(
                `[avatar] pièce introuvable "${resolveError.pieceId}" (slot "${resolveError.slot}") pour l'utilisateur ${owner}`,
            );
        } else {
            console.error(`[avatar] résolution impossible pour l'utilisateur ${owner} : ${resolveError.message}`);
        }
        callbacksRef.current.onReadinessChange?.(false);
    }, [resolveError, userId]);

    // 2b. Manifeste GLB indisponible : visible et signalé, jamais un canvas vide.
    useEffect(() => {
        if (!isError || !error || loggedManifestError.current === error) return;
        loggedManifestError.current = error;
        console.error('[avatar] manifest GLB indisponible', { error });
        callbacksRef.current.onReadinessChange?.(false);
    }, [isError, error]);

    // 2c. Animation absente ou pack indisponible : Idle reste joué, mais
    // l'utilisateur et le clip sont tracés. Un clip inconnu ne doit jamais
    // produire un avatar figé sans explication.
    useEffect(() => {
        if (!animationError || loggedAnimationError.current === animationError) return;
        loggedAnimationError.current = animationError;
        if (unknownClip) {
            console.warn(
                `[avatar] animation "${targetAnimation}" absente du manifeste pour l'utilisateur ${userId ?? 'inconnu'} ; Idle joué.`,
            );
        } else {
            console.warn('[avatar] animation indisponible', {
                userId: userId ?? 'inconnu',
                clip: targetAnimation,
                error: animationError.message,
            });
        }
        if (!activeClip) {
            callbacksRef.current.onReadinessChange?.(false);
        }
    }, [animationError, activeClip, unknownClip, targetAnimation, userId]);

    // 3. Notification des clips disponibles pour l'interface (Vestiaire)
    useEffect(() => {
        if (clipNames && clipNames.length > 0) {
            onAnimationsLoaded?.([...clipNames]);
        }
    }, [clipNames, onAnimationsLoaded]);

    // 4. Assemblage du graphe d'avatar depuis le cache CPU loadGlb
    useEffect(() => {
        if (!resolvedParts) return;

        let cancelled = false;
        const currentMixers: AnimationMixer[] = [];
        const root = new Group();
        root.name = `realAvatar:${resolvedParts.gender}`;

        (async () => {
            try {
                const [headGltf, bodyGltf, legsGltf, feetGltf] = await Promise.all([
                    loadGlb(resolvedParts.head.url),
                    loadGlb(resolvedParts.body.url),
                    loadGlb(resolvedParts.legs.url),
                    loadGlb(resolvedParts.feet.url),
                ]);

                if (cancelled) return;

                const headInst = cloneGlbInstance(headGltf);
                const bodyInst = cloneGlbInstance(bodyGltf);
                const legsInst = cloneGlbInstance(legsGltf);
                const feetInst = cloneGlbInstance(feetGltf);
                headBoneRef.current = headInst.getObjectByName('Head_end')
                    ?? headInst.getObjectByName('Head')
                    ?? null;

                const pieces = [headInst, bodyInst, legsInst, feetInst];
                const pieceNames = [
                    resolvedParts.head.sourceId,
                    resolvedParts.body.sourceId,
                    resolvedParts.legs.sourceId,
                    resolvedParts.feet.sourceId,
                ];

                for (let i = 0; i < pieces.length; i += 1) {
                    const inst = pieces[i];
                    cheapMaterials(inst);
                    root.add(inst);
                    if (hasSkinnedMesh(inst)) {
                        currentMixers.push(new AnimationMixer(inst));
                    }
                }
                headBoneRef.current = headBoneRef.current
                    ?? root.getObjectByName('Head_end')
                    ?? root.getObjectByName('Head')
                    ?? null;

                if (resolvedParts.accessory) {
                    const accGltf = await loadGlb(resolvedParts.accessory.url);
                    if (cancelled) return;

                    const accInst = cloneGlbInstance(accGltf);
                    cheapMaterials(accInst);

                    const accessoryId = resolvedParts.accessory.sourceId;
                    attachAccessory({
                        accessoryId,
                        instance: accInst,
                        body: bodyInst,
                        root,
                        manifestTransform: resolvedParts.accessory.transform,
                    });
                    pieceNames.push(accessoryId);

                    if (hasSkinnedMesh(accInst)) {
                        currentMixers.push(new AnimationMixer(accInst));
                    }
                }

                setAvatarRoot(root);
                setMixers(currentMixers);
                setLoadError(null);

                const totalMeshes = countMeshes(root);
                callbacksRef.current.onReadinessChange?.(true, { parts: pieceNames, meshCount: totalMeshes });
                callbacksRef.current.onReady?.();
                readinessReported.current = true;
            } catch (err) {
                if (cancelled) return;
                const error = err instanceof Error ? err : new Error(String(err));
                console.error('[avatar] assembly failed', {
                    avatar: resolvedParts.head.sourceId,
                    error,
                });
                setLoadError(error);
                callbacksRef.current.onReadinessChange?.(false);
            }
        })();

        return () => {
            cancelled = true;
            for (const mixer of currentMixers) {
                mixer.stopAllAction();
                mixer.uncacheRoot(mixer.getRoot());
            }
            root.clear();
        };
    }, [resolvedParts]);

    // 5. Application du clip actif avec crossfade 0.2s
    useEffect(() => {
        if (!activeClip || mixers.length === 0) return;

        const clipName = activeClip.name || targetAnimation;
        const isSame = currentClipName.current === clipName;
        const replayChanged = replayTokenRef.current !== replayToken;
        currentClipName.current = clipName;
        replayTokenRef.current = replayToken;
        onActiveClipChange?.(clipName);

        notifyInitialFrame();

        for (const mixer of mixers) {
            const nextAction = mixer.clipAction(activeClip);
            const prevAction = activeActions.current.get(mixer);
            const hasAction = Boolean(prevAction);
            applyLoopMode(nextAction, activeClipLoop);

            const command = resolvePlaybackCommand({
                sameClip: isSame,
                hasAction,
                hasPrevious: hasAction && prevAction !== nextAction,
                loop: activeClipLoop,
                replayChanged,
            });

            if (command === 'crossfade' && prevAction) {
                nextAction.reset().fadeIn(0.2).play();
                prevAction.fadeOut(0.2);
            } else if (command === 'start' || command === 'restart') {
                nextAction.reset().play();
            }

            activeActions.current.set(mixer, nextAction);
        }
    }, [activeClip, activeClipLoop, mixers, targetAnimation, replayToken, notifyInitialFrame, onActiveClipChange]);

    // 5b. Hauteur du sommet de tête : une seule mesure, après la première pose.
    // Aucun Box3 ni calcul par frame ; l'os Head_end est fourni par le modèle.
    useEffect(() => {
        if (!avatarRoot) return;
        let cancelled = false;
        let secondFrame = 0;
        const measure = () => {
            const bone = headBoneRef.current;
            if (!bone) {
                console.warn('[avatar] os de tête introuvable ; preuve photo non placée', { userId });
                return;
            }
            avatarRoot.updateWorldMatrix(true, true);
            const headWorld = bone.getWorldPosition(new Vector3());
            const rootWorld = avatarRoot.getWorldPosition(new Vector3());
            callbacksRef.current.onHeadAnchor?.(headWorld.y - rootWorld.y);
        };
        const firstFrame = requestAnimationFrame(() => {
            secondFrame = requestAnimationFrame(() => {
                if (!cancelled) measure();
            });
        });
        return () => {
            cancelled = true;
            cancelAnimationFrame(firstFrame);
            cancelAnimationFrame(secondFrame);
        };
    }, [avatarRoot, userId]);

    // 6. Boucle d'animation avec delta borné
    useFrame((_, delta) => {
        const enabled = typeof animate === 'function' ? animate() : animate;
        if (!enabled || mixers.length === 0) return;
        const boundedDelta = Math.min(delta, 0.05);
        for (const mixer of mixers) {
            mixer.update(boundedDelta);
        }
    });

    const activeError = resolveError || (isError ? error : loadError);
    if (activeError || !avatarRoot) {
        return null;
    }

    return (
        <group ref={groupRef} scale={scale} visible={Boolean(activeClip)}>
            <primitive object={avatarRoot} />
        </group>
    );
};
