import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, renderHook } from '@testing-library/react';
import { MapSection } from '../components/Dashboard/MapSection';
import { useDashboard } from '../hooks/useDashboard';
import { mapMockControl } from '../../setupTests';
import { getLatestSceneSignal, clearSceneMetrics } from '../lib/sceneMetrics';
import type { Profile } from '../types/dashboard';

vi.mock('react-router-dom', async () => ({
    ...await vi.importActual<typeof import('react-router-dom')>('react-router-dom'),
    useParams: () => ({ id: '1' }),
    useNavigate: () => vi.fn(),
}));

vi.mock('../hooks/useProfile', () => ({
    useProfile: () => ({ data: { username: 'soldat', avatar: { hair: 'short', clothes: 'tshirt' } } }),
}));

vi.mock('../hooks/useSquadDetails', () => ({
    useSquadDetails: () => ({ data: null, isPending: false, isFetching: false, isError: false, error: null, refetch: vi.fn() }),
}));

vi.mock('../hooks/useSquadWebSocket', () => ({
    useSquadWebSocket: vi.fn(),
}));

vi.mock('../hooks/usePushNotifications', () => ({
    usePushNotifications: () => ({ subscribeToNotifications: vi.fn().mockResolvedValue(true) }),
}));

vi.mock('../components/3D/AvatarCanvas', () => ({
    default: () => <div data-testid="avatar-canvas">Avatar 3D Prêt</div>,
}));

describe('Map Readiness & onLoad lifecycle (CHAL-07)', () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        mapMockControl.reset();
        mapMockControl.autoLoad = false;
        mapMockControl.autoIdle = false;
        clearSceneMetrics();
    });

    afterEach(() => {
        vi.useRealTimers();
        clearSceneMetrics();
    });

    describe('useDashboard: suppression du timer artificiel de 500 ms', () => {
        it('démarre avec isMapReady=false et n’active aucun timer de 500 ms', () => {
            const { result } = renderHook(() => useDashboard());

            expect(result.current.isMapReady).toBe(false);

            // Avance le temps de 500 ms puis 5000 ms : isMapReady DOIT rester false
            act(() => {
                vi.advanceTimersByTime(500);
            });
            expect(result.current.isMapReady).toBe(false);

            act(() => {
                vi.advanceTimersByTime(5000);
            });
            expect(result.current.isMapReady).toBe(false);
        });

        it('active isMapReady immédiatement lors de l’appel handleMapLoaded', () => {
            const { result } = renderHook(() => useDashboard());

            expect(result.current.isMapReady).toBe(false);

            act(() => {
                result.current.handleMapLoaded();
            });

            expect(result.current.isMapReady).toBe(true);
        });

        it('expose une référence stable pour handleMapLoaded', () => {
            const { result, rerender } = renderHook(() => useDashboard());
            const firstCallback = result.current.handleMapLoaded;

            rerender();
            expect(result.current.handleMapLoaded).toBe(firstCallback);
        });
    });

    describe('MapSection: cycle de vie d’événements réels MapLibre', () => {
        const dummyProfile: Profile = {
            id: 'u1',
            username: 'soldat',
            avatar: { hair: 'short', clothes: 'tshirt' }
        } as unknown as Profile;

        const defaultProps = {
            mapRef: { current: null },
            userLocation: { lat: 48.8566, lng: 2.3522 },
            canCreateFromLocation: true,
            isNightMode: false,
            squadDetails: null,
            profile: dummyProfile,
            handleMapPointerDown: vi.fn(),
            cancelLongPress: vi.fn(),
            handleMapPointerMove: vi.fn(),
            handleManualRecenter: vi.fn(),
            handleBeerCallClick: vi.fn(),
            openCamera: vi.fn(),
            setIsWorldsModalOpen: vi.fn(),
        };

        it('avant onLoad : pas ready, spinner présent, pas de timer 500 ms, aucun signal mapInteractive', () => {
            const handleMapLoaded = vi.fn();
            render(<MapSection {...defaultProps} handleMapLoaded={handleMapLoaded} isMapReady={false} />);

            // Vérifie la présence de la carte mockée
            expect(screen.getByTestId('mock-map')).toBeInTheDocument();

            // L'avatar n'est PAS encore rendu : le spinner est présent
            expect(screen.queryByTestId('avatar-canvas')).not.toBeInTheDocument();
            expect(handleMapLoaded).not.toHaveBeenCalled();
            expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();

            // Même après 500 ms, l'avatar n'est pas autorisé sans onLoad réel
            act(() => {
                vi.advanceTimersByTime(500);
            });
            expect(screen.queryByTestId('avatar-canvas')).not.toBeInTheDocument();
            expect(handleMapLoaded).not.toHaveBeenCalled();
            expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();
        });

        it('sur erreur de carte (onError) : ne valide jamais la readiness', () => {
            const handleMapLoaded = vi.fn();
            render(<MapSection {...defaultProps} handleMapLoaded={handleMapLoaded} isMapReady={false} />);

            expect(screen.queryByTestId('avatar-canvas')).not.toBeInTheDocument();

            // Simulation d'une erreur MapLibre (échec de tuiles/style)
            act(() => {
                mapMockControl.triggerError();
            });

            expect(screen.queryByTestId('avatar-canvas')).not.toBeInTheDocument();
            expect(handleMapLoaded).not.toHaveBeenCalled();
            expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();
        });

        it('après événement onLoad : avatar autorisé immédiatement sans attente 500 ms', async () => {
            const handleMapLoaded = vi.fn();
            render(<MapSection {...defaultProps} handleMapLoaded={handleMapLoaded} isMapReady={false} />);

            expect(screen.queryByTestId('avatar-canvas')).not.toBeInTheDocument();

            // Déclenchement de l'événement onLoad réel de la carte
            act(() => {
                mapMockControl.triggerLoad();
            });

            expect(handleMapLoaded).toHaveBeenCalledOnce();

            // L'avatar 3D est désormais autorisé et rendu sans attendre
            const canvas = await screen.findByTestId('avatar-canvas');
            expect(canvas).toBeInTheDocument();

            // SÉPARATION T10C : onLoad seul N'ÉMET PAS mapInteractive
            expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();

            // C'est onIdle qui certifie l'interactivité de la scène
            act(() => {
                mapMockControl.triggerIdle();
            });

            const signal = getLatestSceneSignal('mapInteractive');
            expect(signal).toBeDefined();
            expect(signal?.view).toBe('dashboard');
        });

        it('conserve le même avatar après une erreur carte, sans certifier une carte en erreur', async () => {
            render(<MapSection {...defaultProps} isMapReady={false} />);

            act(() => {
                mapMockControl.triggerLoad();
            });

            const canvas = await screen.findByTestId('avatar-canvas');
            act(() => { mapMockControl.triggerIdle(); });
            expect(getLatestSceneSignal('mapInteractive')).toBeDefined();

            // Erreur subséquente
            act(() => {
                mapMockControl.triggerError();
            });

            expect(screen.getByTestId('avatar-canvas')).toBe(canvas);
            expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();
            act(() => { mapMockControl.triggerIdle(); });
            expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();
        });

        it('ne remonte pas l’avatar si la carte signale une erreur pendant le passage par le profil', async () => {
            const { rerender } = render(<MapSection {...defaultProps} visible active isMapReady={false}/>);
            act(() => { mapMockControl.triggerLoad(); mapMockControl.triggerIdle(); });
            const canvas = await screen.findByTestId('avatar-canvas');
            rerender(<MapSection {...defaultProps} visible={false} active={false} isMapReady={false}/>);
            act(() => { mapMockControl.triggerError(); });
            rerender(<MapSection {...defaultProps} visible active isMapReady={false}/>);
            expect(screen.getByTestId('avatar-canvas')).toBe(canvas);
            expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();
        });
    });
});
