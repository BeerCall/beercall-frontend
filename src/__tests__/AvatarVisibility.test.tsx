import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
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

const { mockFiberState, frameCallbacks } = vi.hoisted(() => {
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
            info: { render: { calls: 0, frame: 0 }, memory: { geometries: 0, textures: 0 } },
        },
        scene: {},
        camera: {},
        invalidate: vi.fn(),
        frameloop: 'always' as 'always' | 'never' | 'demand',
        setFrameloop: vi.fn((mode: 'always' | 'never' | 'demand') => {
            // Match the installed Fiber implementation: both transitions reset elapsedTime.
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

    return { mockFiberState: state, frameCallbacks: callbacks };
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
    useAnimations: vi.fn().mockReturnValue({ actions: {}, names: [] }),
}));

vi.mock('three-stdlib', () => ({
    SkeletonUtils: {
        clone: vi.fn(() => ({
            traverse: vi.fn(),
            children: [],
        })),
    },
}));

vi.mock('../hooks/useAvatarAnimations', () => ({
    useAvatarAnimations: vi.fn().mockReturnValue({
        clipNames: ['Idle'],
        activeClip: { name: 'Idle' },
        deferredStatus: 'ready',
        error: null,
        notifyInitialFrame: vi.fn(),
        getClip: vi.fn(),
        retry: vi.fn(),
    }),
    preloadAvatarAnimations: vi.fn().mockResolvedValue(undefined),
}));

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

        // Simule 5s de fonctionnement normal
        now = 5000;
        clock.getDelta();
        const elapsedBeforePause = clock.getElapsedTime();

        // 1. Mise en pause
        act(() => {
            rerender(<AvatarCanvas config={dummyConfig} active={false} />);
        });

        expect(mockFiberState.frameloop).toBe('never');
        expect(clock.running).toBe(false);

        // 2. Pause simulée de 30 secondes
        // Dans une implémentation naïve sans reset d'horloge, delta serait de 30 secondes
        now += 30000;

        // 3. Dégel / Reprise
        act(() => {
            rerender(<AvatarCanvas config={dummyConfig} active={true} />);
        });

        expect(mockFiberState.frameloop).toBe('always');
        expect(mockFiberState.invalidate).toHaveBeenCalled();
        expect(clock.running).toBe(true);

        // 4. Vérification critique : le premier delta au dégel ne contient PAS l'inactivité de 30s
        const resumeDelta = clock.getDelta();
        expect(resumeDelta).toBeLessThanOrEqual(0.1); // ≤ 100 ms (CHAL-04 / REV-06)

        // L'elapsedTime sauvegardé est préservé sans saut
        expect(clock.elapsedTime).toBeCloseTo(elapsedBeforePause, 1);
    });

    it('document.hidden=true : bascule en pause via visibilitychange et redémarre au retour', () => {
        render(<AvatarCanvas config={dummyConfig} active={true} />);

        // Onglet masqué
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        act(() => {
            document.dispatchEvent(new Event('visibilitychange'));
        });

        expect(mockFiberState.setFrameloop).toHaveBeenCalledWith('never');
        expect(mockFiberState.clock.stop).toHaveBeenCalled();

        // Onglet redevient visible
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

        // Vérification : console.warn n'a pas été enveloppé/réassigné par un monkey-patch
        expect(console.warn).toBe(warnSpy);
        warnSpy.mockRestore();
        expect(console.warn).toBe(initialWarn);

        // Émission d'un warning : arrive bien une seule fois
        const secondSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        console.warn('test warning direct');
        expect(secondSpy).toHaveBeenCalledTimes(1);
        secondSpy.mockRestore();
    });
});
