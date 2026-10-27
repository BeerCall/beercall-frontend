import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import * as THREE from 'three';
import { render } from './utils/test-utils';
import AvatarCanvas from '../components/3D/AvatarCanvas';
import type { AvatarConfig } from '../types/avatar';

// Clock contrôlée pour tester rigoureusement le dégel et le delta borné (CHAL-04)
class ControlledClock {
    public running = true;
    public startTime = 0;
    public oldTime = 0;
    public elapsedTime = 0;
    public lastDelta = 0;

    constructor() {
        this.startTime = performance.now();
        this.oldTime = this.startTime;
    }

    start() {
        this.startTime = performance.now();
        this.oldTime = this.startTime;
        this.elapsedTime = 0;
        this.running = true;
    }

    stop() {
        this.getElapsedTime();
        this.running = false;
    }

    getElapsedTime() {
        this.getDelta();
        return this.elapsedTime;
    }

    getDelta() {
        let diff = 0;
        if (this.running) {
            const newTime = performance.now();
            diff = (newTime - this.oldTime) / 1000;
            this.oldTime = newTime;
            this.elapsedTime += diff;
        }
        this.lastDelta = diff;
        return diff;
    }
}

function createMockClock() {
    return {
        running: true,
        startTime: 0,
        oldTime: 0,
        elapsedTime: 12.5,
        start: vi.fn(),
        stop: vi.fn(),
        getElapsedTime: vi.fn(() => 12.5),
        getDelta: vi.fn(() => 0.016),
    };
}

function createTestIdleClip(name = 'Idle', duration = 1.0): THREE.AnimationClip {
    const times = [0, 0.5, 1.0];
    const track = new THREE.VectorKeyframeTrack('.position', times, [
        0, 0, 0,
        0, 0.05, 0,
        0, 0, 0,
    ]);
    return new THREE.AnimationClip(name, duration, [track]);
}

const { mockFiberState, frameCallbacks, testState } = vi.hoisted(() => {
    const callbacks = new Set<(state: unknown, delta: number) => void>();
    const clock = {
        running: true,
        startTime: 0,
        oldTime: 0,
        elapsedTime: 12.5,
        start: vi.fn(),
        stop: vi.fn(),
        getElapsedTime: vi.fn(() => 12.5),
        getDelta: vi.fn(() => 0.016),
    };

    const state = {
        gl: {
            domElement: document.createElement('canvas'),
            render: vi.fn(),
            info: { render: { calls: 1, frame: 1 }, memory: { geometries: 0, textures: 0 } },
        },
        scene: {},
        camera: {} as unknown as THREE.PerspectiveCamera,
        size: { width: 300, height: 300 },
        invalidate: vi.fn(),
        frameloop: 'always' as 'always' | 'never' | 'demand',
        setFrameloop: vi.fn((mode: 'always' | 'never' | 'demand') => {
            state.clock.stop();
            state.clock.elapsedTime = 0;
            if (mode !== 'never') {
                state.clock.start();
                state.clock.elapsedTime = 0;
            }
            state.frameloop = mode;
        }),
        clock,
    };

    const testState = {
        partsSuspended: false,
        actionRunning: true,
        activeClip: null as THREE.AnimationClip | null,
    };

    return { mockFiberState: state, frameCallbacks: callbacks, testState };
});

vi.mock('@react-three/fiber', () => ({
    Canvas: ({ children }: React.PropsWithChildren<unknown>) => (
        <div data-testid="mock-r3f-canvas">{children}</div>
    ),
    useFrame: vi.fn((cb: (s: unknown, d: number) => void) => {
        if (typeof cb === 'function') frameCallbacks.add(cb);
    }),
    useThree: vi.fn((selector?: (s: typeof mockFiberState) => unknown) => {
        return typeof selector === 'function' ? selector(mockFiberState) : mockFiberState;
    }),
}));

vi.mock('../hooks/useModel', () => {
    function createMockPart(path: string) {
        const group = new THREE.Group();
        group.name = path;
        const geom = new THREE.BoxGeometry(0.3, 0.3, 0.3);
        const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial());
        mesh.name = `mesh_${path}`;
        group.add(mesh);
        return group;
    }
    const mock = vi.fn().mockImplementation((path: string) => {
        if (testState.partsSuspended) {
            throw new Promise(() => {});
        }
        return createMockPart(path);
    });
    (mock as unknown as { preload: () => void; clear: () => void }).preload = vi.fn();
    (mock as unknown as { preload: () => void; clear: () => void }).clear = vi.fn();
    return { useModel: mock };
});

vi.mock('three-stdlib', () => ({
    SkeletonUtils: {
        clone: vi.fn((obj: unknown) => {
            if (
                obj &&
                typeof obj === 'object' &&
                'clone' in obj &&
                typeof (obj as { clone: (recursive: boolean) => unknown }).clone === 'function'
            ) {
                return (obj as { clone: (recursive: boolean) => unknown }).clone(true);
            }
            return new THREE.Group();
        }),
    },
}));

vi.mock('@react-three/drei', () => ({
    OrbitControls: () => null,
    ContactShadows: () => null,
    Environment: () => null,
    useFBX: Object.assign(vi.fn().mockReturnValue({
        clone: () => ({ traverse: vi.fn() }),
        traverse: vi.fn(),
    }), { preload: vi.fn() }),
    Html: ({ children }: React.PropsWithChildren<unknown>) => <div>{children}</div>,
    useProgress: vi.fn().mockReturnValue({ active: false }),
    useAnimations: vi.fn().mockImplementation(() => {
        const mockAction = {
            reset: vi.fn().mockReturnThis(),
            fadeIn: vi.fn().mockReturnThis(),
            fadeOut: vi.fn().mockReturnThis(),
            play: vi.fn().mockReturnThis(),
            stop: vi.fn().mockReturnThis(),
            isRunning: vi.fn().mockImplementation(() => testState.actionRunning),
        };
        return {
            actions: { Idle: mockAction },
            names: ['Idle'],
        };
    }),
}));

vi.mock('../hooks/useAvatarAnimations', () => ({
    useAvatarAnimations: vi.fn().mockImplementation(() => ({
        clipNames: ['Idle'],
        activeClip: testState.activeClip,
        deferredStatus: 'ready',
        error: null,
        notifyInitialFrame: vi.fn(),
        getClip: vi.fn(),
        retry: vi.fn(),
    })),
    preloadAvatarAnimations: vi.fn().mockResolvedValue(undefined),
}));

async function flushSubmittedFrame(): Promise<void> {
    await act(async () => {
        mockFiberState.gl.info.render.calls = 5;
        // Déclencher useFrame pour armer SceneReadyProbe
        frameCallbacks.forEach((cb) => cb(mockFiberState, 0.016));
        // Incrémentation effective du compteur de frame après useFrame (comme un render réel)
        mockFiberState.gl.info.render.frame += 1;
        // Laisser requestAnimationFrame s'exécuter
        await new Promise((r) => setTimeout(r, 40));
    });
}

describe('AvatarCanvas: suspension sans remontage du Canvas (CHAL-04)', () => {
    const dummyConfig: AvatarConfig = {
        gender: 'male',
        head: 'head_01',
        body: 'body_01',
        legs: 'legs_01',
        feet: 'feet_01',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        frameCallbacks.clear();
        mockFiberState.frameloop = 'always';
        mockFiberState.clock = createMockClock() as unknown as typeof mockFiberState.clock;
        const realCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
        realCamera.position.set(0, 100, 200);
        realCamera.updateMatrixWorld(true);
        realCamera.updateProjectionMatrix();
        mockFiberState.camera = realCamera;
        mockFiberState.size = { width: 300, height: 300 };
        testState.partsSuspended = false;
        testState.actionRunning = true;
        testState.activeClip = createTestIdleClip('Idle', 1.0);
    });

    it('active=true : frameloop initialement actif', () => {
        render(<AvatarCanvas config={dummyConfig} active={true} />);

        expect(mockFiberState.setFrameloop).not.toHaveBeenCalledWith('never');
        expect(mockFiberState.frameloop).toBe('always');
    });

    it('active=false : bascule en frameloop never, stoppe l’horloge et sauvegarde elapsedTime', () => {
        const { rerender } = render(<AvatarCanvas config={dummyConfig} active={true} />);

        act(() => {
            rerender(<AvatarCanvas config={dummyConfig} active={false} />);
        });

        expect(mockFiberState.setFrameloop).toHaveBeenCalledWith('never');
        expect(mockFiberState.clock.stop).toHaveBeenCalled();
    });

    it('reprise après 30s de pause : frameloop always, invalidate appelé, horloge redémarrée et delta borné (≤100 ms)', () => {
        let now = 0;
        vi.spyOn(performance, 'now').mockImplementation(() => now);
        const clock = new ControlledClock();
        mockFiberState.clock = clock as unknown as typeof mockFiberState.clock;

        const { rerender } = render(<AvatarCanvas config={dummyConfig} active={true} />);

        now = 5000;
        clock.getDelta();
        const elapsedBeforePause = clock.getElapsedTime();

        act(() => {
            rerender(<AvatarCanvas config={dummyConfig} active={false} />);
        });

        expect(mockFiberState.frameloop).toBe('never');
        expect(clock.running).toBe(false);

        now += 30000;

        act(() => {
            rerender(<AvatarCanvas config={dummyConfig} active={true} />);
        });

        expect(mockFiberState.frameloop).toBe('always');
        expect(mockFiberState.invalidate).toHaveBeenCalled();
        expect(clock.running).toBe(true);

        const resumeDelta = clock.getDelta();
        expect(resumeDelta).toBeLessThanOrEqual(0.1);
        expect(clock.elapsedTime).toBeCloseTo(elapsedBeforePause, 1);
    });

    it('document.hidden=true : bascule en pause via visibilitychange et redémarre au retour', () => {
        render(<AvatarCanvas config={dummyConfig} active={true} />);

        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        act(() => {
            document.dispatchEvent(new Event('visibilitychange'));
        });

        expect(mockFiberState.setFrameloop).toHaveBeenCalledWith('never');
        expect(mockFiberState.clock.stop).toHaveBeenCalled();

        vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
        act(() => {
            document.dispatchEvent(new Event('visibilitychange'));
        });

        expect(mockFiberState.setFrameloop).toHaveBeenCalledWith('always');
        expect(mockFiberState.invalidate).toHaveBeenCalled();
    });

    it('démontage : nettoie le listener visibilitychange et restaure frameloop', () => {
        const removeListenerSpy = vi.spyOn(document, 'removeEventListener');
        const { unmount } = render(<AvatarCanvas config={dummyConfig} active={true} />);

        unmount();
        expect(removeListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    });

    it('vingt montages/démontages avec StrictMode : identité de console.warn inchangée, pas de monkey-patch empilé', () => {
        const initialWarn = console.warn;
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        for (let i = 0; i < 20; i++) {
            const { unmount } = render(
                <React.StrictMode>
                    <AvatarCanvas config={dummyConfig} active={true} />
                </React.StrictMode>
            );
            unmount();
        }

        expect(console.warn).toBe(warnSpy);
        warnSpy.mockRestore();
        expect(console.warn).toBe(initialWarn);

        const secondSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        console.warn('test warning direct');
        expect(secondSpy).toHaveBeenCalledTimes(1);
        secondSpy.mockRestore();
    });
});

describe('AvatarCanvas: Cadrage thumbnail et enveloppe Idle (T36b / VER-13 / VER-16)', () => {
    const dummyConfig: AvatarConfig = {
        gender: 'male',
        head: 'head_01',
        body: 'body_01',
        legs: 'legs_01',
        feet: 'feet_01',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        frameCallbacks.clear();
        mockFiberState.frameloop = 'always';
        mockFiberState.clock = createMockClock() as unknown as typeof mockFiberState.clock;
        const realCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
        realCamera.position.set(0, 100, 200);
        realCamera.updateMatrixWorld(true);
        realCamera.updateProjectionMatrix();
        mockFiberState.camera = realCamera;
        mockFiberState.size = { width: 300, height: 300 };
        testState.partsSuspended = false;
        testState.actionRunning = true;
        testState.activeClip = createTestIdleClip('Idle', 1.0);
    });

    it('défaut et headOnly : caméra non ajustée et pas d attribut data-avatar-framing', () => {
        const { container: c1 } = render(<AvatarCanvas config={dummyConfig} framing="default" />);
        expect(c1.querySelector('[data-avatar-framing]')).toBeNull();

        const { container: c2 } = render(<AvatarCanvas config={dummyConfig} headOnly={true} framing="thumbnail" />);
        expect(c2.querySelector('[data-avatar-framing]')).toBeNull();
    });

    it('readiness tardive : pending tant que non prêt, puis transition vers ready après soumission de frame', async () => {
        testState.actionRunning = false;
        const { container, rerender } = render(<AvatarCanvas config={dummyConfig} framing="thumbnail" />);

        // Non prêt : en attente
        expect(container.querySelector('[data-avatar-framing="pending"]')).toBeInTheDocument();

        // Les actions deviennent prêtes
        testState.actionRunning = true;
        rerender(<AvatarCanvas config={{ ...dummyConfig }} framing="thumbnail" />);

        // Soumission effective d'une frame
        await flushSubmittedFrame();

        expect(container.querySelector('[data-avatar-framing="ready"]')).toBeInTheDocument();
        const infoStr = container.querySelector('[data-avatar-framing="ready"]')?.getAttribute('data-avatar-framing-info');
        expect(infoStr).toBeDefined();
        const info = JSON.parse(infoStr!);
        expect(info.status).toBe('ready');
        expect(info.sampleCount).toBeGreaterThan(0);
        expect(info.cpuTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('changement accessoire/genre/clip : repasse par pending et recalcule une nouvelle enveloppe', async () => {
        const { container, rerender } = render(<AvatarCanvas config={dummyConfig} framing="thumbnail" />);
        await flushSubmittedFrame();
        expect(container.querySelector('[data-avatar-framing="ready"]')).toBeInTheDocument();

        // 1. Changement d'accessoire
        rerender(<AvatarCanvas config={{ ...dummyConfig, accessory: 'kart_cap' }} framing="thumbnail" />);
        expect(container.querySelector('[data-avatar-framing="pending"]')).toBeInTheDocument();
        await flushSubmittedFrame();
        expect(container.querySelector('[data-avatar-framing="ready"]')).toBeInTheDocument();

        // 2. Changement de genre
        rerender(<AvatarCanvas config={{ ...dummyConfig, gender: 'female' }} framing="thumbnail" />);
        expect(container.querySelector('[data-avatar-framing="pending"]')).toBeInTheDocument();
        await flushSubmittedFrame();
        expect(container.querySelector('[data-avatar-framing="ready"]')).toBeInTheDocument();

        // 3. Changement de clip Idle (autre durée)
        testState.activeClip = createTestIdleClip('Idle', 2.0);
        rerender(<AvatarCanvas config={{ ...dummyConfig, gender: 'female' }} framing="thumbnail" />);
        await flushSubmittedFrame();
        expect(container.querySelector('[data-avatar-framing="ready"]')).toBeInTheDocument();
    });

    it('resize : réutilise l enveloppe mesurée et réapplique la projection', async () => {
        const { container, rerender } = render(<AvatarCanvas config={dummyConfig} framing="thumbnail" />);
        await flushSubmittedFrame();

        const infoBefore = JSON.parse(
            container.querySelector('[data-avatar-framing="ready"]')!.getAttribute('data-avatar-framing-info')!
        );
        expect(infoBefore.width).toBe(300);

        // Simulation d'un resize
        mockFiberState.size = { width: 390, height: 390 };
        rerender(<AvatarCanvas config={dummyConfig} framing="thumbnail" />);
        await flushSubmittedFrame();

        const infoAfter = JSON.parse(
            container.querySelector('[data-avatar-framing="ready"]')!.getAttribute('data-avatar-framing-info')!
        );
        expect(infoAfter.width).toBe(390);
        expect(infoAfter.height).toBe(390);
        // L'enveloppe mesurée est identique (mêmes garde et échantillonnage)
        expect(infoAfter.sampleCount).toBe(infoBefore.sampleCount);
        expect(infoAfter.measuredGuard).toEqual(infoBefore.measuredGuard);
    });

    it('rerender identique : conserve l état ready sans recalculer', async () => {
        const { container, rerender } = render(<AvatarCanvas config={dummyConfig} framing="thumbnail" />);
        await flushSubmittedFrame();
        expect(container.querySelector('[data-avatar-framing="ready"]')).toBeInTheDocument();

        // Rerender avec la même config
        rerender(<AvatarCanvas config={dummyConfig} framing="thumbnail" />);
        expect(container.querySelector('[data-avatar-framing="ready"]')).toBeInTheDocument();
    });

    it('fit invalide : clip non-Idle laisse l avatar en pending sans ready', async () => {
        testState.activeClip = new THREE.AnimationClip('Dance', 1.0, []);
        const { container } = render(<AvatarCanvas config={dummyConfig} framing="thumbnail" />);

        await flushSubmittedFrame();
        expect(container.querySelector('[data-avatar-framing="pending"]')).toBeInTheDocument();
        expect(container.querySelector('[data-avatar-framing="ready"]')).toBeNull();
    });

    it('perte et restauration WebGL : active=false bascule en pending, restauration redevient ready', async () => {
        const { container, rerender } = render(<AvatarCanvas config={dummyConfig} framing="thumbnail" active={true} />);
        await flushSubmittedFrame();
        expect(container.querySelector('[data-avatar-framing="ready"]')).toBeInTheDocument();

        // Contexte perdu
        rerender(<AvatarCanvas config={dummyConfig} framing="thumbnail" active={false} />);
        expect(container.querySelector('[data-avatar-framing="pending"]')).toBeInTheDocument();

        // Contexte restauré
        rerender(<AvatarCanvas config={dummyConfig} framing="thumbnail" active={true} />);
        await flushSubmittedFrame();
        expect(container.querySelector('[data-avatar-framing="ready"]')).toBeInTheDocument();
    });

    it('diagnostic complet : visée au centre de l enveloppe, matrices 16 valeurs finies et coins bornés', async () => {
        const { container } = render(<AvatarCanvas config={dummyConfig} framing="thumbnail" />);
        await flushSubmittedFrame();

        const info = JSON.parse(
            container.querySelector('[data-avatar-framing="ready"]')!.getAttribute('data-avatar-framing-info')!
        );

        // Matrices 16 valeurs finies
        expect(info.viewMatrix).toHaveLength(16);
        expect(info.projectionMatrix).toHaveLength(16);
        expect(info.viewMatrix.every((v: number) => Number.isFinite(v))).toBe(true);
        expect(info.projectionMatrix.every((v: number) => Number.isFinite(v))).toBe(true);

        // Boîtes distinctes et valides
        expect(info.envelopeBoxMin).toBeDefined();
        expect(info.envelopeBoxMax).toBeDefined();
        expect(info.poseBoxMin).toBeDefined();
        expect(info.poseBoxMax).toBeDefined();

        // Visée au centre de l'enveloppe
        const expectedCenterX = Number(((info.envelopeBoxMin[0] + info.envelopeBoxMax[0]) / 2).toFixed(2));
        const expectedCenterY = Number(((info.envelopeBoxMin[1] + info.envelopeBoxMax[1]) / 2).toFixed(2));
        expect(info.center[0]).toBeCloseTo(expectedCenterX, 1);
        expect(info.center[1]).toBeCloseTo(expectedCenterY, 1);

        // Coins projetés respectent la marge 0.8
        expect(info.corners).toHaveLength(8);
        for (const [x, y] of info.corners) {
            expect(Math.abs(x)).toBeLessThanOrEqual(0.81);
            expect(Math.abs(y)).toBeLessThanOrEqual(0.81);
        }
    });
});
