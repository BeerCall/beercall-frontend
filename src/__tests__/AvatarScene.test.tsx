import React, {createContext, useContext, useLayoutEffect, useMemo} from 'react';
import {render} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import AvatarScene, {type AvatarSceneStatus} from '../components/3D/AvatarScene';
import type {AvatarConfig} from '../types/avatar';
import type {AvatarPresentationOptions} from '../lib/avatarPresentationState';

interface TestPortal {
    camera: THREE.PerspectiveCamera;
    size: {width: number; height: number};
    invalidate: () => void;
    setFrameloop: () => void;
}
const portalContext = createContext<TestPortal | null>(null);
const fixtures = vi.hoisted(() => ({pending: false, configs: [] as AvatarConfig[], activity: [] as (boolean | undefined)[], shadows: vi.fn()}));
vi.mock('@react-three/fiber', () => ({
    useThree: (selector: (value: TestPortal) => unknown) => selector(useContext(portalContext)!),
}));
vi.mock('@react-three/drei', () => ({
    ContactShadows: () => { fixtures.shadows(); return null; },
    OrbitControls: () => null,
    Html: ({children}: React.PropsWithChildren) => <div data-testid="html">{children}</div>,
    useProgress: () => ({progress: 0}),
}));
vi.mock('../components/3D/SceneReadyProbe', () => ({default: () => null}));
vi.mock('../components/3D/ModularAvatar', () => ({
    ModularAvatar: ({config, groupRef, onReadinessChange, onActiveClipChange, presentation}: {
        config: AvatarConfig; groupRef: React.RefObject<THREE.Group | null>;
        onReadinessChange: (ready: boolean) => void;
        onActiveClipChange: (clip: THREE.AnimationClip) => void;
        presentation?: AvatarPresentationOptions;
    }) => {
        fixtures.configs.push(config);
        fixtures.activity.push(presentation?.active);
        const clip = useMemo(() => new THREE.AnimationClip('Idle', 1, []), []);
        const signature = JSON.stringify(config);
        const pending = fixtures.pending;
        useLayoutEffect(() => {
            const group = new THREE.Group();
            for (const part of ['head', 'body', 'legs', 'feet', 'accessory']) {
                if (!config[part] || config[part] === 'none') continue;
                const root = new THREE.Group();
                root.userData.partKey = part;
                const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2), new THREE.MeshBasicMaterial());
                mesh.position.set(7, 12, -3); // Not the former fixed head Y=160.
                root.add(mesh);
                group.add(root);
            }
            groupRef.current = group;
            onActiveClipChange(clip);
            onReadinessChange(!pending && group.children.length > 0);
        }, [signature, config, groupRef, onReadinessChange, onActiveClipChange, clip, pending]);
        return null;
    },
}));

function portal(width = 36, height = 36): TestPortal {
    return {camera: new THREE.PerspectiveCamera(45, width / height, 0.1, 1000),
        size: {width, height}, invalidate: vi.fn(), setFrameloop: vi.fn()};
}
const onPresentation = vi.fn();
const shared: AvatarPresentationOptions = {mode: 'shared', active: true, onChange: onPresentation};

describe('isolated avatar scenes', () => {
    beforeEach(() => {
        fixtures.pending = false;
        fixtures.configs.length = 0;
        fixtures.activity.length = 0;
        vi.clearAllMocks();
    });

    it('frames only the real posed head, with finite bounded matrices and no shadow', () => {
        const root = portal();
        const onStatus = vi.fn<(status: AvatarSceneStatus | null) => void>();
        render(<portalContext.Provider value={root}><AvatarScene config={{head: 'head', body: 'body', accessory: 'kart'}}
            mode="head" presentation={shared} onStatusChange={onStatus}/></portalContext.Provider>);
        const status = onStatus.mock.lastCall![0]!;
        expect(status.ready).toBe(true);
        expect(status.frameSubmitted).toBe(false); // Geometry is not a copy certificate.
        expect(status.expectedParts).toEqual(['head']);
        expect(fixtures.configs.at(-1)).not.toHaveProperty('body');
        expect(fixtures.configs.at(-1)).not.toHaveProperty('accessory');
        expect(status.framing).toMatchObject({center: [7, 12, -3], partsCount: 1, meshCount: 1});
        expect(status.framing!.corners.every(([x, y]) => Math.abs(x) <= 0.8 && Math.abs(y) <= 0.8)).toBe(true);
        expect(status.framing!.projectionMatrix.every(Number.isFinite)).toBe(true);
        expect(root.camera.position.y).toBe(12);
        expect(root.camera.near).toBeGreaterThan(0);
        expect(root.camera.far).toBeGreaterThan(root.camera.near);
        expect(fixtures.shadows).not.toHaveBeenCalled();
    });

    it.each([undefined, null, '', 'none'])('never certifies absent head %s, even with a valid body', head => {
        const onStatus = vi.fn<(status: AvatarSceneStatus | null) => void>();
        render(<portalContext.Provider value={portal()}><AvatarScene config={{head, body: 'body'}} mode="head"
            presentation={shared} onStatusChange={onStatus}/></portalContext.Provider>);
        expect(onStatus.mock.lastCall![0]).toMatchObject({ready: false, framing: null, expectedParts: []});
    });

    it('rejects a zero-sized target instead of declaring it frame-ready', () => {
        const onStatus = vi.fn<(status: AvatarSceneStatus | null) => void>();
        render(<portalContext.Provider value={portal(0, 36)}><AvatarScene config={{head: 'head'}} mode="head"
            presentation={shared} onStatusChange={onStatus}/></portalContext.Provider>);
        expect(onStatus.mock.lastCall![0]).toMatchObject({ready: false, framing: null, frameSubmitted: false});
    });

    it('publishes view-local activity without modifying its root or neighbouring camera', () => {
        const a = portal();
        const b = portal(128, 160);
        const config = {head: 'head'};
        const scene = (active: boolean) => <>
            <portalContext.Provider value={a}><AvatarScene config={config} mode="head" active={active}
                presentation={{...shared, active}}/></portalContext.Provider>
            <portalContext.Provider value={b}><AvatarScene config={config} mode="head" presentation={shared}/></portalContext.Provider>
        </>;
        const view = render(scene(true));
        const neighbour = b.camera.matrixWorld.clone();
        view.rerender(scene(false));
        expect(fixtures.activity).toContain(false);
        expect(b.camera.matrixWorld.equals(neighbour)).toBe(true);
        expect(a.setFrameloop).not.toHaveBeenCalled();
        expect(b.setFrameloop).not.toHaveBeenCalled();
    });

    it('a new outfit waits for its own pieces rather than reusing a previous readiness', () => {
        const p = portal();
        const onStatus = vi.fn<(status: AvatarSceneStatus | null) => void>();
        const scene = (head: string) => <portalContext.Provider value={p}><AvatarScene config={{head}} mode="head"
            presentation={shared} onStatusChange={onStatus}/></portalContext.Provider>;
        const view = render(scene('first'));
        expect(onStatus.mock.lastCall![0]!.ready).toBe(true);
        fixtures.pending = true;
        view.rerender(scene('second'));
        expect(onStatus.mock.lastCall![0]).toMatchObject({ready: false, framing: null});
        expect(onStatus.mock.lastCall![0]!.signature).toContain('second');
        fixtures.pending = false;
        view.rerender(scene('second'));
        expect(onStatus.mock.lastCall![0]!.ready).toBe(true);
    });

    it('retains shared static shadows across activity changes, but refreshes them for a new GPU revision', () => {
        const p = portal(128, 160);
        const config = {head: 'head', body: 'body'};
        const scene = (active: boolean, revision: number) => <portalContext.Provider value={p}><AvatarScene config={config}
            mode="full" active={active} presentation={{...shared, active}} shadowRevision={revision}/></portalContext.Provider>;
        const view = render(scene(true, 1));
        const initial = fixtures.shadows.mock.calls.length;
        expect(initial).toBeGreaterThan(0);
        view.rerender(scene(false, 1));
        expect(fixtures.shadows).toHaveBeenCalledTimes(initial);
        view.rerender(scene(true, 1));
        expect(fixtures.shadows).toHaveBeenCalledTimes(initial);
        view.rerender(scene(true, 2));
        expect(fixtures.shadows).toHaveBeenCalledTimes(initial + 1);
    });
});
