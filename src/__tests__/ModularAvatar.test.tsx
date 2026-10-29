import React, { createRef, useEffect, useMemo } from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ModularAvatar } from '../components/3D/ModularAvatar';
import { ModularAvatar as LegacyModularAvatar } from '../components/3D/AvatarCanvas';

const state = vi.hoisted(() => ({
    source: null as THREE.Group | null,
    clip: null as THREE.AnimationClip | null,
    frames: new Set<(state: unknown, delta: number) => void>(),
    mixers: [] as THREE.AnimationMixer[],
}));

vi.mock('@react-three/fiber', () => ({
    useFrame: (callback: (state: unknown, delta: number) => void) => {
        useEffect(() => {
            state.frames.add(callback);
            return () => { state.frames.delete(callback); };
        }, [callback]);
    },
}));
vi.mock('../hooks/useModel', () => ({ useModel: () => state.source }));
vi.mock('../hooks/useAvatarAnimations', () => ({
    useAvatarAnimations: () => ({
        clipNames: ['Idle'], activeClip: state.clip, deferredStatus: 'ready', error: null,
        notifyInitialFrame: vi.fn(), retry: vi.fn(),
    }),
}));
vi.mock('@react-three/drei', () => ({
    Html: ({children}: React.PropsWithChildren) => <div>{children}</div>,
    useAnimations: (clips: THREE.AnimationClip[], root: React.RefObject<THREE.Group | null>) => {
        const result = useMemo(() => {
            const mixer = new THREE.AnimationMixer(new THREE.Group());
            state.mixers.push(mixer);
            const actions: Record<string, THREE.AnimationAction> = {};
            const pending = new Map<THREE.AnimationAction, () => THREE.AnimationAction>();
            const configured = new Set<THREE.AnimationAction>();
            for (const clip of clips) Object.defineProperty(actions, clip.name, {
                get: () => {
                    const action = mixer.clipAction(clip, root.current ?? undefined);
                    if (!configured.has(action)) {
                        configured.add(action);
                        const play = action.play.bind(action);
                        const running = action.isRunning.bind(action);
                        // Three binds tracks on play(), not first update(). Unlike
                        // R3F, jsdom attaches fallback primitives later in layout.
                        vi.spyOn(action, 'play').mockImplementation(() => { pending.set(action, play); return action; });
                        vi.spyOn(action, 'isRunning').mockImplementation(() => pending.has(action) || running());
                    }
                    return action;
                },
            });
            return { actions, mixer, pending };
        }, [clips, root]);
        useEffect(() => {
            result.pending.forEach(play => play());
            result.pending.clear();
            const update = (_: unknown, delta: number) => result.mixer.update(delta);
            state.frames.add(update);
            return () => { state.frames.delete(update); };
        }, [result]);
        return result;
    },
}));

function sourceModel() {
    const group = new THREE.Group();
    const bone = new THREE.Bone();
    bone.name = 'AvatarBone';
    const geometry = new THREE.BoxGeometry(2, 4, 2);
    const count = geometry.attributes.position.count;
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
    const weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) weights[i * 4] = 1;
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));
    group.add(mesh);
    return group;
}

describe('ModularAvatar assembly extraction', () => {
    beforeEach(() => {
        state.source = sourceModel();
        state.clip = new THREE.AnimationClip('Idle', 1, [
            new THREE.VectorKeyframeTrack('AvatarBone.position', [0, 1], [0, 0, 0, 0, 2, 0]),
        ]);
        state.frames.clear();
        state.mixers.length = 0;
    });

    it('keeps the worlds legacy export identical', () => {
        expect(LegacyModularAvatar).toBe(ModularAvatar);
    });

    it('isolates skeletons, parents and mixers while retaining public geometry/materials', () => {
        const a = createRef<THREE.Group>();
        const b = createRef<THREE.Group>();
        const readyA = vi.fn();
        const readyB = vi.fn();
        const config = { head: 'synthetic-head', animation: 'Idle' };
        const view = render(<>
            <ModularAvatar config={config} groupRef={a} onReadinessChange={readyA}/>
            <ModularAvatar config={config} groupRef={b} onReadinessChange={readyB}/>
        </>);
        const meshA = a.current!.getObjectByProperty('isSkinnedMesh', true) as THREE.SkinnedMesh;
        const meshB = b.current!.getObjectByProperty('isSkinnedMesh', true) as THREE.SkinnedMesh;
        const source = state.source!.children[0] as THREE.SkinnedMesh;
        expect(a.current).not.toBe(b.current);
        expect(meshA).not.toBe(meshB);
        expect(meshA.parent).not.toBe(meshB.parent);
        expect(meshA.skeleton.bones[0]).not.toBe(meshB.skeleton.bones[0]);
        expect(meshA.skeleton.bones[0]).not.toBe(source.skeleton.bones[0]);
        expect(meshA.geometry).toBe(source.geometry);
        expect(meshB.material).toBe(source.material);
        expect(source.parent).toBe(state.source);
        expect(readyA).toHaveBeenLastCalledWith(true, { parts: ['head'], meshCount: 1 });
        expect(readyB).toHaveBeenLastCalledWith(true, { parts: ['head'], meshCount: 1 });
        const [mixerA, mixerB] = state.mixers;
        expect(mixerA).not.toBe(mixerB);
        act(() => { mixerA.update(0.25); });
        expect(meshA.skeleton.bones[0].position.y).toBeCloseTo(0.5);
        expect(meshB.skeleton.bones[0].position.y).toBe(0);
        expect(source.skeleton.bones[0].position.y).toBe(0);
        const disposeGeometry = vi.spyOn(source.geometry, 'dispose');
        const disposeMaterial = vi.spyOn(source.material as THREE.Material, 'dispose');
        view.unmount();
        expect(disposeGeometry).not.toHaveBeenCalled();
        expect(disposeMaterial).not.toHaveBeenCalled();
        expect(state.frames.size).toBe(0);
    });

    it('preserves accessory transforms and does not certify an empty outfit', () => {
        const root = createRef<THREE.Group>();
        const ready = vi.fn();
        const { rerender } = render(<ModularAvatar config={{ accessory: 'Men_accessory_Kart_3000' }} groupRef={root}/>);
        const accessory = root.current!.children[0];
        expect(accessory.scale.toArray()).toEqual([2, 2, 2]);
        expect(accessory.rotation.y).toBe(70);
        rerender(<ModularAvatar config={{ head: 'none' }} groupRef={root} onReadinessChange={ready}/>);
        expect(ready).not.toHaveBeenCalledWith(true, expect.anything());
    });
});
