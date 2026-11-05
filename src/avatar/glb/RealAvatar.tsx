/**
 * B11 — RealAvatar (CHAL-02 / PERF).
 *
 * Rendu 3D de l'avatar basé sur les pièces GLB modulaires publiées :
 * - Charge via le cache CPU partagé A13 (`loadGlb`).
 * - Clones de squelettes indépendants (`SkeletonUtils.clone`).
 * - Matériaux Lambert économiques partagés (`cheapMaterials`).
 * - Un mixer par pièce skinnée, sans mixer fictif pour accessoire statique.
 * - Échelle racine par défaut 1 (coordonnées historiques).
 * - Animation multi-clips (25 clips) avec crossfade 0.2s, delta borné à 0.05.
 * - Nettoyage des mixers sans libérer les géométries en cache à l'unmount.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import {
    type AnimationAction,
    AnimationMixer,
    Group,
    type Mesh,
    type SkinnedMesh,
} from 'three';

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
    animate?: boolean;
    scale?: number;
    onReady?: () => void;
    onAnimationsLoaded?: (names: string[]) => void;
    onReadinessChange?: (ready: boolean, details?: { parts: string[]; meshCount: number }) => void;
    onActiveClipChange?: (clipName: string) => void;
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

/** Diagnostic: proves each avatar rig is assembled once, not on every parent render. */
let assemblyCount = 0;

export const RealAvatar: React.FC<RealAvatarProps> = ({
    config,
    userId,
    manifest: propManifest,
    animate = true,
    scale = 1,
    onReady,
    onAnimationsLoaded,
    onReadinessChange,
    onActiveClipChange,
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
        notifyInitialFrame,
    } = useAvatarAnimations(targetAnimation);

    const [avatarRoot, setAvatarRoot] = useState<Group | null>(null);
    const [mixers, setMixers] = useState<AnimationMixer[]>([]);
    const [loadError, setLoadError] = useState<Error | null>(null);

    const activeActions = useRef<Map<AnimationMixer, AnimationAction>>(new Map());
    const currentClipName = useRef<string>('');
    const readinessReported = useRef(false);
    const loggedResolveError = useRef<Error | null>(null);
    const callbacksRef = useRef({ onReady, onReadinessChange });
    callbacksRef.current = { onReady, onReadinessChange };

    // 1. Résolution synchrone pure des pièces
    const { resolvedParts, resolveError } = useMemo(() => {
        if (!manifest) return { resolvedParts: null, resolveError: null };
        try {
            const partsConfig: AvatarPartsConfig = {
                head: config.head ?? undefined,
                body: config.body ?? undefined,
                legs: config.legs ?? undefined,
                feet: config.feet ?? undefined,
                accessory: config.accessory,
                gender: 'gender' in config && typeof config.gender === 'string' ? config.gender : undefined,
            };
            const parts = resolveAvatarParts(partsConfig, manifest);
            return { resolvedParts: parts, resolveError: null };
        } catch (err) {
            return {
                resolvedParts: null,
                resolveError: err instanceof Error ? err : new Error(String(err)),
            };
        }
    }, [config, manifest]);

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
    }, [resolveError, userId]);

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
                assemblyCount += 1;
                console.info('[avatar] assembled', {
                    count: assemblyCount,
                    avatar: resolvedParts.head.sourceId,
                    parts: pieceNames.length,
                });
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
        currentClipName.current = clipName;
        onActiveClipChange?.(clipName);

        notifyInitialFrame();

        for (const mixer of mixers) {
            const nextAction = mixer.clipAction(activeClip);
            const prevAction = activeActions.current.get(mixer);

            if (!isSame && prevAction && prevAction !== nextAction) {
                nextAction.reset().fadeIn(0.2).play();
                prevAction.fadeOut(0.2);
            } else {
                nextAction.reset().play();
            }

            activeActions.current.set(mixer, nextAction);
        }
    }, [activeClip, mixers, targetAnimation, notifyInitialFrame, onActiveClipChange]);

    // 6. Boucle d'animation avec delta borné
    useFrame((_, delta) => {
        if (!animate || mixers.length === 0) return;
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
