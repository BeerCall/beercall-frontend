import {useMemo, useEffect, useLayoutEffect, useRef, useState, useCallback} from 'react';
import {useFrame} from '@react-three/fiber';
import {Html, useAnimations} from '@react-three/drei';
import * as THREE from 'three';
import {SkeletonUtils} from 'three-stdlib';
import {MODELS_URL} from '../../lib/api.ts';
import type {AvatarConfig, AvatarTransform} from '../../types/avatar.ts';
import {useAvatarAnimations} from '../../hooks/useAvatarAnimations';
import {useModel} from '../../hooks/useModel';
import {createAvatarPresentationLease, type AvatarPresentationOptions} from '../../lib/avatarPresentationState';
// Le chemin FBX legacy n'embarque plus de transform d'accessoire codé en dur ;
// RealAvatar lit le transform publié dans le manifeste GLB.

// 🚀 NOUVEAU COMPOSANT AVATAR FRAME NOTIFIER : Raccorde notifyInitialFrame à un probe de frame
function AvatarFrameNotifier({
    ready,
    isIdle,
    onFrameSubmitted,
}: {
    ready: boolean;
    isIdle: boolean;
    onFrameSubmitted: () => void;
}) {
    const armedRef = useRef(false);
    const submittedRef = useRef(false);
    const frameRequest = useRef<number | undefined>(undefined);
    const callbackRef = useRef(onFrameSubmitted);
    useEffect(() => {
        callbackRef.current = onFrameSubmitted;
    }, [onFrameSubmitted]);

    useEffect(() => {
        if (ready && isIdle && !submittedRef.current) {
            armedRef.current = true;
        } else if (!ready) {
            armedRef.current = false;
            submittedRef.current = false;
        } else {
            armedRef.current = false;
        }
        return () => {
            armedRef.current = false;
            if (frameRequest.current !== undefined) {
                cancelAnimationFrame(frameRequest.current);
                frameRequest.current = undefined;
            }
        };
    }, [ready, isIdle]);

    useFrame((state) => {
        if (!armedRef.current || submittedRef.current || frameRequest.current !== undefined) return;
        const before = state.gl.info.render.frame;
        frameRequest.current = requestAnimationFrame(() => {
            frameRequest.current = undefined;
            const { calls, frame } = state.gl.info.render;
            if (!armedRef.current || submittedRef.current || document.hidden || frame <= before || calls <= 0) return;
            submittedRef.current = true;
            armedRef.current = false;
            callbackRef.current();
        });
    });

    return null;
}

// 🚀 NOUVEAU COMPOSANT AVATAR PART : Chaque partie s'anime TOUTE SEULE
function AvatarPart({
    path,
    customTransform,
    animations,
    currentAnim,
    partKey,
    onPartReady,
    onPartUnmount,
    active,
}: {
    path: string,
    customTransform?: AvatarTransform,
    animations?: THREE.AnimationClip[],
    currentAnim?: string,
    partKey?: string,
    onPartReady?: (partKey: string, meshCount: number, actionPlaying: boolean, partRoot?: THREE.Group) => void,
    onPartUnmount?: (partKey: string) => void,
    active?: boolean,
}) {
    const fbx = useModel(path);
    const groupRef = useRef<THREE.Group>(null);
    const fallbackGroupRef = useRef<THREE.Group | null>(null);
    if (fallbackGroupRef.current == null) {
        fallbackGroupRef.current = new THREE.Group();
    }

    const clonedFbx = useMemo(() => {
        if (!fbx) return null;

        // SkeletonUtils clone partage les matériaux du FBX en cache ; les
        // marquer `needsUpdate` à chaque montage forçait une revalidation de
        // programme et re-gonflait le coût d'ouverture des mondes.
        return SkeletonUtils.clone(fbx);
    }, [fbx]);

    // On crée un AnimationMixer isolé pour CE vêtement
    const {actions} = useAnimations(animations || [], groupRef);
    const lastAnimRef = useRef<string | null>(null);
    const lastActionRef = useRef<THREE.AnimationAction | null>(null);
    const wasActiveRef = useRef(active);
    const skipResumeDeltaRef = useRef(false);
    const unmountCbRef = useRef(onPartUnmount);
    useEffect(() => { unmountCbRef.current = onPartUnmount; }, [onPartUnmount]);

    useLayoutEffect(() => {
        let isActionPlaying = false;
        if (currentAnim && actions[currentAnim]) {
            const action = actions[currentAnim];
            if (lastAnimRef.current !== currentAnim || lastActionRef.current !== action || (!action.isRunning() && !action.paused)) {
                const hasPreviousAction = Boolean(lastActionRef.current && lastActionRef.current !== action);
                if (hasPreviousAction && lastActionRef.current) {
                    lastActionRef.current.fadeOut(0.2);
                    action.reset().fadeIn(0.2).play();
                } else {
                    action.reset().play();
                }
                const mixer = typeof action.getMixer === 'function' ? action.getMixer() : null;
                if (mixer && typeof mixer.update === 'function') {
                    mixer.update(0);
                }
                lastAnimRef.current = currentAnim;
                lastActionRef.current = action;
            }
            isActionPlaying = action.isRunning() || (action.paused && lastActionRef.current === action);
        }

        let meshCount = 0;
        if (clonedFbx) {
            clonedFbx.traverse((child) => {
                if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).visible !== false) {
                    meshCount++;
                }
            });
        }

        if (partKey && onPartReady) {
            const fallback = fallbackGroupRef.current;
            const isFallbackEnv = groupRef.current === fallback;
            if (isFallbackEnv && fallback && clonedFbx) {
                fallback.userData = { partKey };
                if (customTransform?.position) fallback.position.set(...customTransform.position);
                if (customTransform?.scale) fallback.scale.set(...customTransform.scale);
                if (customTransform?.rotation) fallback.rotation.set(...customTransform.rotation);
                if (!fallback.children.includes(clonedFbx)) {
                    fallback.add(clonedFbx);
                }
            }
            const resolvedRoot = (groupRef.current && 'isObject3D' in groupRef.current)
                ? groupRef.current
                : (fallback ?? undefined);
            onPartReady(partKey, meshCount, isActionPlaying, resolvedRoot);
        }
    }, [currentAnim, actions, clonedFbx, partKey, onPartReady, animations, customTransform]);

    useLayoutEffect(() => {
        if (active === undefined) return; // Standalone keeps its historical root-owned clock.
        skipResumeDeltaRef.current = active && wasActiveRef.current === false;
        wasActiveRef.current = active;
        for (const action of Object.values(actions)) if (action) action.paused = !active;
    }, [active, actions]);

    // Runs before Drei's mixer update (priority 0). The first resumed delta may
    // include a background interval: discard it for this assembly only.
    useFrame(() => {
        if (active === undefined) return;
        const paused = !active || skipResumeDeltaRef.current;
        for (const action of Object.values(actions)) if (action) action.paused = paused;
        skipResumeDeltaRef.current = false;
    }, -1);

    useEffect(() => {
        return () => {
            if (lastActionRef.current) {
                lastActionRef.current.fadeOut(0.2);
                lastActionRef.current.stop();
            }
            if (partKey) {
                unmountCbRef.current?.(partKey);
            }
        };
    }, [partKey]);

    const handleGroupRef = useCallback((node: THREE.Group | HTMLElement | null) => {
        if (node && 'isObject3D' in node) {
            (groupRef as React.MutableRefObject<THREE.Group | null>).current = node as THREE.Group;
        } else {
            (groupRef as React.MutableRefObject<THREE.Group | null>).current = fallbackGroupRef.current;
        }
    }, []);

    if (!clonedFbx) return null;

    return (
        <group
            ref={handleGroupRef}
            userData={{ partKey }}
            position={customTransform?.position || [0, 0, 0]}
            scale={customTransform?.scale || [1, 1, 1]}
            rotation={customTransform?.rotation || [0, 0, 0]}
        >
            <primitive object={clonedFbx}/>
        </group>
    );
}

export function ModularAvatar({
    config,
    onAnimationsLoaded,
    onReadinessChange,
    onActiveClipChange,
    groupRef,
    presentation,
}: {
    config: AvatarConfig,
    onAnimationsLoaded?: (animations: string[]) => void,
    onReadinessChange?: (isReady: boolean, details?: { parts: string[]; meshCount: number }) => void,
    onActiveClipChange?: (clip: THREE.AnimationClip | null) => void,
    groupRef?: React.RefObject<THREE.Group | null>,
    presentation?: AvatarPresentationOptions,
}) {
    const fallbackRootRef = useRef<THREE.Group | null>(null);
    if (fallbackRootRef.current == null) {
        fallbackRootRef.current = new THREE.Group();
    }

    useEffect(() => {
        if (!groupRef) return;
        if (!groupRef.current || !('isObject3D' in groupRef.current)) {
            (groupRef as React.MutableRefObject<THREE.Group | null>).current = fallbackRootRef.current;
        }
    }, [groupRef]);

    const partRootsRef = useRef<Map<string, THREE.Group>>(new Map());

    const targetAnimation = config.animation && config.animation !== 'none' ? config.animation : "Idle";
    const {
        clipNames,
        activeClip,
        deferredStatus,
        error,
        notifyInitialFrame,
        retry,
    } = useAvatarAnimations(targetAnimation);

    useLayoutEffect(() => {
        onActiveClipChange?.(activeClip ?? null);
    }, [activeClip, onActiveClipChange]);

    // Protection contre le glitch d'animation (CHAL-01, REV-06) :
    // ModularAvatar ne transmet à AvatarPart que le clip actif, via un useMemo stable.
    // Ne JAMAIS utiliser [activeClip] inline dans le JSX.
    const activeAnimations = useMemo(() => activeClip ? [activeClip] : [], [activeClip]);
    const currentAnim = activeClip?.name;

    const expectedParts = useMemo(() => {
        if (!config) return [];
        const parts: string[] = [];
        if (config.head && config.head !== 'none') parts.push('head');
        if (config.body && config.body !== 'none') parts.push('body');
        if (config.legs && config.legs !== 'none') parts.push('legs');
        if (config.feet && config.feet !== 'none') parts.push('feet');
        if (config.accessory && config.accessory !== 'none') parts.push('accessory');
        return parts;
    }, [config]);

    const readyPartsRef = useRef<Map<string, { meshCount: number; actionPlaying: boolean }>>(new Map());
    const [isAvatarReady, setIsAvatarReady] = useState(false);

    const checkReadiness = useCallback(() => {
        if (expectedParts.length === 0) {
            setIsAvatarReady(false);
            onReadinessChange?.(false);
            return;
        }

        let allPresent = true;
        let totalMeshes = 0;
        let allActionsPlaying = true;

        for (const part of expectedParts) {
            const status = readyPartsRef.current.get(part);
            if (!status) {
                allPresent = false;
                break;
            }
            totalMeshes += status.meshCount;
            if (!status.actionPlaying) {
                allActionsPlaying = false;
                break;
            }
        }

        const isReady = allPresent && totalMeshes > 0 && allActionsPlaying;
        setIsAvatarReady(isReady);
        onReadinessChange?.(isReady, isReady ? { parts: expectedParts, meshCount: totalMeshes } : undefined);
    }, [expectedParts, onReadinessChange]);

    const handlePartReady = useCallback((partKey: string, meshCount: number, actionPlaying: boolean, partRoot?: THREE.Group) => {
        readyPartsRef.current.set(partKey, { meshCount, actionPlaying });
        if (partRoot) {
            partRootsRef.current.set(partKey, partRoot);
            if (!partRoot.parent && fallbackRootRef.current && !fallbackRootRef.current.children.includes(partRoot)) {
                fallbackRootRef.current.add(partRoot);
            }
        }
        checkReadiness();
    }, [checkReadiness]);

    const handlePartUnmount = useCallback((partKey: string) => {
        readyPartsRef.current.delete(partKey);
        const root = partRootsRef.current.get(partKey);
        if (root && fallbackRootRef.current && fallbackRootRef.current.children.includes(root)) {
            fallbackRootRef.current.remove(root);
            partRootsRef.current.delete(partKey);
        }
        checkReadiness();
    }, [checkReadiness]);

    const handleGroupRef = useCallback((node: THREE.Group | HTMLElement | null) => {
        if (!groupRef) return;
        if (node && 'isObject3D' in node) {
            (groupRef as React.MutableRefObject<THREE.Group | null>).current = node as THREE.Group;
        } else {
            (groupRef as React.MutableRefObject<THREE.Group | null>).current = fallbackRootRef.current;
        }
    }, [groupRef]);

    // Appeler onAnimationsLoaded avec les 25 noms du manifeste dès sa réception
    useEffect(() => {
        if (onAnimationsLoaded && clipNames.length > 0) {
            onAnimationsLoaded([...clipNames]);
        }
    }, [clipNames, onAnimationsLoaded]);

    const isIdle = currentAnim === 'Idle';
    const shared = presentation?.mode === 'shared';
    const active = presentation?.active;
    const onPresentationChange = presentation?.onChange;
    const presentationSignature = JSON.stringify(config);
    const presentationLeaseRef = useRef<ReturnType<typeof createAvatarPresentationLease> | null>(null);

    useLayoutEffect(() => {
        if (!shared || !onPresentationChange) return;
        const lease = createAvatarPresentationLease();
        presentationLeaseRef.current = lease;
        return () => {
            lease.revoke();
            if (presentationLeaseRef.current === lease) presentationLeaseRef.current = null;
            onPresentationChange(null);
        };
    }, [shared, onPresentationChange, presentationSignature]);

    useLayoutEffect(() => {
        if (!shared || !onPresentationChange) return;
        const criticalError = !!error && !activeClip;
        const deferredError = !!activeClip && (deferredStatus === 'error' || !!error);
        const state = presentationLeaseRef.current?.update({
            phase: criticalError ? 'critical-error' : deferredError ? 'deferred-error' : activeClip ? 'ready' : 'critical-loading',
            error: criticalError ? 'animation-critical-unavailable' : deferredError ? 'animation-deferred-unavailable' : undefined,
            active: active !== false,
            canNotifyInitialFrame: isAvatarReady && isIdle,
            notifyInitialFrame,
            retry,
        });
        if (state) onPresentationChange(state);
    }, [shared, onPresentationChange, presentationSignature, active, activeClip, deferredStatus, error, isAvatarReady, isIdle, notifyInitialFrame, retry]);

    return (
        <group ref={handleGroupRef}>
            {/* Raccorder notifyInitialFrame du hook T10 à un probe de frame, armé après readiness des pièces ET action Idle */}
            {!shared && <AvatarFrameNotifier
                ready={isAvatarReady}
                isIdle={isIdle}
                onFrameSubmitted={notifyInitialFrame}
            />}

            {/* UI Html de chargement/erreur avec bouton « Réessayer les animations » ; différé en échec n'efface pas l'avatar */}
            {!shared && error && !activeClip && (
                <Html center>
                    <div className="flex flex-col items-center bg-white/90 p-4 rounded-2xl shadow-xl backdrop-blur-md text-center max-w-xs">
                        <p className="text-xs font-bold text-red-600 mb-2">Erreur de chargement des animations</p>
                        <button
                            type="button"
                            onClick={() => { void retry(); }}
                            className="px-3 py-1 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 cursor-pointer"
                        >
                            Réessayer les animations
                        </button>
                    </div>
                </Html>
            )}

            {!shared && deferredStatus === 'error' && (
                <Html position={[0, -20, 0]} center>
                    <div className="bg-amber-100/90 border border-amber-300 text-amber-900 px-3 py-1 rounded-lg text-xs flex items-center gap-2 shadow-md">
                        <span>Animations différées indisponibles</span>
                        <button
                            type="button"
                            onClick={() => { void retry(); }}
                            className="underline font-bold text-amber-700 hover:text-amber-900 cursor-pointer"
                        >
                            Réessayer les animations
                        </button>
                    </div>
                </Html>
            )}

            {/* Le paramètre key force React à recréer la pièce et relancer l'animation */}
            {config.head && config.head !== 'none' &&
                <AvatarPart key={`head-${config.head}`} path={`${MODELS_URL}/${config.head}.fbx`}
                            partKey="head" onPartReady={handlePartReady} onPartUnmount={handlePartUnmount}
                            animations={activeAnimations} currentAnim={currentAnim} active={active}/>}

            {config.body && config.body !== 'none' &&
                <AvatarPart key={`body-${config.body}`} path={`${MODELS_URL}/${config.body}.fbx`}
                            partKey="body" onPartReady={handlePartReady} onPartUnmount={handlePartUnmount}
                            animations={activeAnimations} currentAnim={currentAnim} active={active}/>}

            {config.legs && config.legs !== 'none' &&
                <AvatarPart key={`legs-${config.legs}`} path={`${MODELS_URL}/${config.legs}.fbx`}
                            partKey="legs" onPartReady={handlePartReady} onPartUnmount={handlePartUnmount}
                            animations={activeAnimations} currentAnim={currentAnim} active={active}/>}

            {config.feet && config.feet !== 'none' &&
                <AvatarPart key={`feet-${config.feet}`} path={`${MODELS_URL}/${config.feet}.fbx`}
                            partKey="feet" onPartReady={handlePartReady} onPartUnmount={handlePartUnmount}
                            animations={activeAnimations} currentAnim={currentAnim} active={active}/>}

            {config.accessory && config.accessory !== 'none' && (
                <AvatarPart
                    key={`acc-${config.accessory}`}
                    path={`${MODELS_URL}/${config.accessory}.fbx`}
                    partKey="accessory"
                    onPartReady={handlePartReady}
                    onPartUnmount={handlePartUnmount}
                    animations={activeAnimations}
                    currentAnim={currentAnim}
                    active={active}
                />
            )}
        </group>
    );
}
