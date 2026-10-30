import {memo, Suspense, useMemo, useEffect, useLayoutEffect, useRef, useState, useCallback} from 'react';
import {useThree} from '@react-three/fiber';
import {
    OrbitControls,
    ContactShadows,
    Html,
    useProgress
} from '@react-three/drei';
import * as THREE from 'three';
import {computeAvatarFraming} from "../../lib/avatarFraming.ts";
import {preparedThumbnailEnvelope} from '../../lib/thumbnailEnvelopeCatalog';
import {
    computeThumbnailIdleEnvelope,
    type ThumbnailIdleEnvelopeReady,
    type AvatarPartMeasurementInput,
} from "../../lib/thumbnailIdleEnvelope";
import type {AvatarConfig} from "../../types/avatar.ts";
import {ModularAvatar} from './ModularAvatar';
import SceneReadyProbe from './SceneReadyProbe';
import {recordAvatarLoading} from '../../lib/avatarLoadingTrace';
import type {AvatarPresentationOptions} from '../../lib/avatarPresentationState';

function CanvasLoader() {
    useEffect(() => {
        recordAvatarLoading('model-assets', 'start', 'avatar');
        return () => recordAvatarLoading('model-assets', 'end', 'avatar');
    }, []);
    const {progress} = useProgress();
    return (
        <Html center>
            <div data-avatar-loading="model-assets" className="flex flex-col items-center bg-white/90 p-4 rounded-2xl shadow-xl backdrop-blur-md">
                <div className="w-8 h-8 border-4 border-beer border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs font-black text-beer mt-2 tracking-widest">{progress.toFixed(0)}%</p>
            </div>
        </Html>
    );
}

function restoreCameraClip(cameraInstance: THREE.PerspectiveCamera, near: number, far: number) {
    cameraInstance.near = near;
    cameraInstance.far = far;
    cameraInstance.updateProjectionMatrix();
}

export interface ThumbnailFramingInfo {
    width: number;
    height: number;
    distance: number;
    center: [number, number, number];
    position: [number, number, number];
    near: number;
    far: number;
    boxMin: [number, number, number];
    boxMax: [number, number, number];
    corners: [number, number, number][];
    // Diagnostics T36b / VER-13 / VER-16
    poseBoxMin: [number, number, number];
    poseBoxMax: [number, number, number];
    envelopeBoxMin: [number, number, number];
    envelopeBoxMax: [number, number, number];
    measuredGuard: [number, number, number];
    sampleCount: number;
    cpuTimeMs: number;
    viewMatrix: number[];
    projectionMatrix: number[];
    partsCount: number;
    meshCount: number;
    status: 'ready' | 'pending' | 'unavailable';
}

interface ThumbnailFramingProps {
    groupRef: React.RefObject<THREE.Group | null>;
    ready: boolean;
    signature: string;
    clip: THREE.AnimationClip | null;
    allowNonIdleClip?: boolean;
    headOnly?: boolean;
    onApplied: (info: ThumbnailFramingInfo | null, signature: string) => void;
}

/**
 * Cadrage opt-in des miniatures et du profil (T36b / VER-13 / VER-16) :
 * - Mesure l'enveloppe complète sur clones isolés avec garde mesurée (T36a).
 * - Applique le cadrage perspective borné T30a sur l'enveloppe mesurée.
 * - Réutilise l'enveloppe mesurée en cas de redimensionnement CSS (resize).
 * - Aucun recalcul par frame, aucune caméra qui pompe.
 */
function ThumbnailFramingController({groupRef, ready, signature, clip, allowNonIdleClip = false, headOnly = false, onApplied}: ThumbnailFramingProps) {
    const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
    const size = useThree((state) => state.size);
    const invalidate = useThree((state) => state.invalidate);
    const controls = useThree((state) => state.controls) as { target?: THREE.Vector3; update?: () => void } | null;

    // Cache de l'enveloppe mesurée pour réutilisation immédiate au resize sans recalcul
    const cachedEnvelopeRef = useRef<{
        signature: string;
        clipName: string;
        envelope: ThumbnailIdleEnvelopeReady;
    } | null>(null);

    useLayoutEffect(() => {
        if (!ready) return;
        const group = groupRef.current;
        if (!group || typeof group.updateMatrixWorld !== 'function') return;

        // Seul le clip Idle est admissible pour le cadrage miniature strict (T36b) ;
        // en mode profil, toute animation active (Sitting, Interact, etc.) est cadrée.
        if (!clip || (!allowNonIdleClip && clip.name !== 'Idle')) {
            onApplied(null, signature);
            return;
        }

        group.updateMatrixWorld(true);

        // 1. Mesure de la boîte de la pose courante (diagnostic borné VER-16)
        const poseBox = new THREE.Box3();
        const temp = new THREE.Box3();
        let meshCount = 0;

        group.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (!mesh.isMesh || mesh.visible === false) return;
            meshCount++;

            let local: THREE.Box3 | null = null;
            const skinned = mesh as THREE.SkinnedMesh;
            if (skinned.isSkinnedMesh && typeof skinned.computeBoundingBox === 'function') {
                skinned.computeBoundingBox();
                local = skinned.boundingBox ?? null;
            } else if (mesh.geometry) {
                if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
                local = mesh.geometry.boundingBox;
            }
            if (!local || local.isEmpty()) return;

            temp.copy(local).applyMatrix4(mesh.matrixWorld);
            if (!temp.isEmpty()) poseBox.union(temp);
        });

        // 2. Récupération des racines des pièces prêtes identifiées par userData.partKey
        const parts: AvatarPartMeasurementInput[] = [];
        const seenKeys = new Set<string>();
        for (const child of group.children) {
            const partKey = child.userData?.partKey;
            if (partKey && typeof partKey === 'string' && !seenKeys.has(partKey)) {
                seenKeys.add(partKey);
                parts.push({ partKey, root: child });
            }
        }
        if (parts.length === 0) {
            group.traverse((obj) => {
                const partKey = obj.userData?.partKey;
                if (partKey && typeof partKey === 'string' && !seenKeys.has(partKey)) {
                    seenKeys.add(partKey);
                    parts.push({ partKey, root: obj });
                }
            });
        }

        if (parts.length === 0) {
            onApplied(null, signature);
            return;
        }

        // 3. Calcul ou réutilisation de l'enveloppe mesurée
        let envelope: ThumbnailIdleEnvelopeReady;
        if (headOnly) {
            envelope = { ok: true, box: poseBox, measuredGuard: [0, 0, 0], sampleCount: 1, cpuTimeMs: 0, duration: clip.duration };
        } else if (
            cachedEnvelopeRef.current &&
            cachedEnvelopeRef.current.signature === signature &&
            cachedEnvelopeRef.current.clipName === clip.name
        ) {
            envelope = cachedEnvelopeRef.current.envelope;
        } else {
            const envResult = preparedThumbnailEnvelope({ parts, clip }) ?? computeThumbnailIdleEnvelope({ parts, clip });
            if (!envResult.ok) {
                if (allowNonIdleClip && !poseBox.isEmpty()) {
                    envelope = {
                        ok: true,
                        box: poseBox.clone(),
                        measuredGuard: [0, 0, 0],
                        sampleCount: 1,
                        cpuTimeMs: 0,
                        duration: clip.duration || 0,
                    };
                } else {
                    cachedEnvelopeRef.current = null;
                    onApplied(null, signature);
                    return;
                }
            } else {
                envelope = envResult;
                cachedEnvelopeRef.current = {
                    signature,
                    clipName: clip.name,
                    envelope: envResult,
                };
            }
        }

        // 4. Projection T30a sur l'enveloppe mesurée
        const framing = computeAvatarFraming({
            box: envelope.box,
            width: size.width,
            height: size.height,
            fov: camera.fov,
        });

        if (!framing.ok) {
            onApplied(null, signature);
            return;
        }

        camera.position.set(...framing.position);
        camera.lookAt(framing.center[0], framing.center[1], framing.center[2]);
        restoreCameraClip(camera, framing.near, framing.far);
        camera.updateMatrixWorld(true);
        camera.updateProjectionMatrix();
        if (controls?.target && typeof controls.target.set === 'function') {
            controls.target.set(framing.center[0], framing.center[1], framing.center[2]);
            if (typeof controls.update === 'function') {
                controls.update();
            }
        }
        if (typeof invalidate === 'function') invalidate();

        // 5. Calcul des coins projetés et validation des matrices
        const viewElements = Array.from(camera.matrixWorldInverse.elements);
        const projElements = Array.from(camera.projectionMatrix.elements);

        if (
            viewElements.length !== 16 ||
            projElements.length !== 16 ||
            !viewElements.every(Number.isFinite) ||
            !projElements.every(Number.isFinite)
        ) {
            onApplied(null, signature);
            return;
        }

        const corners: [number, number, number][] = [];
        for (const x of [envelope.box.min.x, envelope.box.max.x]) {
            for (const y of [envelope.box.min.y, envelope.box.max.y]) {
                for (const z of [envelope.box.min.z, envelope.box.max.z]) {
                    const projected = new THREE.Vector3(x, y, z).project(camera);
                    corners.push([
                        Number(projected.x.toFixed(4)),
                        Number(projected.y.toFixed(4)),
                        Number(projected.z.toFixed(4)),
                    ]);
                }
            }
        }

        onApplied({
            width: Math.round(size.width),
            height: Math.round(size.height),
            distance: Number(framing.distance.toFixed(2)),
            center: framing.center.map((value) => Number(value.toFixed(2))) as [number, number, number],
            position: framing.position.map((value) => Number(value.toFixed(2))) as [number, number, number],
            near: Number(framing.near.toFixed(2)),
            far: Number(framing.far.toFixed(2)),
            boxMin: [envelope.box.min.x, envelope.box.min.y, envelope.box.min.z].map((value) => Number(value.toFixed(2))) as [number, number, number],
            boxMax: [envelope.box.max.x, envelope.box.max.y, envelope.box.max.z].map((value) => Number(value.toFixed(2))) as [number, number, number],
            corners,
            poseBoxMin: [poseBox.min.x, poseBox.min.y, poseBox.min.z].map((value) => Number(value.toFixed(2))) as [number, number, number],
            poseBoxMax: [poseBox.max.x, poseBox.max.y, poseBox.max.z].map((value) => Number(value.toFixed(2))) as [number, number, number],
            envelopeBoxMin: [envelope.box.min.x, envelope.box.min.y, envelope.box.min.z].map((value) => Number(value.toFixed(2))) as [number, number, number],
            envelopeBoxMax: [envelope.box.max.x, envelope.box.max.y, envelope.box.max.z].map((value) => Number(value.toFixed(2))) as [number, number, number],
            measuredGuard: envelope.measuredGuard.map((value) => Number(value.toFixed(4))) as [number, number, number],
            sampleCount: envelope.sampleCount,
            cpuTimeMs: Number(envelope.cpuTimeMs.toFixed(2)),
            viewMatrix: viewElements,
            projectionMatrix: projElements,
            partsCount: parts.length,
            meshCount,
            status: 'ready',
        }, signature);
    }, [ready, signature, clip, allowNonIdleClip, headOnly, size.width, size.height, camera, controls, groupRef, invalidate, onApplied]);

    return null;
}

export type AvatarSceneMode = 'full' | 'thumbnail' | 'profile' | 'head';

export interface AvatarSceneStatus {
    signature: string;
    framing: ThumbnailFramingInfo | null;
    frameSubmitted: boolean;
    ready: boolean;
    group: THREE.Group | null;
    expectedParts: string[];
}

export interface AvatarSceneProps {
    config: AvatarConfig;
    mode: AvatarSceneMode;
    disableZoom?: boolean;
    disablePan?: boolean;
    onAnimationsLoaded?: (animations: string[]) => void;
    view?: string;
    instanceId?: string;
    active?: boolean;
    /** Preuve réelle de frame soumise (après cadrage/tenue) ; jamais un timer. */
    onFrameSubmitted?: () => void;
    presentation?: AvatarPresentationOptions;
    onStatusChange?: (status: AvatarSceneStatus | null) => void;
    /** Changes only once a restored GPU can rebuild its shadow resources. */
    shadowRevision?: number;
}

const PreparedContactShadow = memo(function PreparedContactShadow({revision, ready, clip}: {
    revision: number; ready: boolean; clip: THREE.AnimationClip | null;
}) {
    return <ContactShadows position={[0, 0, 0]} opacity={0.6} scale={200} blur={2} far={200} resolution={256}
        frames={1} color="#000000" userData={{avatarShadowRevision: revision, avatarReady: ready, clip: clip?.name}}/>;
});

export default function AvatarScene(props: AvatarSceneProps) {
    const {config, mode} = props;
    const renderConfig = useMemo(() => mode === 'head'
        ? { head: config.head, gender: config.gender, animation: 'Idle' }
        : mode === 'thumbnail' ? { ...config, animation: 'Idle' } : config, [config, mode]);
    const signature = `${mode}:${JSON.stringify(renderConfig)}`;
    return <AvatarSceneContent key={signature} {...props} config={renderConfig} signature={signature}/>;
}

function AvatarSceneContent({
                                          config,
                                          mode,
                                         disableZoom = false,
                                         disablePan = false,
                                         onAnimationsLoaded,
                                         view,
                                         instanceId,
                                         active = true,
                                         onFrameSubmitted,
                                          presentation,
                                          onStatusChange,
                                          signature,
                                          shadowRevision = 0,
                                      }: AvatarSceneProps & {signature: string}) {
    const headOnly = mode === 'head';
    const shared = presentation?.mode === 'shared';
    const renderConfig = config;

    const expectedParts = useMemo(() => {
        if (!renderConfig) return [];
        const parts: string[] = [];
        if (renderConfig.head && renderConfig.head !== 'none') parts.push('head');
        if (!headOnly) {
            if (renderConfig.body && renderConfig.body !== 'none') parts.push('body');
            if (renderConfig.legs && renderConfig.legs !== 'none') parts.push('legs');
            if (renderConfig.feet && renderConfig.feet !== 'none') parts.push('feet');
            if (renderConfig.accessory && renderConfig.accessory !== 'none') parts.push('accessory');
        }
        return parts;
    }, [renderConfig, headOnly]);

    const [isAvatarReady, setIsAvatarReady] = useState(false);
    const handleReadinessChange = useCallback((ready: boolean) => {
        setIsAvatarReady(ready);
    }, []);

    const avatarGroupRef = useRef<THREE.Group>(null);
    const [activeClip, setActiveClip] = useState<THREE.AnimationClip | null>(null);
    const [framingInfo, setFramingInfo] = useState<ThumbnailFramingInfo | null>(null);
    const [framingReady, setFramingReady] = useState(false);
    const [framingToken, setFramingToken] = useState(0);

    const framingSignature = signature;

    const handleActiveClipChange = useCallback((clip: THREE.AnimationClip | null) => {
        setActiveClip((prev) => {
            if (prev === clip) return prev;
            if (prev && clip && prev.name === clip.name && prev.tracks?.length === clip.tracks?.length) {
                return prev;
            }
            return clip;
        });
    }, []);

    const handleFramingApplied = useCallback((info: ThumbnailFramingInfo | null, appliedSignature: string) => {
        if (appliedSignature !== framingSignature) return;
        setFramingInfo(info);
        setFramingReady(false);
        setFramingToken((token) => token + 1);
    }, [framingSignature]);

    const handleFrameSubmitted = useCallback(() => {
        if (mode !== 'full' && framingInfo === null) return;
        onFrameSubmitted?.();
        if (framingInfo !== null) {
            setFramingReady(true);
        }
    }, [onFrameSubmitted, framingInfo, mode]);

    const isThumbnail = mode === 'thumbnail';
    const isProfile = mode === 'profile';
    const isAutoFramed = mode !== 'full';

    useLayoutEffect(() => {
        onStatusChange?.({signature, framing: framingInfo, frameSubmitted: framingReady,
            ready: isAvatarReady && (!isAutoFramed || framingInfo !== null), group: avatarGroupRef.current, expectedParts});
    }, [onStatusChange, signature, framingInfo, framingReady, isAvatarReady, isAutoFramed, expectedParts]);
    useLayoutEffect(() => () => onStatusChange?.(null), [onStatusChange]);

    const controlsTarget = useMemo<[number, number, number]>(() => {
        if (isAutoFramed && framingInfo) return framingInfo.center;
        return [0, 80, 0];
    }, [isAutoFramed, framingInfo]);

    return (
        <>
                <ambientLight intensity={1.5}/>
                <directionalLight position={[10, 10, 10]} intensity={2.5}/>
                <directionalLight position={[-10, 10, -10]} intensity={1}/>

                {isAutoFramed && (
                    <ThumbnailFramingController
                        groupRef={avatarGroupRef}
                        ready={isAvatarReady}
                        signature={framingSignature}
                        clip={activeClip}
                        allowNonIdleClip={isProfile || headOnly}
                        headOnly={headOnly}
                        onApplied={handleFramingApplied}
                    />
                )}

                {/* 🚀 APRÈS : On sépare les Suspense pour éviter le conflit d'état ! */}
                <Suspense fallback={shared || headOnly ? null : <CanvasLoader/>}>
                    <ModularAvatar
                        config={renderConfig}
                        onAnimationsLoaded={onAnimationsLoaded}
                        onReadinessChange={handleReadinessChange}
                        onActiveClipChange={handleActiveClipChange}
                        groupRef={avatarGroupRef}
                        presentation={presentation}
                    />
                    {!shared && <SceneReadyProbe
                        key={isAutoFramed ? framingToken : undefined}
                        kind="avatar"
                        id={instanceId}
                        view={view ?? (headOnly ? 'head' : 'full')}
                        ready={isAvatarReady && (!isAutoFramed || framingInfo !== null)}
                        active={active}
                        expectedParts={expectedParts}
                        onFrameSubmitted={handleFrameSubmitted}
                    />}
                    {/* Une seule passe : l'ombre est un halo statique sous l'avatar, la
                        recalculer à chaque frame doublait les draw calls du Canvas. */}
                    {!headOnly && (shared ? <PreparedContactShadow revision={shadowRevision} ready={isAvatarReady} clip={activeClip}/>
                        : <ContactShadows position={[0, 0, 0]} opacity={0.6}
                                                  scale={200} blur={2} far={200} resolution={256}
                                                  frames={1} color="#000000"/>)}
                </Suspense>

                {!shared && !isThumbnail && (
                    <OrbitControls
                        makeDefault
                        enabled={!disableZoom || !disablePan}
                        enableZoom={!disableZoom}
                        enablePan={!disablePan}
                        target={controlsTarget}
                        minPolarAngle={Math.PI / 3}
                        maxPolarAngle={Math.PI / 1.7}
                        autoRotate={false}
                        autoRotateSpeed={1.5}
                    />
                )}
        </>
    );
}
