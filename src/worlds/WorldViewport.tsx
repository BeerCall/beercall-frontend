/**
 * 8h-4b-2 — Canvas persistant et trois couches de mondes.
 *
 * Un seul contexte WebGL pour les trois mondes : les décors et les avatars sont
 * montés une fois, puis les couches sont affichées/masquées. Changer d'onglet ne
 * crée ni ne détruit plus de contexte ; la caméra et les libellés suivent
 * l'onglet actif.
 *
 * Quand la modale est fermée, le Canvas reste monté mais `frameloop` passe à
 * `never` : plus aucun rendu, plus aucun mixer. Le contexte n'est libéré qu'au
 * démontage du dashboard (changement de route) ou après échec de restauration.
 */

import React, {
    Suspense,
    memo,
    use,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type RefObject,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Box3, Color, Group, Raycaster, type Mesh, type Object3D } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { loadGlb } from '../avatar/glb/loadGlb';
import { RealAvatar } from '../avatar/glb/RealAvatar';
import { useGlbManifest } from '../avatar/glb/useGlbManifest';
import WorldExcuseBubble, { excuseForWorld } from './WorldExcuseBubble';
import { WorldIdentityStack, nameForWorld } from './WorldNameLabel';
import { excuseAnchorY, photoAnchorY } from './photoAnchor';
import { createHeadHeightBatcher } from './headHeightBatcher';
import {
    WORLD_CAMERA_MIN_POLAR_ANGLE,
    worldCameraMaxPolarAngle,
} from './worldCameraLimits';
import { getWorldFloor, setWorldFloor, useWorldFloor } from './worldFloors';
import { globalLeaseController } from '../three/lease/leaseController';
import { useLease } from '../three/lease/useLease';
import { destroyRenderer, trackRenderer } from '../three/lease/webgl';
import { attachWorldContextRecovery } from './worldContextRecovery';
import {
    markPreparationGpuFrame,
    registerPreparationWorld,
    usePreparationAvatarGranted,
    usePreparationSnapshot,
    getPreparationSnapshot,
} from './worldPreparation';
import { isPreloadQuiet } from '../lib/preloadSchedule';
import { WORLD_PROBE_ENABLED } from '../perf/worldProbeGate';
import {
    AVATAR_HIT_HEIGHT,
    AVATAR_HIT_RADIUS,
    AVATAR_HIT_SEGMENTS,
    shouldOpenAvatarProfile,
} from './avatarHitTarget';
import { registerWorldHitTarget, unregisterWorldHitTarget } from './worldHitTargets';
import type { WorldDetails, WorldParticipant } from '../types/api';
import {
    WORLD_SPECS,
    spreadPoints,
    surfaceGrid,
    type WorldBounds,
    type WorldKind,
} from './pocWorldScenario';

type Placement = { index: number; x: number; y: number; z: number; surface: boolean };
type WorldMeasure = { bounds: WorldBounds; placements: Placement[]; planeY: number | null; available: number };

export interface WorldViewportProps {
    /** Modale ouverte : rendu actif. Fermé : Canvas conservé mais figé. */
    open: boolean;
    activeTab: WorldKind;
    worlds?: Record<string, WorldDetails>;
    /**
     * Apéro auquel appartiennent `worlds` (squad + Beer Call). Les données de
     * l'apéro précédent ne sont retenues que tant que cette clé ne change pas :
     * au changement de squad, le Canvas reste monté mais les participants
     * périmés ne sont ni affichés ni enregistrés dans la préparation.
     */
    dataKey: string;
    /** Version des données (Beer Call + participants) : reconstruit les couches, pas le Canvas. */
    dataVersion: string;
    onLayerReady?: (world: WorldKind) => void;
    onSelectPhoto?: (url: string) => void;
    /** Ouvre le profil de l'avatar touché (Bar, Piscine ou Dodo). */
    onSelectUser?: (userId: string) => void;
    onCanvasCreated?: () => void;
    onFirstFrame?: () => void;
}

const WORLD_KINDS: WorldKind[] = ['bar', 'piscine', 'dodo'];
const NOOP = () => undefined;
const EMPTY_PARTICIPANTS: WorldParticipant[] = [];

declare global {
    interface Window {
        /** Nombre de frames rendues par le Canvas monde (diagnostic probe). */
        __beercallWorldFrame?: number;
        /** Nombre d'objets testés par le raycaster R3F (diagnostic probe 8i). */
        __beercallWorldRaycasts?: number;
    }
}

function Controls({ kind, enabled }: { kind: WorldKind; enabled: boolean }) {
    const { camera, gl } = useThree();
    const controls = useRef<OrbitControls | null>(null);
    const floorY = useWorldFloor(kind);
    const maxPolarAngle = worldCameraMaxPolarAngle(kind, floorY);

    useEffect(() => {
        const spec = WORLD_SPECS[kind];
        const instance = new OrbitControls(camera, gl.domElement);
        instance.enableDamping = false;
        instance.enablePan = false;
        instance.autoRotate = false;
        instance.minPolarAngle = WORLD_CAMERA_MIN_POLAR_ANGLE;
        instance.maxPolarAngle = worldCameraMaxPolarAngle(kind, getWorldFloor(kind));
        instance.target.set(...spec.target);
        camera.position.set(...spec.camera);
        camera.lookAt(...spec.target);
        camera.updateProjectionMatrix();
        controls.current = instance;
        return () => {
            instance.dispose();
            controls.current = null;
        };
    }, [camera, gl, kind]);

    // Le sol arrive après la première mesure du décor : on resserre ou desserre
    // la borne sans recréer les contrôles ni replacer la caméra.
    useEffect(() => {
        const instance = controls.current;
        if (!instance) return;
        instance.maxPolarAngle = maxPolarAngle;
        instance.update();
    }, [maxPolarAngle]);

    useFrame(() => {
        if (enabled) controls.current?.update();
    });
    return null;
}

function Model({
    url,
    modelScale,
    assetUnitScale,
    modelOffsetY,
    groupRef,
}: {
    url: string;
    modelScale: number;
    assetUnitScale: number;
    modelOffsetY: number;
    groupRef: RefObject<Group | null>;
}) {
    const gltf = use(loadGlb(url));
    const clone = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
    return (
        <group
            ref={groupRef}
            scale={modelScale * assetUnitScale}
            position={[0, modelOffsetY, 0]}
        >
            <primitive object={clone} />
        </group>
    );
}

function measure(root: Object3D, kind: WorldKind, count: number): WorldMeasure {
    const spec = WORLD_SPECS[kind];
    root.updateWorldMatrix(true, true);
    const box = new Box3().setFromObject(root);
    const bounds: WorldBounds = { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z };
    const inner: WorldBounds = {
        minX: bounds.minX + spec.margin,
        maxX: bounds.maxX - spec.margin,
        minZ: bounds.minZ + spec.margin,
        maxZ: bounds.maxZ - spec.margin,
    };
    const raycaster = new Raycaster();
    raycaster.ray.direction.set(0, -1, 0);
    const hits: Array<{ x: number; y: number; z: number }> = [];
    for (const candidate of surfaceGrid(inner, 0.3)) {
        raycaster.ray.origin.set(candidate.x, box.max.y + 2, candidate.z);
        const hit = raycaster
            .intersectObject(root, true)
            .find((intersection) => intersection.point.y >= spec.walkBand[0] && intersection.point.y <= spec.walkBand[1]);
        if (hit) hits.push({ x: hit.point.x, y: hit.point.y, z: hit.point.z });
    }
    const histogram = new Map<number, number>();
    for (const hit of hits) {
        const key = Math.round(hit.y / 0.05) * 0.05;
        histogram.set(key, (histogram.get(key) ?? 0) + 1);
    }
    const bins = [...histogram.entries()]
        .map(([y, binCount]) => ({ y, count: binCount }))
        .sort((left, right) => right.count - left.count || left.y - right.y);
    const planeY = bins[0]?.y ?? null;
    const surface = planeY === null ? [] : hits.filter((hit) => Math.abs(hit.y - planeY) <= 0.13);
    const placements = spreadPoints(surface, count).map((point, index) => ({
        index, x: point.x, y: point.y, z: point.z, surface: true,
    }));
    return { bounds, placements, planeY, available: surface.length };
}

/**
 * 8i — cylindre invisible, sans survol ni suivi. `visible={false}` supprime
 * tout coût de rendu ; le raycaster Three ignore ce drapeau et teste donc la
 * géométrie au clic et à l'appui seulement.
 *
 * Le cylindre reste monté pendant toute la vie du monde. Seul le gestionnaire
 * de clic est branché sur la couche active : R3F ne met alors dans sa liste de
 * raycast que les cylindres actifs, donc les couches cachées n'interceptent
 * rien et ne coûtent rien. Changer d'onglet ne crée ni ne détruit de géométrie.
 */
const AvatarHitTarget = memo(function AvatarHitTarget({
    world,
    userId,
    username,
    active,
    onSelectUser,
}: {
    world: WorldKind;
    userId: string;
    username?: string | null;
    active: boolean;
    onSelectUser: (userId: string) => void;
}) {
    const meshRef = useRef<Mesh>(null);
    const camera = useThree((state) => state.camera);

    // Diagnostic uniquement : publie la position NDC après deux RAF, quand la
    // caméra et les placements sont stables. Aucune projection par image.
    useEffect(() => {
        if (!WORLD_PROBE_ENABLED || !active) return;
        let first = 0;
        let second = 0;
        first = requestAnimationFrame(() => {
            second = requestAnimationFrame(() => {
                if (!meshRef.current) return;
                registerWorldHitTarget({
                    world, userId, username, object: meshRef.current, camera,
                });
            });
        });
        return () => {
            cancelAnimationFrame(first);
            cancelAnimationFrame(second);
            unregisterWorldHitTarget(world, userId);
        };
    }, [active, camera, userId, username, world]);

    return (
        <mesh
            ref={meshRef}
            position={[0, AVATAR_HIT_HEIGHT / 2, 0]}
            visible={false}
            onClick={active ? (event) => {
                event.stopPropagation();
                if (!shouldOpenAvatarProfile(event.delta)) return;
                onSelectUser(userId);
            } : undefined}
        >
            <cylinderGeometry
                args={[AVATAR_HIT_RADIUS, AVATAR_HIT_RADIUS, AVATAR_HIT_HEIGHT, AVATAR_HIT_SEGMENTS]}
            />
            <meshBasicMaterial/>
        </mesh>
    );
});

/**
 * 8i — la zone n'apparaît qu'une fois l'avatar accordé par la préparation, donc
 * en même temps que le GLB, et jamais à l'ouverture de la modale.
 */
const AvatarHitSlot = memo(function AvatarHitSlot({
    world,
    index,
    userId,
    username,
    active,
    onSelectUser,
}: {
    world: WorldKind;
    index: number;
    userId?: string | number;
    username?: string | null;
    active: boolean;
    onSelectUser: (userId: string) => void;
}) {
    const granted = usePreparationAvatarGranted(world, index);
    if (!granted || userId === undefined) return null;
    return (
        <AvatarHitTarget world={world} userId={String(userId)} username={username}
                         active={active} onSelectUser={onSelectUser}/>
    );
});

const WorldAvatar = memo(function WorldAvatar({
    kind,
    config,
    userId,
    index,
    isActive,
    onReady,
    onIdle,
    onHeadAnchor,
}: {
    kind: WorldKind;
    config: NonNullable<WorldParticipant['avatar_config']>;
    userId?: string | number;
    index: number;
    isActive: () => boolean;
    onReady: (index: number) => void;
    onIdle: (index: number) => void;
    onHeadAnchor?: (index: number, height: number) => void;
}) {
    const granted = usePreparationAvatarGranted(kind, index);
    // P2 parity: the PoC world default renders no accessories (step 5).
    const bodyConfig = useMemo(() => {
        const next = {...config};
        delete next.accessory;
        return next;
    }, [config]);
    if (!granted) return null;
    return (
        <RealAvatar
            config={bodyConfig}
            userId={userId}
            animate={isActive}
            scale={0.01}
            onReadinessChange={(ready) => {
                if (ready) onReady(index);
            }}
            onHeadAnchor={(height) => onHeadAnchor?.(index, height)}
            onActiveClipChange={() => onIdle(index)}
        />
    );
});

function Crowd({
    kind,
    participants,
    labelsVisible,
    active,
    isActive,
    groupRef,
    onReady,
    onIdle,
    onSelectPhoto,
    onSelectUser,
}: {
    kind: WorldKind;
    participants: WorldParticipant[];
    labelsVisible: boolean;
    active: boolean;
    isActive: () => boolean;
    groupRef: RefObject<Group | null>;
    onReady: (index: number) => void;
    onIdle: (index: number) => void;
    onSelectPhoto?: (url: string) => void;
    onSelectUser?: (userId: string) => void;
}) {
    const [placements, setPlacements] = useState<Placement[] | null>(null);
    const [headHeights, setHeadHeights] = useState<Record<number, number>>({});
    const headHeightBatcher = useMemo(
        () => createHeadHeightBatcher({
            onFlush: (heights) => {
                console.info(`[world] labels ${kind}`, {count: Object.keys(heights).length});
                setHeadHeights(heights);
            },
        }),
        [kind],
    );
    const handleHeadAnchor = useCallback((index: number, height: number) => {
        headHeightBatcher.add(index, height);
    }, [headHeightBatcher]);

    useEffect(() => () => headHeightBatcher.cancel(), [headHeightBatcher]);

    useEffect(() => {
        const group = groupRef.current;
        if (!group) return;
        const measured = measure(group, kind, participants.length);
        console.info(`[world] measure ${kind}`, {
            participants: participants.length,
            available: measured.available,
            placements: measured.placements.length,
            planeY: measured.planeY,
            bounds: measured.bounds,
        });
        setPlacements(measured.placements);
        setWorldFloor(kind, measured.planeY);
    }, [groupRef, kind, participants.length]);

    const expectedHeadAnchors = placements
        ? placements.filter((placement) => placement.surface && Boolean(participants[placement.index]?.avatar_config)).length
        : 0;

    useEffect(() => {
        if (!placements) return;
        headHeightBatcher.setExpected(expectedHeadAnchors);
    }, [placements, expectedHeadAnchors, headHeightBatcher]);

    if (!placements) return null;

    return (
        <>
            {placements.filter((placement) => placement.surface).map((placement) => {
                const participant = participants[placement.index];
                const config = participant?.avatar_config;
                if (!config) return null;
                const photoUrl = participant.proof_photo_url;
                const headHeight = headHeights[placement.index];
                const excuse = excuseForWorld(kind, participant);
                const name = nameForWorld(kind, participant);
                return (
                    <group
                        key={`${participant.user_id ?? participant.id ?? placement.index}`}
                        position={[placement.x, placement.y, placement.z]}
                    >
                        <WorldAvatar
                            kind={kind}
                            config={config}
                            userId={participant.user_id ?? participant.id ?? placement.index}
                            index={placement.index}
                            isActive={isActive}
                            onReady={onReady}
                            onIdle={onIdle}
                            onHeadAnchor={handleHeadAnchor}
                        />
                        {onSelectUser && (
                            <AvatarHitSlot
                                world={kind}
                                index={placement.index}
                                userId={participant.user_id ?? participant.id}
                                username={participant.username}
                                active={active}
                                onSelectUser={onSelectUser}
                            />
                        )}
                        {labelsVisible && kind !== 'piscine' && headHeight !== undefined && (name || (photoUrl && onSelectPhoto)) && (
                            <Html position={[0, photoAnchorY(headHeight), 0]} center
                                  zIndexRange={[100, 0]} style={{pointerEvents: 'none'}}>
                                <div style={{transform: 'translateY(-100%)'}}>
                                    <WorldIdentityStack name={name} photoUrl={photoUrl}
                                                        onSelectPhoto={onSelectPhoto}/>
                                </div>
                            </Html>
                        )}
                        {labelsVisible && excuse && headHeight !== undefined && (
                            <Html position={[0, excuseAnchorY(headHeight), 0]} center
                                  zIndexRange={[100, 0]} style={{pointerEvents: 'none'}}>
                                <div style={{transform: 'translateY(-100%)'}}>
                                    <WorldExcuseBubble excuse={excuse} username={participant.username}/>
                                </div>
                            </Html>
                        )}
                    </group>
                );
            })}
        </>
    );
}

function EntryReporter({
    kind,
    ready,
    idle,
    expected,
    startedAt,
    onEntry,
}: {
    kind: WorldKind;
    ready: RefObject<Set<number>>;
    idle: RefObject<Set<number>>;
    expected: number;
    startedAt: number;
    onEntry: (entryMs: number) => void;
}) {
    const { gl } = useThree();
    const reported = useRef(false);
    useFrame(() => {
        if (reported.current) return;
        if ((ready.current?.size ?? 0) < expected || (idle.current?.size ?? 0) < expected) return;
        if ((gl.info?.render.frame ?? 0) <= 0) return;
        reported.current = true;
        const entryMs = performance.now() - startedAt;
        console.info(`[world] ready ${kind}`, { entryMs: Math.round(entryMs), avatars: expected });
        onEntry(entryMs);
    });
    return null;
}

function PrepFrame({world, active}: {world: WorldKind; active: boolean}) {
    useFrame(() => {
        if (active) markPreparationGpuFrame(world);
    });
    return null;
}

const WorldLayer = memo(function WorldLayer({
    kind,
    decorUrl,
    participants,
    groupVisible,
    labelsVisible,
    active,
    prepActive,
    dataVersion,
    activityRef,
    onLayerReady,
    onSelectPhoto,
    onSelectUser,
}: {
    kind: WorldKind;
    decorUrl: string;
    participants: WorldParticipant[];
    groupVisible: boolean;
    labelsVisible: boolean;
    /** Couche affichée et modale ouverte : seule cette couche répond au toucher. */
    active: boolean;
    prepActive: boolean;
    dataVersion: string;
    activityRef: RefObject<{world: WorldKind; open: boolean}>;
    onLayerReady: (world: WorldKind) => void;
    onSelectPhoto?: (url: string) => void;
    onSelectUser?: (userId: string) => void;
}) {
    const spec = WORLD_SPECS[kind];
    const groupRef = useRef<Group | null>(null);
    const [startedAt] = useState(() => performance.now());
    const expected = participants.filter((participant) => Boolean(participant.avatar_config)).length;
    const ready = useRef(new Set<number>());
    const idle = useRef(new Set<number>());
    const isActive = useCallback(() => {
        const activity = activityRef.current;
        return activity.open && activity.world === kind;
    }, [activityRef, kind]);

    // Réinitialise les compteurs quand les données changent (même Canvas).
    useEffect(() => {
        ready.current = new Set<number>();
        idle.current = new Set<number>();
    }, [dataVersion]);

    // Déclare les avatars à préparer ; le magasin les accorde un par tranche.
    useEffect(() => {
        const indices: number[] = [];
        participants.forEach((participant, index) => {
            if (participant.avatar_config) indices.push(index);
        });
        registerPreparationWorld(kind, indices);
    }, [kind, participants]);

    const onAvatarReady = useCallback((index: number) => {
        ready.current.add(index);
    }, []);
    const onAvatarIdle = useCallback((index: number) => {
        idle.current.add(index);
    }, []);

    return (
        <group visible={groupVisible}>
            <Model
                url={decorUrl}
                modelScale={spec.modelScale}
                assetUnitScale={spec.assetUnitScale}
                modelOffsetY={spec.modelOffsetY}
                groupRef={groupRef}
            />
            <Crowd
                kind={kind}
                participants={participants}
                labelsVisible={labelsVisible}
                active={active}
                isActive={isActive}
                groupRef={groupRef}
                onReady={onAvatarReady}
                onIdle={onAvatarIdle}
                onSelectPhoto={onSelectPhoto}
                onSelectUser={onSelectUser}
            />
            <EntryReporter
                kind={kind}
                ready={ready}
                idle={idle}
                expected={expected}
                startedAt={startedAt}
                onEntry={() => onLayerReady(kind)}
            />
            <PrepFrame world={kind} active={prepActive}/>
        </group>
    );
});

function FrameReporter() {
    const { gl } = useThree();
    useFrame(() => {
        if (typeof window !== 'undefined') {
            window.__beercallWorldFrame = gl.info.render.frame;
        }
    });
    return null;
}

/**
 * Diagnostic 8i : compte les objets réellement testés par le raycaster Three.
 * Installé uniquement dans le build probe. Un déplacement sans gestionnaire de
 * survol ne doit ajouter aucun test.
 */
function installProbeRaycastCounter(): () => void {
    const prototype = Raycaster.prototype;
    const original = prototype.intersectObject;
    const patched = function (this: Raycaster, ...args: Parameters<typeof original>) {
        if (typeof window !== 'undefined') {
            window.__beercallWorldRaycasts = (window.__beercallWorldRaycasts ?? 0) + 1;
        }
        return original.apply(this, args);
    };
    prototype.intersectObject = patched as typeof original;
    return () => {
        prototype.intersectObject = original;
    };
}

function ProbeRaycastCounter() {
    useEffect(() => installProbeRaycastCounter(), []);
    return null;
}

function WorldContextRecovery({
    onFailed,
    onRestored,
}: {
    onFailed: () => void;
    onRestored: () => void;
}) {
    const { gl, invalidate } = useThree();

    useEffect(() => attachWorldContextRecovery(gl.domElement, {
        onRestored: () => {
            onRestored();
            try {
                invalidate();
            } catch (error) {
                console.error('[world] invalidate après restauration a échoué', error);
            }
        },
        onFailed,
    }), [gl, invalidate, onFailed, onRestored]);

    return null;
}

function FirstOpenFrame({open, onFirstFrame}: {open: boolean; onFirstFrame?: () => void}) {
    const reported = useRef(false);
    useEffect(() => {
        if (!open) reported.current = false;
    }, [open]);
    useFrame(() => {
        if (open && !reported.current) {
            reported.current = true;
            onFirstFrame?.();
        }
    });
    return null;
}

function ViewportCanvas({
    open,
    activeTab,
    worlds,
    dataKey,
    dataVersion,
    onLayerReady,
    onSelectPhoto,
    onSelectUser,
    onCanvasCreated,
    onFirstFrame,
    onContextFailed,
    onContextRestored,
}: WorldViewportProps & {
    onContextFailed: () => void;
    onContextRestored: () => void;
}) {
    const { granted, token } = useLease('world');
    const manifestQuery = useGlbManifest();
    const preparation = usePreparationSnapshot();
    const [prepWorld, setPrepWorld] = useState<WorldKind | null>(null);
    const activityRef = useRef<{world: WorldKind; open: boolean}>({world: activeTab, open});
    useEffect(() => {
        activityRef.current = {world: activeTab, open};
    }, [activeTab, open]);

    // Un rendu caché par couche, au repos, pour compiler textures et shaders.
    useEffect(() => {
        if (preparation.phase !== 'gpu' || open) {
            return;
        }
        let cancelled = false;
        let timer: number | undefined;
        let index = 0;
        const prepWorlds: WorldKind[] = ['bar', 'piscine', 'dodo'];
        const step = () => {
            if (cancelled) return;
            if (!isPreloadQuiet()) {
                timer = window.setTimeout(step, 250);
                return;
            }
            if (index >= prepWorlds.length) {
                setPrepWorld(null);
                return;
            }
            const world = prepWorlds[index];
            index += 1;
            setPrepWorld(world);
            const deadline = performance.now() + 2_000;
            const waitFrame = () => {
                if (cancelled) return;
                if (getPreparationSnapshot().worlds[world].frame || performance.now() > deadline) {
                    timer = window.setTimeout(step, 60);
                    return;
                }
                window.requestAnimationFrame(waitFrame);
            };
            window.requestAnimationFrame(waitFrame);
        };
        timer = window.setTimeout(step, 40);
        return () => {
            cancelled = true;
            if (timer !== undefined) window.clearTimeout(timer);
            setPrepWorld(null);
        };
    }, [preparation.phase, open]);
    // Conserve les dernières données pendant qu'un nouveau Beer Call charge :
    // le Canvas ne doit jamais être démonté pour un simple changement de query.
    // La rétention est liée à `dataKey` : dès que l'apéro change, les données
    // de l'ancien apéro sont abandonnées au lieu d'être réutilisées.
    const [retained, setRetained] = useState<{key: string; worlds?: Record<string, WorldDetails>}>(() => ({
        key: dataKey,
        worlds,
    }));
    if (retained.key !== dataKey || (worlds !== undefined && retained.worlds !== worlds)) {
        setRetained({key: dataKey, worlds});
    }
    const data = worlds ?? (retained.key === dataKey ? retained.worlds : undefined);

    if (!granted || !token || !manifestQuery.data) {
        return <div className="w-full h-full" />;
    }

    const activeToken = token;
    const decors = manifestQuery.data.items;
    const decorUrlFor = (world: WorldKind) =>
        decors.find((item) => item.key === WORLD_SPECS[world].decorKey)?.url;

    return (
        <Canvas
            frameloop={open || prepWorld ? 'always' : 'never'}
            dpr={[1.5, 1.5]}
            gl={{ antialias: false, powerPreference: 'high-performance' }}
            camera={{ position: WORLD_SPECS[activeTab].camera, fov: 45 }}
            onCreated={({ gl }) => {
                trackRenderer(gl);
                globalLeaseController.attach(activeToken, () => destroyRenderer(gl));
                onCanvasCreated?.();
            }}
        >
            <WorldContextRecovery onFailed={onContextFailed} onRestored={onContextRestored}/>
            <FrameReporter/>
            {WORLD_PROBE_ENABLED && <ProbeRaycastCounter/>}
            <FirstOpenFrame open={open} onFirstFrame={onFirstFrame}/>
            <Controls kind={activeTab} enabled={open || Boolean(prepWorld)}/>
            <color attach="background" args={[new Color('#17222d')]} />
            <hemisphereLight intensity={1.3} />
            <directionalLight position={[5, 8, 4]} intensity={1.6} />
            <Suspense fallback={null}>
                {WORLD_KINDS.map((world) => {
                    const decorUrl = decorUrlFor(world);
                    if (!decorUrl) return null;
                    return (
                        <WorldLayer
                            key={`${world}-${dataVersion}`}
                            kind={world}
                            decorUrl={decorUrl}
                            participants={data?.[world]?.participants ?? EMPTY_PARTICIPANTS}
                            groupVisible={world === activeTab || prepWorld === world}
                            labelsVisible={world === activeTab}
                            active={open && world === activeTab}
                            prepActive={prepWorld === world}
                            dataVersion={dataVersion}
                            activityRef={activityRef}
                            onLayerReady={onLayerReady ?? NOOP}
                            onSelectPhoto={world === activeTab ? onSelectPhoto : undefined}
                            onSelectUser={onSelectUser}
                        />
                    );
                })}
            </Suspense>
        </Canvas>
    );
}

export const WorldViewport: React.FC<WorldViewportProps> = (props) => {
    const [recoveryEpoch, setRecoveryEpoch] = useState(0);
    const [contextError, setContextError] = useState(false);

    const retry = useCallback(() => {
        console.error('[world] Nouvelle tentative de contexte WebGL après échec de restauration');
        setContextError(false);
        setRecoveryEpoch((epoch) => epoch + 1);
    }, []);

    const handleFailed = useCallback(() => {
        setContextError(true);
    }, []);
    const handleRestored = useCallback(() => {
        setContextError(false);
    }, []);

    return (
        <div
            className="relative h-full w-full"
            data-testid="world-viewport"
            data-open={props.open ? '1' : '0'}
        >
            {contextError && (
                <div
                    data-testid="world-context-error"
                    role="alert"
                    className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-[#0f081c]/85 p-6 text-center text-white"
                >
                    <p className="max-w-sm text-sm font-bold leading-relaxed">
                        Le rendu 3D a perdu son contexte et la restauration automatique a échoué.
                    </p>
                    <button
                        type="button"
                        onClick={retry}
                        className="min-h-11 rounded-full bg-amber-400 px-5 py-2 text-sm font-black text-[#0f081c]"
                    >
                        Réessayer
                    </button>
                </div>
            )}
            <ViewportCanvas
                key={recoveryEpoch}
                {...props}
                onContextFailed={handleFailed}
                onContextRestored={handleRestored}
            />
        </div>
    );
};
