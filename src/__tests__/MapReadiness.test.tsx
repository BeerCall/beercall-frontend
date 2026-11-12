import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, renderHook } from '@testing-library/react';
import { MapSection } from '../components/Dashboard/MapSection';
import { useDashboard } from '../hooks/useDashboard';
import { mapMockControl } from '../../setupTests';
import { getLatestSceneSignal, clearSceneMetrics } from '../lib/sceneMetrics';
import type { SnapPerson } from '../map/snap/types';

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

const member = (id: string, name: string, lng: number, lat: number): SnapPerson => ({
    id,
    bodyKey: `initial:${name.charAt(0).toUpperCase()}`,
    bodyUrl: null,
    hash: null,
    name,
    since: 'maintenant',
    coordinates: [lng, lat],
});

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

    describe('MapSection: carte réelle, aucune cellule 3D joueur', () => {
        const defaultProps = {
            mapRef: { current: null },
            userLocation: { lat: 48.8566, lng: 2.3522 },
            canCreateFromLocation: true,
            isNightMode: false,
            squadDetails: null,
            handleMapPointerDown: vi.fn(),
            cancelLongPress: vi.fn(),
            handleMapPointerMove: vi.fn(),
            handleManualRecenter: vi.fn(),
            handleBeerCallClick: vi.fn(),
            openCamera: vi.fn(),
            setIsWorldsModalOpen: vi.fn(),
            people: [member('a', 'Alice', 2.35, 48.85), member('b', 'Bob', 2.36, 48.86)],
        };

        it('avant onLoad : pas ready, aucune cellule 3D, couche Snap avec tous les membres', () => {
            const handleMapLoaded = vi.fn();
            render(<MapSection {...defaultProps} handleMapLoaded={handleMapLoaded} isMapReady={false} />);

            expect(screen.getByTestId('mock-map')).toBeInTheDocument();
            expect(screen.queryByTestId('avatar-canvas')).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Créer un Beer Call' })).not.toBeInTheDocument();
            const source = screen.getByTestId('mock-source');
            expect(source.querySelectorAll('[data-layer]')).toHaveLength(3);
            expect(handleMapLoaded).not.toHaveBeenCalled();
            expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();

            act(() => { vi.advanceTimersByTime(500); });
            expect(screen.queryByTestId('avatar-canvas')).not.toBeInTheDocument();
            expect(handleMapLoaded).not.toHaveBeenCalled();
            expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();
        });

        it('sur erreur de carte (onError) : ne valide jamais la readiness', () => {
            const handleMapLoaded = vi.fn();
            render(<MapSection {...defaultProps} handleMapLoaded={handleMapLoaded} isMapReady={false} />);

            act(() => { mapMockControl.triggerError(); });

            expect(screen.queryByTestId('avatar-canvas')).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Créer un Beer Call' })).not.toBeInTheDocument();
            expect(handleMapLoaded).not.toHaveBeenCalled();
            expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();
        });

        it('après onLoad : source Snap prête sans 3D, mapInteractive seulement après idle', () => {
            const handleMapLoaded = vi.fn();
            render(<MapSection {...defaultProps} handleMapLoaded={handleMapLoaded} isMapReady={false} />);

            act(() => { mapMockControl.triggerLoad(); });

            expect(handleMapLoaded).toHaveBeenCalledOnce();
            expect(screen.queryByTestId('avatar-canvas')).not.toBeInTheDocument();
            expect(screen.getByTestId('mock-source').querySelectorAll('[data-layer]')).toHaveLength(3);
            expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();

            act(() => { vi.advanceTimersByTime(1); mapMockControl.triggerIdle(); });

            const signal = getLatestSceneSignal('mapInteractive');
            expect(signal).toBeDefined();
            expect(signal?.view).toBe('dashboard');
        });

        it('conserve la même source après une erreur carte, sans certifier une carte en erreur', () => {
            render(<MapSection {...defaultProps} isMapReady={false} />);

            act(() => { mapMockControl.triggerLoad(); });
            const source = screen.getByTestId('mock-source');
            act(() => { vi.advanceTimersByTime(1); mapMockControl.triggerIdle(); });
            expect(getLatestSceneSignal('mapInteractive')).toBeDefined();

            act(() => { mapMockControl.triggerError(); });

            expect(screen.getByTestId('mock-source')).toBe(source);
            expect(screen.queryByTestId('avatar-canvas')).not.toBeInTheDocument();
            expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();
            act(() => { vi.advanceTimersByTime(1); mapMockControl.triggerIdle(); });
            expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();
        });

        it('ne remonte pas la source si la carte signale une erreur pendant le passage par le profil', () => {
            const { rerender } = render(<MapSection {...defaultProps} visible active isMapReady={false}/>);
            act(() => { mapMockControl.triggerLoad(); vi.advanceTimersByTime(1); mapMockControl.triggerIdle(); });
            rerender(<MapSection {...defaultProps} visible={false} active={false} isMapReady={false}/>);
            act(() => { mapMockControl.triggerError(); });
            rerender(<MapSection {...defaultProps} visible active isMapReady={false}/>);
            const newSource = screen.getByTestId('mock-source');
            expect(newSource).toBeInTheDocument();
            expect(newSource.querySelectorAll('[data-layer]')).toHaveLength(3);
            expect(screen.queryByTestId('avatar-canvas')).not.toBeInTheDocument();
            expect(getLatestSceneSignal('mapInteractive')).toBeUndefined();
        });
    });
});
