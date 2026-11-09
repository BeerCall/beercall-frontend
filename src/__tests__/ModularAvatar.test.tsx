import React, { createRef, useEffect, useMemo } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ModularAvatar } from '../components/3D/ModularAvatar';
import type { AvatarPresentationState } from '../lib/avatarPresentationState';

const state = vi.hoisted(() => ({
    source: null as THREE.Group | null,
    clip: null as THREE.AnimationClip | null,
    frames: new Set<(state: unknown, delta: number) => void>(),
    priorities: new Map<(state: unknown, delta: number) => void, number>(),
    mixers: [] as THREE.AnimationMixer[],
    error: null as Error | null,
    deferredStatus: 'ready' as 'ready' | 'error',
    notify: vi.fn(),
    retry: vi.fn<() => Promise<void>>(),
}));

vi.mock('@react-three/fiber', () => ({
    useFrame: (callback: (state: unknown, delta: number) => void, priority = 0) => {
        useEffect(() => {
            state.frames.add(callback);
            state.priorities.set(callback, priority);
            return () => { state.frames.delete(callback); state.priorities.delete(callback); };
        }, [callback, priority]);
    },
}));
vi.mock('../hooks/useModel', () => ({ useModel: () => state.source }));
vi.mock('../hooks/useAvatarAnimations', () => ({
    useAvatarAnimations: () => ({
        clipNames: ['Idle'], activeClip: state.clip, activeClipLoop: true, deferredStatus: state.deferredStatus, error: state.error,
        notifyInitialFrame: state.notify, retry: state.retry,
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
                enumerable: true, // Same descriptor as Drei's useAnimations.
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
        state.priorities.clear();
        state.mixers.length = 0;
        state.error = null;
        state.deferredStatus = 'ready';
        state.notify.mockReset();
        state.retry.mockReset().mockResolvedValue(undefined);
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

    it('ne code plus de transform dans le chemin FBX legacy', () => {
        const root = createRef<THREE.Group>();
        const ready = vi.fn();
        const { rerender } = render(<ModularAvatar config={{ accessory: 'Men_accessory_Kart_3000' }} groupRef={root}/>);
        const accessory = root.current!.children[0];
        expect(accessory.scale.toArray()).toEqual([1, 1, 1]);
        expect(accessory.rotation.y).toBe(0);
        rerender(<ModularAvatar config={{ head: 'none' }} groupRef={root} onReadinessChange={ready}/>);
        expect(ready).not.toHaveBeenCalledWith(true, expect.anything());
    });

    it('reports critical failure without hidden Html and retries with live, deduplicated commands', async () => {
        state.clip = null;
        state.error = new Error('private URL or transport detail must not escape');
        const onChange = vi.fn<(value: AvatarPresentationState | null) => void>();
        const config = { head: 'synthetic-head' };
        const view = render(<ModularAvatar config={config} presentation={{mode: 'shared', active: true, onChange}}/>);
        const failed = onChange.mock.lastCall![0]!;
        expect(failed).toMatchObject({ phase: 'critical-error', error: 'animation-critical-unavailable' });
        expect(JSON.stringify(failed)).not.toContain('private');
        expect(screen.queryByText('Erreur de chargement des animations')).toBeNull();
        failed.notifyFrameCopied();
        expect(state.notify).not.toHaveBeenCalled();
        const one = failed.retryAnimations();
        const two = failed.retryAnimations();
        expect(one).toBe(two);
        await act(async () => { await one; });
        expect(state.retry).toHaveBeenCalledTimes(1);
        state.error = null;
        state.clip = new THREE.AnimationClip('Idle', 1, []);
        view.rerender(<ModularAvatar config={config} presentation={{mode: 'shared', active: true, onChange}}/>);
        const ready = onChange.mock.lastCall![0]!;
        expect(ready.phase).toBe('ready');
        expect(ready.retryAnimations).toBe(failed.retryAnimations);
        expect(state.notify).not.toHaveBeenCalled();
        act(() => ready.notifyFrameCopied());
        expect(state.notify).toHaveBeenCalledTimes(1);
    });

    it('keeps Idle on deferred failure and only an explicit copy of this scene unlocks its pack', async () => {
        state.deferredStatus = 'error';
        state.error = new Error('deferred transfer failure');
        const onChange = vi.fn<(value: AvatarPresentationState | null) => void>();
        const root = createRef<THREE.Group>();
        const view = render(<ModularAvatar config={{head: 'synthetic-head', animation: 'Dance'}} groupRef={root}
            presentation={{mode: 'shared', active: true, onChange}}/>);
        const failed = onChange.mock.lastCall![0]!;
        expect(failed.phase).toBe('deferred-error');
        expect(root.current!.getObjectByProperty('isSkinnedMesh', true)).toBeDefined();
        expect(screen.queryByText('Animations différées indisponibles')).toBeNull();
        // A neighbouring scene's root frame must not trigger the shared notifier.
        act(() => advanceLocalFrame(0.016));
        await act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); });
        expect(state.notify).not.toHaveBeenCalled();
        await act(async () => { await failed.retryAnimations(); });
        state.deferredStatus = 'ready';
        state.error = null;
        state.clip = new THREE.AnimationClip('Dance', 1, []);
        view.rerender(<ModularAvatar config={{head: 'synthetic-head', animation: 'Dance'}} groupRef={root}
            presentation={{mode: 'shared', active: true, onChange}}/>);
        expect(onChange.mock.lastCall![0]!.phase).toBe('ready');
        onChange.mock.lastCall![0]!.notifyFrameCopied();
        // Only Idle initial frames request the deferred pack; Dance is not Idle.
        expect(state.notify).not.toHaveBeenCalled();
    });

    it('retains standalone Html error messages and their real retry action', async () => {
        state.clip = null;
        state.error = new Error('critical');
        const {rerender} = render(<ModularAvatar config={{head: 'synthetic-head'}}/>);
        expect(screen.getByText('Erreur de chargement des animations')).toBeInTheDocument();
        await act(async () => { fireEvent.click(screen.getByRole('button', {name: 'Réessayer les animations'})); });
        expect(state.retry).toHaveBeenCalledTimes(1);
        state.clip = new THREE.AnimationClip('Idle', 1, []);
        state.deferredStatus = 'error';
        rerender(<ModularAvatar config={{head: 'synthetic-head'}}/>);
        expect(screen.getByText('Animations différées indisponibles')).toBeInTheDocument();
    });

    it('pauses/restarts only local actions without reset or accumulated inactive delta', () => {
        const rootA = createRef<THREE.Group>();
        const rootB = createRef<THREE.Group>();
        const onA = vi.fn();
        const onB = vi.fn();
        const config = {head: 'synthetic-head'};
        const content = (active: boolean) => <>
            <ModularAvatar config={config} groupRef={rootA} presentation={{mode: 'shared', active, onChange: onA}}/>
            <ModularAvatar config={config} groupRef={rootB} presentation={{mode: 'shared', active: true, onChange: onB}}/>
        </>;
        const view = render(content(true));
        const [mixerA, mixerB] = state.mixers;
        const actionA = mixerA.existingAction(state.clip!, rootA.current!.children[0])!;
        const actionB = mixerB.existingAction(state.clip!, rootB.current!.children[0])!;
        const reset = vi.spyOn(actionA, 'reset');
        act(() => advanceLocalFrame(0.1));
        const before = actionA.time;
        view.rerender(content(false));
        act(() => advanceLocalFrame(0.3));
        expect(actionA.time).toBeCloseTo(before);
        expect(actionB.time).toBeCloseTo(0.4);
        view.rerender(content(true));
        act(() => advanceLocalFrame(30));
        expect(actionA.time).toBeCloseTo(before);
        act(() => advanceLocalFrame(0.1));
        expect(actionA.time).toBeCloseTo(before + 0.1);
        expect(reset).not.toHaveBeenCalled();
        expect(mixerA).not.toBe(mixerB);
    });

    it('revokes previous signature commands on change and all callbacks on unmount', async () => {
        const onChange = vi.fn<(value: AvatarPresentationState | null) => void>();
        const view = render(<ModularAvatar config={{head: 'first'}} presentation={{mode: 'shared', active: true, onChange}}/>);
        const previous = onChange.mock.lastCall![0]!;
        view.rerender(<ModularAvatar config={{head: 'second'}} presentation={{mode: 'shared', active: true, onChange}}/>);
        const current = onChange.mock.lastCall![0]!;
        expect(current.notifyFrameCopied).not.toBe(previous.notifyFrameCopied);
        await previous.retryAnimations();
        previous.notifyFrameCopied();
        expect(state.retry).not.toHaveBeenCalled();
        expect(state.notify).not.toHaveBeenCalled();
        view.unmount();
        expect(onChange).toHaveBeenLastCalledWith(null);
        current.notifyFrameCopied();
        await current.retryAnimations();
        expect(state.retry).not.toHaveBeenCalled();
        expect(state.notify).not.toHaveBeenCalled();
    });
});

function advanceLocalFrame(delta: number) {
    const frame = { gl: { info: { render: { calls: 1, frame: 100 } } } };
    [...state.frames].sort((a, b) => (state.priorities.get(a) ?? 0) - (state.priorities.get(b) ?? 0))
        .forEach(callback => callback(frame, delta));
}
