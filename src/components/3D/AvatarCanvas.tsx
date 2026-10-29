import {Suspense, useMemo, useEffect, useLayoutEffect, useRef, useState, useCallback, useContext} from 'react';
import {Canvas, useThree, type EventManager} from '@react-three/fiber';
import {
    OrbitControls,
    ContactShadows,
    Html,
    useProgress
} from '@react-three/drei';
import {QueryClientContext} from '@tanstack/react-query';
import * as THREE from 'three';
import {MODELS_URL} from "../../lib/api.ts";
import {computeAvatarFraming} from "../../lib/avatarFraming.ts";
import {preparedThumbnailEnvelope} from '../../lib/thumbnailEnvelopeCatalog';
import {
    computeThumbnailIdleEnvelope,
    type ThumbnailIdleEnvelopeReady,
    type AvatarPartMeasurementInput,
} from "../../lib/thumbnailIdleEnvelope";
import type {AvatarConfig} from "../../types/avatar.ts";
import {ModularAvatar} from './ModularAvatar';
export {ModularAvatar} from './ModularAvatar';
import SceneReadyProbe from './SceneReadyProbe';
import {warmAvatarModels} from './warmupAvatar';
import {preloadAvatarAnimations} from '../../hooks/useAvatarAnimations';
import {useModel} from '../../hooks/useModel';
import {recordAvatarLoading} from '../../lib/avatarLoadingTrace';

const CONFIG = {
    scale: 1,
    cameraZ: 300,
    cameraTargetY: 80
};

// Les miniatures de liste n'ont pas besoin de raycasting/pointeur R3F :
// cela évite d'enregistrer des écouteurs DOM superflus et prévient tout crash si
// le conteneur est démonté pendant l'initialisation asynchrone de R3F configure().
const noopEventManager = (): EventManager<HTMLElement> => ({
    enabled: false,
    priority: 0,
    connect: () => {},
    disconnect: () => {},
});

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

function restoreClockElapsed(clockInstance: { elapsedTime: number }, elapsed: number) {
    clockInstance.elapsedTime = elapsed;
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
    onApplied: (info: ThumbnailFramingInfo | null, signature: string) => void;
}

/**
 * Cadrage opt-in des miniatures et du profil (T36b / VER-13 / VER-16) :
 * - Mesure l'enveloppe complète sur clones isolés avec garde mesurée (T36a).
 * - Applique le cadrage perspective borné T30a sur l'enveloppe mesurée.
 * - Réutilise l'enveloppe mesurée en cas de redimensionnement CSS (resize).
 * - Aucun recalcul par frame, aucune caméra qui pompe.
 */
function ThumbnailFramingController({groupRef, ready, signature, clip, allowNonIdleClip = false, onApplied}: ThumbnailFramingProps) {
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
        if (
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
    }, [ready, signature, clip, allowNonIdleClip, size.width, size.height, camera, controls, groupRef, invalidate, onApplied]);

    return null;
}

function AvatarFrameloopController({ active }: { active: boolean }) {
    const setFrameloop = useThree((state) => state.setFrameloop);
    const clock = useThree((state) => state.clock);
    const invalidate = useThree((state) => state.invalidate);
    const savedElapsedRef = useRef(0);
    const wasActiveRef = useRef(true);

    useLayoutEffect(() => {
        if (active) {
            if (!wasActiveRef.current) {
                // Dégel : redémarrage de l'horloge sans inclure l'inactivité (CHAL-04, REV-06)
                if (typeof setFrameloop === 'function') {
                    setFrameloop('always');
                }
                // Fiber resets elapsedTime in setFrameloop; restore only AFTER it starts the clock.
                if (clock) restoreClockElapsed(clock, savedElapsedRef.current);
                if (typeof invalidate === 'function') {
                    invalidate();
                }
                wasActiveRef.current = true;
            }
        } else {
            if (wasActiveRef.current) {
                // Gel : sauvegarde du temps écoulé et arrêt du frameloop
                if (clock) {
                    savedElapsedRef.current = typeof clock.getElapsedTime === 'function'
                        ? clock.getElapsedTime()
                        : (clock.elapsedTime || 0);
                }
                if (typeof setFrameloop === 'function') {
                    setFrameloop('never');
                }
                wasActiveRef.current = false;
            }
        }
    }, [active, setFrameloop, clock, invalidate]);

    useEffect(() => {
        return () => {
            if (!wasActiveRef.current && typeof setFrameloop === 'function') {
                setFrameloop('always');
            }
        };
    }, [setFrameloop]);

    return null;
}

interface AvatarCanvasProps {
    config: AvatarConfig;
    disableZoom?: boolean;
    disablePan?: boolean;
    onAnimationsLoaded?: (animations: string[]) => void;
    headOnly?: boolean;
    view?: string;
    instanceId?: string;
    active?: boolean;
    /** Preuve réelle de frame soumise (après cadrage/tenue) ; jamais un timer. */
    onFrameSubmitted?: () => void;
    /** `thumbnail` active un cadrage local borné ; `profile` active le cadrage borné interactif ; défaut = caméra historique intacte. */
    framing?: 'default' | 'thumbnail' | 'profile';
}

export default function AvatarCanvas({
                                         config,
                                         disableZoom = false,
                                         disablePan = false,
                                         onAnimationsLoaded,
                                         headOnly = false,
                                         view,
                                         instanceId,
                                         active = true,
                                         onFrameSubmitted,
                                         framing = 'default',
                                     }: AvatarCanvasProps) {
    const [isDocumentVisible, setIsDocumentVisible] = useState(() =>
        typeof document === 'undefined' ? true : !document.hidden
    );

    useEffect(() => {
        const handleVisibilityChange = () => {
            setIsDocumentVisible(!document.hidden);
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    const isEffectiveActive = active && isDocumentVisible;
    useEffect(() => {
        const canvasView = view ?? (headOnly ? 'head' : 'full');
        recordAvatarLoading('avatar-mount', 'start', canvasView);
        return () => recordAvatarLoading('avatar-mount', 'end', canvasView);
    }, [view, headOnly]);

    // Le manifeste et le clip Idle sont indépendants des FBX : les demander dès
    // le montage du Canvas évite d'attendre la fin du parse des modèles pour
    // commencer le téléchargement des animations.
    const queryClient = useContext(QueryClientContext);
    useEffect(() => {
        if (queryClient) void preloadAvatarAnimations(queryClient);
    }, [queryClient]);

    // 🚀 PRÉCHARGEMENT CIBLÉ DES VÊTEMENTS
    useEffect(() => {
        if (!config) return;
        if (headOnly) {
            if (config.head && config.head !== 'none') useModel.preload(`${MODELS_URL}/${config.head}.fbx`);
        } else {
            warmAvatarModels(config);
        }
    }, [config, headOnly]);

    const targetY = headOnly ? 160 : CONFIG.cameraTargetY;
    const cameraZ = headOnly ? 80 : CONFIG.cameraZ;
    const renderConfig = useMemo(() => {
        if (!config) return config;
        if (headOnly) {
            return { head: config.head, gender: config.gender, animation: config.animation };
        }
        if (framing === 'thumbnail') {
            return { ...config, animation: 'Idle' };
        }
        return config;
    }, [headOnly, config, framing]);

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

    const framingSignature = useMemo(() => JSON.stringify(renderConfig), [renderConfig]);

    const [prevSignature, setPrevSignature] = useState(framingSignature);
    if (prevSignature !== framingSignature) {
        setPrevSignature(framingSignature);
        setFramingReady(false);
        setFramingInfo(null);
    }

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
        if ((framing === 'thumbnail' || framing === 'profile') && !headOnly && framingInfo === null) return;
        onFrameSubmitted?.();
        if (framingInfo !== null) {
            setFramingReady(true);
        }
    }, [onFrameSubmitted, framingInfo, framing, headOnly]);

    const isThumbnail = framing === 'thumbnail' && !headOnly;
    const isProfile = framing === 'profile' && !headOnly;
    const isAutoFramed = isThumbnail || isProfile;
    const framingPhase = isAutoFramed
        ? (framingReady && isEffectiveActive && framingInfo !== null ? 'ready' : 'pending')
        : undefined;

    const controlsTarget = useMemo<[number, number, number]>(() => {
        if (isAutoFramed && framingInfo) return framingInfo.center;
        return [0, targetY, 0];
    }, [isAutoFramed, framingInfo, targetY]);

    return (
        <div
            className="w-full h-full relative"
            data-avatar-framing={framingPhase}
            data-avatar-framing-info={isAutoFramed && framingInfo ? JSON.stringify(framingInfo) : undefined}
        >
            <Canvas camera={{position: [0, targetY, cameraZ], fov: 45}} dpr={[1, 1.5]}
                    events={isThumbnail ? noopEventManager : undefined}
                    className={`z-10 relative ${isAutoFramed && !framingInfo ? 'opacity-0' : 'opacity-100'}`}>
                <AvatarFrameloopController active={isEffectiveActive}/>
                <ambientLight intensity={1.5}/>
                <directionalLight position={[10, 10, 10]} intensity={2.5}/>
                <directionalLight position={[-10, 10, -10]} intensity={1}/>

                {isAutoFramed && (
                    <ThumbnailFramingController
                        groupRef={avatarGroupRef}
                        ready={isAvatarReady}
                        signature={framingSignature}
                        clip={activeClip}
                        allowNonIdleClip={isProfile}
                        onApplied={handleFramingApplied}
                    />
                )}

                {/* 🚀 APRÈS : On sépare les Suspense pour éviter le conflit d'état ! */}
                <Suspense fallback={headOnly ? null : <CanvasLoader/>}>
                    <ModularAvatar
                        config={renderConfig}
                        onAnimationsLoaded={onAnimationsLoaded}
                        onReadinessChange={handleReadinessChange}
                        onActiveClipChange={handleActiveClipChange}
                        groupRef={avatarGroupRef}
                    />
                    <SceneReadyProbe
                        key={isAutoFramed ? framingToken : undefined}
                        kind="avatar"
                        id={instanceId}
                        view={view ?? (headOnly ? 'head' : 'full')}
                        ready={isAvatarReady}
                        active={isEffectiveActive}
                        expectedParts={expectedParts}
                        onFrameSubmitted={handleFrameSubmitted}
                    />
                    {/* Une seule passe : l'ombre est un halo statique sous l'avatar, la
                        recalculer à chaque frame doublait les draw calls du Canvas. */}
                    {!headOnly && <ContactShadows position={[0, 0, 0]} opacity={0.6}
                                                  scale={200} blur={2} far={200} resolution={256}
                                                  frames={1} color="#000000"/>}
                </Suspense>

                {!isThumbnail && (
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
            </Canvas>
        </div>
    );
}
