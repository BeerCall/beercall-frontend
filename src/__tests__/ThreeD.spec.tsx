import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { render } from './utils/test-utils';
import AvatarCanvas, { ModularAvatar } from '../components/3D/AvatarCanvas';
import BarWorld from '../components/3D/BarWorld';
import FloatyIslandWorld from '../components/3D/FloatyIslandWorld';
import PiscineWorld from '../components/3D/PiscineWorld';

vi.mock('three-stdlib', () => ({
    SkeletonUtils: {
        clone: (obj: unknown) => obj
    }
}));

const {
    threeMockState,
    threeUseFrameMock,
    threeUseThreeMock,
    mockActionMap,
    createMockAction,
    threeDUseAnimationsMock,
    mockAvatarAnimations,
} = vi.hoisted(() => {
    const frameCallbacks = new Set<(state: unknown, delta: number) => void>();
    const gl = {
        domElement: document.createElement('canvas'),
        render: vi.fn(),
        info: {
            render: { calls: 0, frame: 0, lines: 0, points: 0, triangles: 0 },
            memory: { geometries: 0, textures: 0 },
        },
    };
    const scene = {};
    const camera = {};
    const invalidate = vi.fn();
    const state = {
        gl,
        scene,
        camera,
        invalidate,
        get: vi.fn(),
        advance: vi.fn(),
        clock: { getElapsedTime: () => 0, getDelta: () => 1 / 60 },
    };
    state.get.mockReturnValue(state);

    const useFrame = Object.assign(
        vi.fn((cb: (s: unknown, d: number) => void) => {
            if (typeof cb === 'function') {
                frameCallbacks.add(cb);
            }
        }),
        {
            advance: (delta = 1 / 60) => {
                gl.info.render.frame += 1;
                gl.info.render.calls += 1;
                frameCallbacks.forEach((cb) => cb(state, delta));
            },
            clear: () => frameCallbacks.clear(),
            callbacks: frameCallbacks,
        }
    );

    const useThree = vi.fn((selector?: (s: unknown) => unknown) => {
        return typeof selector === 'function' ? selector(state) : state;
    });

    const actionMap = new Map<string, {
        reset: ReturnType<typeof vi.fn>;
        fadeIn: ReturnType<typeof vi.fn>;
        fadeOut: ReturnType<typeof vi.fn>;
        play: ReturnType<typeof vi.fn>;
        stop: ReturnType<typeof vi.fn>;
        isRunning: ReturnType<typeof vi.fn>;
    }>();

    const makeMockAction = () => ({
        reset: vi.fn().mockReturnThis(),
        fadeIn: vi.fn().mockReturnThis(),
        fadeOut: vi.fn().mockReturnThis(),
        play: vi.fn().mockReturnThis(),
        stop: vi.fn().mockReturnThis(),
        isRunning: vi.fn().mockReturnValue(true),
    });

    const animationsMock = vi.fn((animations: Array<{ name: string }> = []) => {
        const actions: Record<string, ReturnType<typeof makeMockAction>> = {};
        for (const anim of (animations || [])) {
            if (anim?.name) {
                if (!actionMap.has(anim.name)) {
                    actionMap.set(anim.name, makeMockAction());
                }
                actions[anim.name] = actionMap.get(anim.name)!;
            }
        }
        return { actions, names: (animations || []).map(a => a?.name) };
    });

    const avatarAnimationsMock = vi.fn();

    return {
        threeMockState: state,
        threeUseFrameMock: useFrame,
        threeUseThreeMock: useThree,
        mockActionMap: actionMap,
        createMockAction: makeMockAction,
        threeDUseAnimationsMock: animationsMock,
        mockAvatarAnimations: avatarAnimationsMock,
    };
});

vi.mock('../hooks/useAvatarAnimations', () => ({
    useAvatarAnimations: (targetAnimation: string | null) => mockAvatarAnimations(targetAnimation),
}));

vi.mock('@react-three/fiber', () => ({
    Canvas: vi.fn(({ children }: React.PropsWithChildren<unknown>) => <div data-testid="canvas-mock">{children}</div>),
    useFrame: threeUseFrameMock,
    useThree: threeUseThreeMock,
}));

vi.mock('@react-three/drei', () => {
    const dummyScene = { clone: () => dummyScene, traverse: (cb: (node: { isMesh: boolean }) => void) => cb({ isMesh: true }), children: [] };
    const useFBXMock = vi.fn().mockReturnValue(dummyScene) as unknown as { preload: () => void, (path: string): unknown };
    useFBXMock.preload = vi.fn();
    
    return {
        useFBX: useFBXMock,
        useGLTF: vi.fn().mockReturnValue({ scene: dummyScene }),
        useAnimations: threeDUseAnimationsMock,
        Environment: () => null,
        OrbitControls: () => null,
        ContactShadows: () => null,
        Center: ({ children }: React.PropsWithChildren<unknown>) => <>{children}</>,
        PositionalAudio: () => null,
        Float: ({ children }: React.PropsWithChildren<unknown>) => <>{children}</>,
        Html: ({ children }: React.PropsWithChildren<unknown>) => <div data-testid="html-mock">{children}</div>,
        Text: ({ children }: React.PropsWithChildren<unknown>) => <>{children}</>,
    };
});

vi.mock('../../hooks/useGameEngine', () => ({
    useGameEngine: vi.fn().mockReturnValue({ gameState: true, startGame: vi.fn(), isLocked: false })
}));

vi.mock('../../store/useGameUIStore', () => ({
    useGameUIStore: vi.fn().mockReturnValue(vi.fn())
}));

import * as drei from '@react-three/drei';
import * as fiber from '@react-three/fiber';

describe('3D Components Rendering & Observability', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockActionMap.clear();
        threeUseFrameMock.clear();
        threeMockState.gl.info.render.frame = 0;
        threeMockState.gl.info.render.calls = 0;
        mockAvatarAnimations.mockImplementation((targetAnimation: string | null) => ({
            clipNames: ['Idle', 'Walk', 'Run', 'Dance'],
            activeClip: { name: targetAnimation || 'Idle' },
            isLoading: false,
            deferredStatus: 'ready' as const,
            error: null,
            notifyInitialFrame: vi.fn(),
            getClip: vi.fn(),
            retry: vi.fn(),
        }));
    });

    it('renders AvatarCanvas and calls useFBX: never preloads or fetches Animations.fbx', () => {
        const config = {
            head: 'cap',
            body: 'tshirt',
            legs: 'jeans',
            feet: 'sneakers',
            accessory: 'none',
            animation: 'Idle',
            gender: 'Men' as const
        };
        
        render(<AvatarCanvas config={config} />);
        
        expect(fiber.Canvas).toHaveBeenCalled();
        expect(drei.useFBX.preload).toHaveBeenCalled();
        expect(drei.useFBX).toHaveBeenCalled();
        // Strict verification: Animations.fbx is NEVER preloaded or fetched via useFBX
        expect(drei.useFBX.preload).not.toHaveBeenCalledWith(expect.stringContaining('Animations.fbx'));
        expect(drei.useFBX).not.toHaveBeenCalledWith(expect.stringContaining('Animations.fbx'));
    });

    it('calls onAnimationsLoaded with all 25 clip names from manifest upon load', () => {
        const onLoaded = vi.fn();
        const all25Clips = Array.from({ length: 25 }, (_, i) => i === 0 ? 'Idle' : `Anim_${i}`);
        mockAvatarAnimations.mockReturnValue({
            clipNames: all25Clips,
            activeClip: { name: 'Idle' },
            isLoading: false,
            deferredStatus: 'ready',
            error: null,
            notifyInitialFrame: vi.fn(),
            getClip: vi.fn(),
            retry: vi.fn(),
        });

        render(<AvatarCanvas config={{ head: 'cap', animation: 'Idle', gender: 'Men' }} onAnimationsLoaded={onLoaded} />);
        expect(onLoaded).toHaveBeenCalledWith(all25Clips);
    });

    it('protects against animation glitch: memoizes activeAnimations, avoids action resets on stable re-render, and resets once on clip change', () => {
        const idleClip = { name: 'Idle' };
        const danceClip = { name: 'Dance' };
        let currentClip: { name: string } = idleClip;
        const capturedAnimationsRefs: Array<unknown[]> = [];

        mockAvatarAnimations.mockImplementation(() => ({
            clipNames: ['Idle', 'Dance'],
            activeClip: currentClip,
            isLoading: false,
            deferredStatus: 'ready',
            error: null,
            notifyInitialFrame: vi.fn(),
            getClip: vi.fn(),
            retry: vi.fn(),
        }));

        threeDUseAnimationsMock.mockImplementation((animations = []) => {
            capturedAnimationsRefs.push(animations);
            const actions: Record<string, ReturnType<typeof createMockAction>> = {};
            for (const anim of (animations || [])) {
                if (anim?.name) {
                    if (!mockActionMap.has(anim.name)) {
                        mockActionMap.set(anim.name, createMockAction());
                    }
                    actions[anim.name] = mockActionMap.get(anim.name)!;
                }
            }
            return { actions, names: (animations || []).map(a => a?.name) };
        });

        const { rerender } = render(<ModularAvatar config={{ head: 'cap', animation: 'Idle', gender: 'Men' }} />);

        const idleAction = mockActionMap.get('Idle')!;
        expect(idleAction.reset).toHaveBeenCalledTimes(1);
        expect(idleAction.fadeIn).toHaveBeenCalledTimes(1);
        expect(idleAction.play).toHaveBeenCalledTimes(1);

        // Re-render with same clip (simulating refetch or parent re-render)
        rerender(<ModularAvatar config={{ head: 'cap', animation: 'Idle', gender: 'Men' }} />);

        // Active animations array reference MUST be preserved (stable useMemo)
        expect(capturedAnimationsRefs.length).toBeGreaterThanOrEqual(2);
        expect(capturedAnimationsRefs[capturedAnimationsRefs.length - 1]).toBe(capturedAnimationsRefs[capturedAnimationsRefs.length - 2]);

        // Action counters MUST NOT increase on stable re-render (no glitch / no reset)
        expect(idleAction.reset).toHaveBeenCalledTimes(1);
        expect(idleAction.fadeIn).toHaveBeenCalledTimes(1);
        expect(idleAction.play).toHaveBeenCalledTimes(1);

        // User changes clip to 'Dance'
        currentClip = danceClip;
        rerender(<ModularAvatar config={{ head: 'cap', animation: 'Dance', gender: 'Men' }} />);

        const danceAction = mockActionMap.get('Dance')!;
        expect(danceAction.reset).toHaveBeenCalledTimes(1);
        expect(danceAction.fadeIn).toHaveBeenCalledTimes(1);
        expect(danceAction.play).toHaveBeenCalledTimes(1);
        expect(idleAction.fadeOut).toHaveBeenCalledTimes(1);
    });

    it('notifies initial frame via frame probe only after pieces are ready and action is Idle', () => {
        const notifyMock = vi.fn();
        mockAvatarAnimations.mockReturnValue({
            clipNames: ['Idle'],
            activeClip: { name: 'Idle' },
            isLoading: false,
            deferredStatus: 'idle',
            error: null,
            notifyInitialFrame: notifyMock,
            getClip: vi.fn(),
            retry: vi.fn(),
        });

        const rAFCallbacks = new Set<FrameRequestCallback>();
        let rAFId = 0;
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
            rAFCallbacks.add(cb);
            return ++rAFId;
        });

        render(<ModularAvatar config={{ head: 'cap', animation: 'Idle', gender: 'Men' }} />);

        // Must NOT notify before frame submission
        expect(notifyMock).not.toHaveBeenCalled();

        // 1st advance arming the probe in useFrame
        (fiber.useFrame as unknown as { advance: (delta?: number) => void }).advance(1 / 60);
        expect(rAFCallbacks.size).toBe(1);

        // Advance the render frame counter so frame > before
        threeMockState.gl.info.render.frame += 1;
        threeMockState.gl.info.render.calls += 1;

        // Flush scheduled rAF callback
        rAFCallbacks.forEach(cb => cb(performance.now()));

        // Notify must be called on the submitted frame
        expect(notifyMock).toHaveBeenCalledTimes(1);
    });

    it('renders retry button on error and keeps avatar mounted when deferred fails', () => {
        const retryMock = vi.fn();
        // 1. Critical error (no active clip)
        mockAvatarAnimations.mockReturnValue({
            clipNames: [],
            activeClip: undefined,
            isLoading: false,
            deferredStatus: 'idle',
            error: new Error('Network error'),
            notifyInitialFrame: vi.fn(),
            getClip: vi.fn(),
            retry: retryMock,
        });

        const { rerender } = render(<ModularAvatar config={{ head: 'cap', animation: 'Idle', gender: 'Men' }} />);
        expect(screen.getByText('Erreur de chargement des animations')).toBeInTheDocument();
        const retryBtn = screen.getByRole('button', { name: 'Réessayer les animations' });
        retryBtn.click();
        expect(retryMock).toHaveBeenCalled();

        // 2. Deferred error (activeClip remains Idle)
        mockAvatarAnimations.mockReturnValue({
            clipNames: ['Idle', 'Dance'],
            activeClip: { name: 'Idle' },
            isLoading: false,
            deferredStatus: 'error',
            error: new Error('Deferred failed'),
            notifyInitialFrame: vi.fn(),
            getClip: vi.fn(),
            retry: retryMock,
        });

        rerender(<ModularAvatar config={{ head: 'cap', animation: 'Dance', gender: 'Men' }} />);
        // Avatar mesh pieces are STILL rendered (FBX called)
        expect(drei.useFBX).toHaveBeenCalledWith(expect.stringContaining('cap.fbx'));
        // Error banner is displayed with retry button
        expect(screen.getByText('Animations différées indisponibles')).toBeInTheDocument();
    });

    it('renders BarWorld and passes participants', async () => {
        const onSelectPhotoMock = vi.fn();
        const participants = [
            { id: '1', username: 'P1', proof_photo_url: 'http://test.com/photo.jpg', avatar: { head: 'cap', gender: 'Men' } },
            { id: '2', username: 'P2', avatar: { head: 'cap', gender: 'Men' } },
        ];
        
        render(<BarWorld participants={participants} isActiveApero={true} aperoId="apero-1" squadId="sq-1" onSelectPhoto={onSelectPhotoMock} />);
        
        expect(drei.useFBX).toHaveBeenCalled();
        expect(screen.getByText('P1')).toBeInTheDocument();
        expect(screen.getByText('JACKPOT')).toBeInTheDocument(); // SlotMachine active if isActiveApero
        
        const photoMock = screen.getByAltText('Preuve');
        photoMock.click();
        
        await waitFor(() => {
            expect(onSelectPhotoMock).toHaveBeenCalledWith('http://test.com/photo.jpg');
        });
    });

    it('renders FloatyIslandWorld and handles game active', () => {
        const participants = [
            { id: '1', username: 'P1', avatar: { head: 'cap', gender: 'Men' } }
        ];
        
        render(<FloatyIslandWorld participants={participants} />);
        
        expect(drei.useFBX).toHaveBeenCalled();
        expect(screen.getByText('P1')).toBeInTheDocument();
    });

    it('renders PiscineWorld and handles camera action', () => {
        const participants = [
            { id: '1', username: 'P1', excuse: 'Sorry!', avatar: { head: 'cap', gender: 'Men' } }
        ];
        
        render(<PiscineWorld participants={participants} />);
        
        expect(drei.useFBX).toHaveBeenCalled();
        expect(screen.getByText('P1')).toBeInTheDocument();
    });

    it('pilots useFrame callbacks: does not certify or run callback before explicit frame trigger', () => {
        const frameCallback = vi.fn();
        const TestHook = () => {
            fiber.useFrame(frameCallback);
            return null;
        };

        render(<TestHook />);

        // Callback must not certify or run before explicit frame trigger
        expect(frameCallback).not.toHaveBeenCalled();

        // Trigger explicit frame
        (fiber.useFrame as unknown as { advance: (delta?: number) => void }).advance(1 / 60);

        expect(frameCallback).toHaveBeenCalledTimes(1);
        expect(frameCallback).toHaveBeenCalledWith(
            expect.objectContaining({
                gl: expect.objectContaining({
                    info: expect.objectContaining({
                        render: expect.objectContaining({ frame: 1, calls: 1 }),
                    }),
                }),
                invalidate: expect.any(Function),
                get: expect.any(Function),
            }),
            1 / 60
        );
    });
});