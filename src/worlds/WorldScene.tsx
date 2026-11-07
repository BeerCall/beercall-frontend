/**
 * P2 — scène Monde alignée sur `poc/fluidite/src/world/WorldScreen.tsx` (7ad2d84).
 *
 * Adaptations autorisées :
 * - participants fournis par l'API (`WorldParticipant.avatar_config`) ;
 * - décor résolu par le manifeste A13 (`decor/bar`, `decor/piscine`, `decor/dodo`).
 *
 * Aucun poster, aucun `WorldFirstFrame`, aucune étiquette HTML.
 */

import React, {
    Suspense,
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
import { Box3, Color, Group, Raycaster, type Object3D } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { loadGlb } from '../avatar/glb/loadGlb';
import { RealAvatar } from '../avatar/glb/RealAvatar';
import { useGlbManifest } from '../avatar/glb/useGlbManifest';
import WorldExcuseBubble, { excuseForWorld } from './WorldExcuseBubble';
import { WorldIdentityStack, nameForWorld } from './WorldNameLabel';
import { excuseAnchorY, photoAnchorY } from './photoAnchor';
import { createHeadHeightBatcher } from './headHeightBatcher';
import { globalLeaseController } from '../three/lease/leaseController';
import { useLease } from '../three/lease/useLease';
import { destroyRenderer, trackRenderer } from '../three/lease/webgl';
import type { AvatarConfig } from '../types/avatar';
import type { WorldParticipant } from '../types/api';
import {
    WORLD_SPECS,
    spreadPoints,
    surfaceGrid,
    type WorldBounds,
    type WorldKind,
} from './pocWorldScenario';

type Placement = { index: number; x: number; y: number; z: number; surface: boolean };
type WorldMeasure = { bounds: WorldBounds; placements: Placement[]; planeY: number | null; available: number };

/** Published GLBs do not all share the same unit: Bar/Dodo are cm-like, Piscine is metres. */

export interface WorldSceneProps {
    world: WorldKind;
    participants: WorldParticipant[];
    onReady?: (entryMs: number) => void;
    onSelectPhoto?: (url: string) => void;
}

function Controls({ autoRotate, target }: { autoRotate: boolean; target: [number, number, number] }) {
    const { camera, gl } = useThree();
    const controls = useRef<OrbitControls | null>(null);
    useEffect(() => {
        const instance = new OrbitControls(camera, gl.domElement);
        instance.enableDamping = false;
        instance.enablePan = false;
        instance.autoRotate = autoRotate;
        instance.autoRotateSpeed = 1.8;
        instance.target.set(...target);
        camera.lookAt(...target);
        controls.current = instance;
        return () => { instance.dispose(); controls.current = null; };
    }, [camera, gl, autoRotate, target]);
    useFrame(() => controls.current?.update());
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
    // Même cache CPU que le préchargement et RealAvatar : ouvrir un monde avant
    // la fin du préchargement réutilise la promesse en cours, sans retélécharger.
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

function WorldAvatar({
    config,
    userId,
    onReady,
    onIdle,
    onHeadAnchor,
}: {
    config: AvatarConfig;
    userId?: string | number;
    onReady: () => void;
    onIdle: () => void;
    onHeadAnchor?: (height: number) => void;
}) {
    // P2 parity: the PoC world default renders no accessories (step 5).
    const bodyConfig = useMemo(() => {
        const next = {...config};
        delete next.accessory;
        return next;
    }, [config]);
    return (
        <RealAvatar
            config={bodyConfig}
            userId={userId}
            scale={0.01}
            onReadinessChange={(ready) => {
                if (ready) onReady();
            }}
            onHeadAnchor={onHeadAnchor}
            onActiveClipChange={onIdle}
        />
    );
}

function Crowd({
    kind,
    participants,
    groupRef,
    onReady,
    onIdle,
    onSelectPhoto,
}: {
    kind: WorldKind;
    participants: WorldParticipant[];
    groupRef: RefObject<Group | null>;
    onReady: (index: number) => void;
    onIdle: (index: number) => void;
    onSelectPhoto?: (url: string) => void;
}) {
    const [placements, setPlacements] = useState<Placement[] | null>(null);
    const [headHeights, setHeadHeights] = useState<Record<number, number>>({});
    // Une seule mise à jour d'état pour toutes les hauteurs de tête du monde.
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
                            config={config}
                            userId={participant.user_id ?? participant.id ?? placement.index}
                            onReady={() => onReady(placement.index)}
                            onIdle={() => onIdle(placement.index)}
                            onHeadAnchor={(height) => handleHeadAnchor(placement.index, height)}
                        />
                        {kind !== 'piscine' && headHeight !== undefined && (name || (photoUrl && onSelectPhoto)) && (
                            <Html position={[0, photoAnchorY(headHeight), 0]} center
                                  zIndexRange={[100, 0]} style={{pointerEvents: 'none'}}>
                                <div style={{transform: 'translateY(-100%)'}}>
                                    <WorldIdentityStack name={name} photoUrl={photoUrl}
                                                        onSelectPhoto={onSelectPhoto}/>
                                </div>
                            </Html>
                        )}
                        {excuse && headHeight !== undefined && (
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
        // Les compteurs vivent dans des refs : aucune readiness ne re-rend la scène.
        if ((ready.current?.size ?? 0) < expected || (idle.current?.size ?? 0) < expected) return;
        if ((gl.info?.render.frame ?? 0) <= 0) return;
        reported.current = true;
        const entryMs = performance.now() - startedAt;
        console.info(`[world] ready ${kind}`, { entryMs: Math.round(entryMs), avatars: expected });
        onEntry(entryMs);
    });
    return null;
}

function Scene({
    kind,
    decorUrl,
    participants,
    onEntry,
    onSelectPhoto,
}: {
    kind: WorldKind;
    decorUrl: string;
    participants: WorldParticipant[];
    onEntry: (entryMs: number) => void;
    onSelectPhoto?: (url: string) => void;
}) {
    const spec = WORLD_SPECS[kind];
    const groupRef = useRef<Group | null>(null);
    const [startedAt] = useState(() => performance.now());
    const expected = participants.filter((participant) => Boolean(participant.avatar_config)).length;
    const ready = useRef(new Set<number>());
    const idle = useRef(new Set<number>());

    const onAvatarReady = useCallback((index: number) => {
        ready.current.add(index);
    }, []);
    const onAvatarIdle = useCallback((index: number) => {
        idle.current.add(index);
    }, []);

    return (
        <>
            <color attach="background" args={[new Color('#17222d')]} />
            <hemisphereLight intensity={1.3} />
            <directionalLight position={[5, 8, 4]} intensity={1.6} />
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
                groupRef={groupRef}
                onReady={onAvatarReady}
                onIdle={onAvatarIdle}
                onSelectPhoto={onSelectPhoto}
            />
            <Controls autoRotate={false} target={spec.target} />
            <EntryReporter
                kind={kind}
                ready={ready}
                idle={idle}
                expected={expected}
                startedAt={startedAt}
                onEntry={onEntry}
            />
        </>
    );
}

export const WorldScene: React.FC<WorldSceneProps> = ({ world, participants, onReady, onSelectPhoto }) => {
    const { granted, token } = useLease('world');
    const manifestQuery = useGlbManifest();
    const spec = WORLD_SPECS[world];
    const decor = manifestQuery.data?.items.find((item) => item.key === spec.decorKey) ?? null;

    if (!granted || !token || !decor) {
        return <div className="w-full h-full" />;
    }

    const activeToken = token;

    return (
        <div className="w-full h-full">
            <Canvas
                dpr={[1.5, 1.5]}
                gl={{ antialias: false, powerPreference: 'high-performance' }}
                camera={{ position: spec.camera, fov: 45 }}
                onCreated={({ gl }) => {
                    trackRenderer(gl);
                    globalLeaseController.attach(activeToken, () => destroyRenderer(gl));
                }}
            >
                <Suspense fallback={null}>
                    <Scene
                        kind={world}
                        decorUrl={decor.url}
                        participants={participants}
                        onEntry={onReady ?? (() => undefined)}
                        onSelectPhoto={onSelectPhoto}
                    />
                </Suspense>
            </Canvas>
        </div>
    );
};
