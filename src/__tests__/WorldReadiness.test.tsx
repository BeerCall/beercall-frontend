import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { screen, act, waitFor } from '@testing-library/react';
import { render } from './utils/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';
import BarWorld from '../components/3D/BarWorld';
import PiscineWorld from '../components/3D/PiscineWorld';
import FloatyIslandWorld from '../components/3D/FloatyIslandWorld';
import SelectWorldModal from '../components/Modals/SelectWorldModal';
import { useGameUIStore } from '../store/useGameUIStore';
import type { WorldParticipant } from '../types/api';
import type { AvatarConfig } from '../types/avatar';

// Mock Three-stdlib
vi.mock('three-stdlib', () => ({
    SkeletonUtils: {
        clone: (obj: unknown) => obj,
    },
}));

// Hoisted mocks for Fiber, Drei, and ModularAvatar
const {
    threeMockState,
    threeUseFrameMock,
    threeUseThreeMock,
    modularAvatarCaptors,
    resetModularAvatarCaptors,
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
                // Fiber subscribers run BEFORE gl.render; emulate the same order.
                frameCallbacks.forEach((cb) => cb(state, delta));
                gl.info.render.frame += 1;
                gl.info.render.calls += 1;
            },
            clear: () => frameCallbacks.clear(),
            callbacks: frameCallbacks,
        }
    );

    const useThree = vi.fn((selector?: (s: unknown) => unknown) => {
        return typeof selector === 'function' ? selector(state) : state;
    });

    const captors = new Map<string, (isReady: boolean, details?: { parts: string[]; meshCount: number }) => void>();

    return {
        threeMockState: state,
        threeUseFrameMock: useFrame,
        threeUseThreeMock: useThree,
        modularAvatarCaptors: captors,
        resetModularAvatarCaptors: () => captors.clear(),
    };
});

vi.mock('@react-three/fiber', () => ({
    Canvas: ({ children }: React.PropsWithChildren<unknown>) => <div data-testid="world-canvas">{children}</div>,
    useFrame: threeUseFrameMock,
    useThree: threeUseThreeMock,
}));

vi.mock('@react-three/drei', () => {
    const dummyScene = {
        clone: () => dummyScene,
        traverse: (cb: (node: { isMesh: boolean }) => void) => cb({ isMesh: true }),
        children: [],
    };
    const useFBXMock = vi.fn().mockReturnValue(dummyScene) as unknown as { preload: () => void; (path: string): unknown };
    useFBXMock.preload = vi.fn();
    return {
        useFBX: useFBXMock,
        Float: ({ children }: React.PropsWithChildren<unknown>) => <div>{children}</div>,
        ContactShadows: () => null,
        Html: ({ children }: React.PropsWithChildren<unknown>) => <div>{children}</div>,
        Text: ({ children }: React.PropsWithChildren<unknown>) => <span>{children}</span>,
        OrbitControls: () => null,
        useProgress: () => ({ progress: 100 }),
    };
});

// Mock contrôlable de ModularAvatar pour piloter précisément la readiness des avatars
vi.mock('../components/3D/AvatarCanvas', () => ({
    ModularAvatar: ({
        config,
        onReadinessChange,
    }: {
        config: AvatarConfig;
        onReadinessChange?: (isReady: boolean, details?: { parts: string[]; meshCount: number }) => void;
    }) => {
        const onReadinessChangeRef = React.useRef(onReadinessChange);
        React.useEffect(() => {
            onReadinessChangeRef.current = onReadinessChange;
        }, [onReadinessChange]);

        React.useEffect(() => {
            const avatarId = config?.head || 'default';
            modularAvatarCaptors.set(avatarId, (isReady, details) => {
                onReadinessChangeRef.current?.(isReady, details);
            });
            return () => {
                modularAvatarCaptors.delete(avatarId);
                onReadinessChangeRef.current?.(false);
            };
        }, [config?.head]);

        return <div data-testid={`modular-avatar-${config?.head || 'none'}`} />;
    },
}));

vi.mock('../hooks/useGameEngine', () => ({
    useGameEngine: vi.fn().mockReturnValue({
        gameState: null,
        startGame: vi.fn(),
        isLocked: false,
    }),
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => vi.fn(),
    };
});

describe('WorldReadiness — Attente des avatars réellement animés dans les mondes (T12B / REV-04 / REV-06)', () => {
    const recordedSignals: Array<{ kind: string; detail: unknown }> = [];

    const handleSceneMetric = (event: Event) => {
        const customEvent = event as CustomEvent;
        recordedSignals.push({ kind: customEvent.detail?.kind, detail: customEvent.detail });
    };

    beforeEach(() => {
        resetModularAvatarCaptors();
        threeUseFrameMock.clear();
        threeMockState.gl.info.render.frame = 0;
        threeMockState.gl.info.render.calls = 0;
        recordedSignals.length = 0;

        window.addEventListener('beercall:scene-metric', handleSceneMetric);
    });

    afterEach(() => {
        window.removeEventListener('beercall:scene-metric', handleSceneMetric);
        useGameUIStore.getState().closeGameScreen();
        vi.restoreAllMocks();
    });

    describe('1. Qualification du monde vide distinct (aucun avatar absent)', () => {
        it('BarWorld vide qualifie son décor explicitement sans attendre d’avatar', () => {
            const onReadinessChange = vi.fn();
            render(
                <BarWorld
                    aperoId="ap-1"
                    squadId="sq-1"
                    participants={[]}
                    isActiveApero={false}
                    onSelectPhoto={vi.fn()}
                    onReadinessChange={onReadinessChange}
                />
            );

            expect(onReadinessChange).toHaveBeenCalledWith(true);
            expect(modularAvatarCaptors.size).toBe(0);
        });

        it('PiscineWorld vide qualifie son décor explicitement', () => {
            const onReadinessChange = vi.fn();
            render(<PiscineWorld participants={[]} onReadinessChange={onReadinessChange} />);

            expect(onReadinessChange).toHaveBeenCalledWith(true);
            expect(modularAvatarCaptors.size).toBe(0);
        });

        it('FloatyIslandWorld vide qualifie son décor explicitement', () => {
            const onReadinessChange = vi.fn();
            render(<FloatyIslandWorld participants={[]} onReadinessChange={onReadinessChange} />);

            expect(onReadinessChange).toHaveBeenCalledWith(true);
            expect(modularAvatarCaptors.size).toBe(0);
        });

        it('SelectWorldModal avec monde vide soumet worldFrameSubmitted après frame probe', async () => {
            server.use(
                http.get('*/squads/sq-1/beer-calls/bc-1/worlds', () =>
                    HttpResponse.json({
                        worlds: {
                            bar: { participants: [] },
                        },
                    })
                )
            );

            const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
            render(
                <QueryClientProvider client={queryClient}>
                    <SelectWorldModal isOpen onClose={vi.fn()} squadId="sq-1" beerCallId="bc-1" isActiveApero={false} />
                </QueryClientProvider>
            );

            expect(await screen.findByText('0 Soldat(s)')).toBeInTheDocument();

            // Avant soumission physique WebGL
            expect(recordedSignals.filter((s) => s.kind === 'worldFrameSubmitted')).toHaveLength(0);

            // Avancer les frames jusqu'à la soumission WebGL effective du probe
            await waitFor(() => {
                threeUseFrameMock.advance(1 / 60);
                const worldSignals = recordedSignals.filter((s) => s.kind === 'worldFrameSubmitted');
                expect(worldSignals.length).toBeGreaterThanOrEqual(1);
                expect(worldSignals[0].detail).toMatchObject({
                    kind: 'worldFrameSubmitted',
                    view: 'world-bar',
                });
            });
        });
    });

    describe('2. Attente critique : pièces, action, frame dans les mondes peuplés', () => {
        it('BarWorld peuplé attend la readiness complète de TOUS ses avatars', () => {
            const onReadinessChange = vi.fn();
            const participants: WorldParticipant[] = [
                { user_id: 'u-1', username: 'Alice', avatar_config: { head: 'cap' } },
                { user_id: 'u-2', username: 'Bob', avatar_config: { head: 'helmet' } },
            ];

            render(
                <BarWorld
                    aperoId="ap-1"
                    squadId="sq-1"
                    participants={participants}
                    isActiveApero={false}
                    onSelectPhoto={vi.fn()}
                    onReadinessChange={onReadinessChange}
                />
            );

            // Au montage : pas encore prêt
            expect(onReadinessChange).toHaveBeenLastCalledWith(false);
            expect(modularAvatarCaptors.has('cap')).toBe(true);
            expect(modularAvatarCaptors.has('helmet')).toBe(true);

            // 1er avatar devient prêt (pièces + meshCount > 0)
            act(() => {
                modularAvatarCaptors.get('cap')!(true, { parts: ['head'], meshCount: 1 });
            });
            // Le monde ne doit toujours PAS être prêt (manque Bob)
            expect(onReadinessChange).toHaveBeenLastCalledWith(false);

            // 2ème avatar devient prêt
            act(() => {
                modularAvatarCaptors.get('helmet')!(true, { parts: ['head'], meshCount: 1 });
            });
            // Tous les avatars sont prêts -> le monde annonce ready=true
            expect(onReadinessChange).toHaveBeenLastCalledWith(true);
        });

        it('Un avatar sans mesh ou non prêt empêche la readiness du monde', () => {
            const onReadinessChange = vi.fn();
            const participants: WorldParticipant[] = [
                { user_id: 'u-1', username: 'Alice', avatar_config: { head: 'cap' } },
            ];

            render(
                <BarWorld
                    aperoId="ap-1"
                    squadId="sq-1"
                    participants={participants}
                    isActiveApero={false}
                    onSelectPhoto={vi.fn()}
                    onReadinessChange={onReadinessChange}
                />
            );

            // Signal ready=false
            act(() => {
                modularAvatarCaptors.get('cap')!(false);
            });
            expect(onReadinessChange).toHaveBeenLastCalledWith(false);

            // Signal ready=true mais meshCount=0
            act(() => {
                modularAvatarCaptors.get('cap')!(true, { parts: ['head'], meshCount: 0 });
            });
            expect(onReadinessChange).toHaveBeenLastCalledWith(false);
        });

        it('SelectWorldModal peuplé n’émet worldFrameSubmitted qu’après animation des avatars ET post-render frame', async () => {
            server.use(
                http.get('*/squads/sq-1/beer-calls/bc-1/worlds', () =>
                    HttpResponse.json({
                        worlds: {
                            bar: {
                                participants: [
                                    { user_id: 'u-1', username: 'Soldier', avatar_config: { head: 'beret' } },
                                ],
                            },
                        },
                    })
                )
            );

            const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
            render(
                <QueryClientProvider client={queryClient}>
                    <SelectWorldModal isOpen onClose={vi.fn()} squadId="sq-1" beerCallId="bc-1" isActiveApero={false} />
                </QueryClientProvider>
            );

            expect(await screen.findByText('1 Soldat(s)')).toBeInTheDocument();

            // Avatars encore en chargement -> pas de frame probe armé
            threeUseFrameMock.advance(1 / 60);
            await new Promise((resolve) => setTimeout(resolve, 30));
            expect(recordedSignals.filter((s) => s.kind === 'worldFrameSubmitted')).toHaveLength(0);

            // Simulation : avatar 'beret' finit de charger ses pièces et son action Idle
            act(() => {
                modularAvatarCaptors.get('beret')?.(true, { parts: ['head'], meshCount: 1 });
            });

            // Avancer les frames jusqu'à la soumission WebGL effective du probe
            await waitFor(() => {
                threeUseFrameMock.advance(1 / 60);
                const worldSignals = recordedSignals.filter((s) => s.kind === 'worldFrameSubmitted');
                expect(worldSignals.length).toBeGreaterThanOrEqual(1);
                expect(worldSignals[0].detail).toMatchObject({
                    kind: 'worldFrameSubmitted',
                    view: 'world-bar',
                });
            });
        });
    });

    describe('3. Changement d’onglet et isolation des générations', () => {
        it('ignores a retained world callback even after the active world has become ready', async () => {
            const callbacks = new Map<string, (ready: boolean) => void>();
            const loader = async (tab: string) => ({
                default: function ControlledWorld({ onReadinessChange }: { onReadinessChange?: (ready: boolean) => void }) {
                    React.useEffect(() => {
                        if (onReadinessChange) callbacks.set(tab, onReadinessChange);
                    }, [onReadinessChange]);
                    return null;
                },
            });
            server.use(http.get('*/squads/sq-1/beer-calls/bc-1/worlds', () => HttpResponse.json({
                worlds: { bar: { participants: [] }, piscine: { participants: [] } },
            })));
            const view = (isOpen: boolean) => <SelectWorldModal isOpen={isOpen} onClose={vi.fn()} squadId="sq-1" beerCallId="bc-1" isActiveApero={false} worldModuleLoader={loader} />;
            const { rerender } = render(view(true));
            await waitFor(() => expect(callbacks.has('bar')).toBe(true));
            const oldCallback = callbacks.get('bar')!;
            act(() => screen.getByRole('button', { name: /piscine/i }).click());
            await waitFor(() => expect(callbacks.has('piscine')).toBe(true));
            act(() => callbacks.get('piscine')!(true));
            await waitFor(() => {
                threeUseFrameMock.advance();
                expect(recordedSignals.some(signal => (signal.detail as { view: string }).view === 'world-piscine')).toBe(true);
            });
            const invalidations: string[] = [];
            const onInvalidation = (event: Event) => invalidations.push((event as CustomEvent<{ view: string }>).detail.view);
            window.addEventListener('beercall:scene-invalidate', onInvalidation);
            try {
                act(() => oldCallback(true));
                expect(invalidations).not.toContain('world-piscine');
            } finally {
                window.removeEventListener('beercall:scene-invalidate', onInvalidation);
            }

            const oldPoolCallback = callbacks.get('piscine')!;
            rerender(view(false));
            rerender(view(true));
            await waitFor(() => expect(callbacks.get('piscine')).not.toBe(oldPoolCallback));
            recordedSignals.length = 0;
            await act(async () => {
                oldPoolCallback(true);
                threeUseFrameMock.advance();
                await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            });
            expect(recordedSignals.filter(signal => signal.kind === 'worldFrameSubmitted')).toHaveLength(0);
            act(() => callbacks.get('piscine')!(true));
            await waitFor(() => {
                threeUseFrameMock.advance();
                expect(recordedSignals.some(signal => (signal.detail as { view: string }).view === 'world-piscine')).toBe(true);
            });
        });

        it('Le passage d’onglet réarme une nouvelle génération et ignore les callbacks tardifs de l’ancien monde', async () => {
            server.use(
                http.get('*/squads/sq-1/beer-calls/bc-1/worlds', () =>
                    HttpResponse.json({
                        worlds: {
                            bar: { participants: [{ user_id: 'u-bar', avatar_config: { head: 'bar-cap' } }] },
                            piscine: { participants: [{ user_id: 'u-pool', avatar_config: { head: 'goggles' } }] },
                        },
                    })
                )
            );

            const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
            render(
                <QueryClientProvider client={queryClient}>
                    <SelectWorldModal isOpen onClose={vi.fn()} squadId="sq-1" beerCallId="bc-1" isActiveApero={false} />
                </QueryClientProvider>
            );

            expect(await screen.findByText('1 Soldat(s)')).toBeInTheDocument();

            // BarWorld devient prêt
            act(() => {
                modularAvatarCaptors.get('bar-cap')?.(true, { parts: ['head'], meshCount: 1 });
            });

            await waitFor(() => {
                threeUseFrameMock.advance(1 / 60);
                expect(recordedSignals.some((s) => (s.detail as { view: string }).view === 'world-bar')).toBe(true);
            });
            const initialBarSignalCount = recordedSignals.filter((s) => s.kind === 'worldFrameSubmitted').length;
            const lateBarCallback = modularAvatarCaptors.get('bar-cap');

            // Passage à l’onglet piscine
            const poolButton = screen.getByRole('button', { name: /piscine/i });
            act(() => {
                poolButton.click();
            });

            // Une callback tardive provenant du BarWorld démonté doit être ignorée
            act(() => {
                lateBarCallback?.(true, { parts: ['head'], meshCount: 1 });
            });

            // Aucune nouvelle soumission de frame pour bar
            threeUseFrameMock.advance(1 / 60);
            await new Promise((resolve) => setTimeout(resolve, 30));
            expect(recordedSignals.filter((s) => s.kind === 'worldFrameSubmitted').length).toBe(initialBarSignalCount);

            // Maintenant, l'avatar de la piscine devient prêt
            await waitFor(() => expect(modularAvatarCaptors.has('goggles')).toBe(true));
            act(() => {
                modularAvatarCaptors.get('goggles')?.(true, { parts: ['head'], meshCount: 1 });
            });

            await waitFor(() => {
                threeUseFrameMock.advance(1 / 60);
                const poolSignals = recordedSignals.filter(
                    (s) => s.kind === 'worldFrameSubmitted' && (s.detail as { view: string }).view === 'world-piscine'
                );
                expect(poolSignals.length).toBeGreaterThanOrEqual(1);
            });

            // A retained callback must not invalidate the already-ready active pool.
            const invalidations: string[] = [];
            const onInvalidation = (event: Event) => invalidations.push((event as CustomEvent<{ view: string }>).detail.view);
            window.addEventListener('beercall:scene-invalidate', onInvalidation);
            try {
                act(() => lateBarCallback?.(true, { parts: ['head'], meshCount: 1 }));
                expect(invalidations).not.toContain('world-piscine');
            } finally {
                window.removeEventListener('beercall:scene-invalidate', onInvalidation);
            }
        });
    });

    describe('4. Invalidation lors d’un changement de participants ou de tenue', () => {
        it('Une modification de tenue ou de liste réinitialise la readiness jusqu’à rechargement', () => {
            const onReadinessChange = vi.fn();
            const initialParticipants: WorldParticipant[] = [
                { user_id: 'u-1', username: 'Alice', avatar_config: { head: 'cap' } },
            ];

            const { rerender } = render(
                <BarWorld
                    aperoId="ap-1"
                    squadId="sq-1"
                    participants={initialParticipants}
                    isActiveApero={false}
                    onSelectPhoto={vi.fn()}
                    onReadinessChange={onReadinessChange}
                />
            );

            // Alice devient prête
            act(() => {
                modularAvatarCaptors.get('cap')?.(true, { parts: ['head'], meshCount: 1 });
            });
            expect(onReadinessChange).toHaveBeenLastCalledWith(true);

            // Alice change de couvre-chef : 'cap' -> 'sombrero'
            const updatedParticipants: WorldParticipant[] = [
                { user_id: 'u-1', username: 'Alice', avatar_config: { head: 'sombrero' } },
            ];

            rerender(
                <BarWorld
                    aperoId="ap-1"
                    squadId="sq-1"
                    participants={updatedParticipants}
                    isActiveApero={false}
                    onSelectPhoto={vi.fn()}
                    onReadinessChange={onReadinessChange}
                />
            );

            // La readiness est immédiatement invalidée (retour à false)
            expect(onReadinessChange).toHaveBeenLastCalledWith(false);

            // Le nouveau couvre-chef sombrero est chargé
            act(() => {
                modularAvatarCaptors.get('sombrero')?.(true, { parts: ['head'], meshCount: 1 });
            });
            expect(onReadinessChange).toHaveBeenLastCalledWith(true);
        });
    });

    describe('5. Aucun faux ready sur erreur API ou données non fiables', () => {
        it('Une erreur 500 n’émet aucun signal worldFrameSubmitted', async () => {
            server.use(
                http.get('*/squads/sq-1/beer-calls/bc-err/worlds', () =>
                    HttpResponse.json({ message: 'Internal server error' }, { status: 500 })
                )
            );

            const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
            render(
                <QueryClientProvider client={queryClient}>
                    <SelectWorldModal isOpen onClose={vi.fn()} squadId="sq-1" beerCallId="bc-err" isActiveApero={false} />
                </QueryClientProvider>
            );

            expect(await screen.findByText('Participants indisponibles')).toBeInTheDocument();

            threeUseFrameMock.advance(1 / 60);
            await new Promise((resolve) => setTimeout(resolve, 30));

            expect(recordedSignals.filter((s) => s.kind === 'worldFrameSubmitted')).toHaveLength(0);
        });
    });
});
