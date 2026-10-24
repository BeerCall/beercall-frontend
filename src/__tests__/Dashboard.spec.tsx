import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, act, waitFor } from '@testing-library/react';
import React from 'react';
import { render } from './utils/test-utils';
import Dashboard from '../pages/Dashboard';
import { useUserStore } from '../store/useUserStore';

vi.mock('firebase/messaging', () => ({
    getToken: vi.fn().mockResolvedValue('fake-fcm-token'),
    onMessage: vi.fn(),
    getMessaging: vi.fn()
}));

vi.mock('../lib/firebase', () => ({
  messaging: {},
  getToken: vi.fn(),
  onMessage: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useParams: () => ({ id: '1' }),
        useNavigate: () => vi.fn(),
    };
});

vi.mock('react-map-gl/maplibre', () => ({
  default: ({ children }: React.PropsWithChildren<unknown>) => <div data-testid="mock-map">{children}</div>,
  Marker: ({ children }: React.PropsWithChildren<unknown>) => <div data-testid="mock-marker">{children}</div>,
  NavigationControl: () => <div data-testid="mock-nav-control" />,
}));

const { dashboardUseFrameMock, dashboardUseThreeMock } = vi.hoisted(() => {
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

    return { dashboardMockState: state, dashboardUseFrameMock: useFrame, dashboardUseThreeMock: useThree };
});

vi.mock('@react-three/fiber', () => ({
    Canvas: ({ children }: React.PropsWithChildren<unknown>) => <div data-testid="mock-canvas">{children}</div>,
    useFrame: dashboardUseFrameMock,
    useThree: dashboardUseThreeMock,
}));

vi.mock('@react-three/drei', () => ({
    useGLTF: vi.fn().mockReturnValue({ scene: {} }),
    useAnimations: vi.fn().mockReturnValue({ actions: {}, names: [] }),
    Environment: () => null,
    OrbitControls: () => null,
    ContactShadows: () => null,
}));

global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
}));

import { useDashboard } from '../hooks/useDashboard';
vi.mock('../hooks/useDashboard', () => ({
    useDashboard: vi.fn(),
}));

vi.mock('../hooks/useAvatarAnimations', () => ({
    useAvatarAnimations: vi.fn().mockReturnValue({
        clipNames: ['Idle'],
        activeClip: { name: 'Idle' },
        isLoading: false,
        deferredStatus: 'ready',
        error: null,
        notifyInitialFrame: vi.fn(),
        getClip: vi.fn(),
        retry: vi.fn(),
    }),
}));



describe('Dashboard & Squads', () => {
    beforeEach(() => {
        useUserStore.setState({ user: { username: 'validUser' }, isAuthenticated: true });
        vi.useFakeTimers({ shouldAdvanceTime: true });
        vi.clearAllMocks();
        dashboardUseFrameMock.clear();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('Scenario: Chargement initial des Squads', async () => {
        vi.mocked(useDashboard).mockReturnValue({
            id: '1',
            profile: { username: 'validUser' },
            squadDetails: null,
            userLocation: null,
            isSquadModalOpen: false,
            isJoinModalOpen: false,
            selectedBeerCall: null,
            isWorldsModalOpen: null,
            scheduleCoordinates: null,
            isScheduleModalOpen: false,
            scheduledToStart: null,
            isNightMode: false,
            photoFile: null,
            fileInputRef: { current: null },
            mapRef: { current: null },
            showPushBanner: false,
            copied: false,
            handleSquadCreated: vi.fn(),
            handleCopyCode: vi.fn(),
            requestPushPermission: vi.fn(),
            dismissPushBanner: vi.fn(),
            handleBeerCallRespond: vi.fn(),
            centerToUser: vi.fn(),
            triggerPhotoCapture: vi.fn(),
            handleFileChange: vi.fn(),
            closeCreateModal: vi.fn(),
            handleScheduleModalSubmit: vi.fn(),
        } as unknown as ReturnType<typeof useDashboard>);

        render(<Dashboard />);
        expect(screen.getByTestId('mock-map')).toBeInTheDocument();
    });

    it('ferme la modale des mondes quand l’écran de jeu est ouvert', () => {
        vi.mocked(useDashboard).mockReturnValue({
            id: '1',
            profile: { username: 'validUser' },
            squadDetails: null,
            userLocation: null,
            isSquadModalOpen: false,
            isJoinModalOpen: false,
            selectedBeerCall: null,
            isWorldsModalOpen: 'apero-1',
            isGameScreenOpen: true,
            currentAperoId: 'apero-1',
            isActiveApero: true,
            scheduleCoordinates: null,
            isScheduleModalOpen: false,
            scheduledToStart: null,
            isNightMode: false,
            photoFile: null,
            fileInputRef: { current: null },
            mapRef: { current: null },
            showPushBanner: false,
            copied: false,
            handleSquadCreated: vi.fn(),
            handleCopyCode: vi.fn(),
            requestPushPermission: vi.fn(),
            dismissPushBanner: vi.fn(),
            handleBeerCallRespond: vi.fn(),
            centerToUser: vi.fn(),
            triggerPhotoCapture: vi.fn(),
            handleFileChange: vi.fn(),
            closeCreateModal: vi.fn(),
            handleScheduleModalSubmit: vi.fn(),
        } as unknown as ReturnType<typeof useDashboard>);

        render(<Dashboard />);

        expect(screen.queryByText('Les 3 Mondes')).not.toBeInTheDocument();
    });

    it('Comportement temporel: Vérification des compteurs avec de faux timers', async () => {
        const scheduledTime = new Date(Date.now() + 60000).toISOString();
        vi.mocked(useDashboard).mockReturnValue({
            id: '1',
            profile: { username: 'validUser' },
            squadDetails: {
                id: '1',
                name: 'Squad 1',
                active_beer_call: [],
                past_beer_calls: [],
                scheduled_beer_calls: [
                    {
                        id: 'apero-1',
                        status: 'planned',
                        scheduled_for: scheduledTime,
                        participants: []
                    }
                ]
            },
            userLocation: null,
            isSquadModalOpen: false,
            isJoinModalOpen: false,
            selectedBeerCall: null,
            isWorldsModalOpen: null,
            scheduleCoordinates: null,
            isScheduleModalOpen: false,
            scheduledToStart: null,
            isNightMode: false,
            photoFile: null,
            fileInputRef: { current: null },
            mapRef: { current: null },
            showPushBanner: false,
            copied: false,
            handleSquadCreated: vi.fn(),
            handleCopyCode: vi.fn(),
            requestPushPermission: vi.fn(),
            dismissPushBanner: vi.fn(),
            handleBeerCallRespond: vi.fn(),
            centerToUser: vi.fn(),
            triggerPhotoCapture: vi.fn(),
            handleFileChange: vi.fn(),
            closeCreateModal: vi.fn(),
            handleScheduleModalSubmit: vi.fn(),
        } as unknown as ReturnType<typeof useDashboard>);

        render(<Dashboard />);
        expect(screen.getByTestId('mock-map')).toBeInTheDocument();

        const countdown = await screen.findByText(/Dans 0h 1m 00s|Dans 0h 0m 59s/);
        expect(countdown).toBeInTheDocument();

        act(() => {
            vi.advanceTimersByTime(1000);
        });

        await waitFor(() => {
            expect(screen.getByText(/Dans 0h 0m 59s|Dans 0h 0m 58s/)).toBeInTheDocument();
        });
    });
});