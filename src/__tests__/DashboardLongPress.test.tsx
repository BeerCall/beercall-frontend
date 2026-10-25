import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { useDashboard } from '../hooks/useDashboard';
import { useLocationStore } from '../store/useLocationStore';

vi.mock('react-router-dom', async () => ({
    ...await vi.importActual<typeof import('react-router-dom')>('react-router-dom'),
    useParams: () => ({ id: '1' }),
    useNavigate: () => vi.fn(),
}));

vi.mock('../hooks/useProfile', () => ({
    useProfile: () => ({ data: { username: 'soldat', avatar: { hair: 'short', clothes: 'tshirt' } } }),
}));

vi.mock('../hooks/useSquadDetails', () => ({
    useSquadDetails: () => ({
        data: {
            id: '1',
            name: 'Squad LongPress',
            color: '#F59E0B',
            icon: 'beer',
            invite_code: 'PRESS',
            active_beer_call: [],
            scheduled_beer_calls: [],
            past_beer_calls: [],
        },
        isPending: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
    }),
}));

vi.mock('../hooks/useSquads', () => ({
    useSquads: () => ({ data: [], isLoading: false }),
}));

vi.mock('../hooks/usePushNotifications', () => ({
    usePushNotifications: () => ({ subscribeToNotifications: vi.fn().mockResolvedValue(true) }),
}));

vi.mock('../hooks/useSquadWebSocket', () => ({
    useSquadWebSocket: vi.fn(),
}));

vi.mock('react-map-gl/maplibre', () => ({
    default: ({ children }: PropsWithChildren) => <div>{children}</div>,
    Marker: ({ children }: PropsWithChildren) => <div>{children}</div>,
    NavigationControl: () => null,
}));

describe('Garanties de maintien carte (UX-01 / T01)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        useLocationStore.setState({
            userLocation: { lat: 48.8566, lng: 2.3522 },
            acquiredAt: Date.now(),
            hasSessionFix: true,
            locationStatus: 'available',
            isTracking: false,
            error: null,
        });
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it('fermé à 699 ms après l appui', () => {
        const { result } = renderHook(() => useDashboard());
        const event = {
            originalEvent: { target: { closest: () => null } },
            point: { x: 100, y: 100 },
            lngLat: { toArray: () => [2.3522, 48.8566] },
        };

        act(() => {
            result.current.handleMapPointerDown(event);
            vi.advanceTimersByTime(699);
        });

        expect(result.current.isScheduleModalOpen).toBe(false);
        expect(result.current.scheduleCoordinates).toBeNull();
    });

    it('ouvert à 700 ms aux coordonnées initiales', () => {
        const { result } = renderHook(() => useDashboard());
        const event = {
            originalEvent: { target: { closest: () => null } },
            point: { x: 100, y: 100 },
            lngLat: { toArray: () => [2.3522, 48.8566] },
        };

        act(() => {
            result.current.handleMapPointerDown(event);
            vi.advanceTimersByTime(700);
        });

        expect(result.current.isScheduleModalOpen).toBe(true);
        expect(result.current.scheduleCoordinates).toEqual({ lng: 2.3522, lat: 48.8566 });
    });

    it('mouvement supérieur à 12 px (ex: 13 px) annule le déclenchement', () => {
        const { result } = renderHook(() => useDashboard());
        const startEvent = {
            originalEvent: { target: { closest: () => null } },
            point: { x: 100, y: 100 },
            lngLat: { toArray: () => [2.3522, 48.8566] },
        };

        act(() => {
            result.current.handleMapPointerDown(startEvent);
            vi.advanceTimersByTime(300);
        });

        const moveEvent = {
            point: { x: 113, y: 100 },
        };

        act(() => {
            result.current.cancelLongPress(moveEvent);
            vi.advanceTimersByTime(500);
        });

        expect(result.current.isScheduleModalOpen).toBe(false);
        expect(result.current.scheduleCoordinates).toBeNull();
    });

    it('deux doigts ne programment pas le maintien', () => {
        const { result } = renderHook(() => useDashboard());
        const multiTouchEvent = {
            originalEvent: {
                target: { closest: () => null },
                touches: [{}, {}],
            },
            point: { x: 100, y: 100 },
            lngLat: { toArray: () => [2.3522, 48.8566] },
        };

        act(() => {
            result.current.handleMapPointerDown(multiTouchEvent);
            vi.advanceTimersByTime(800);
        });

        expect(result.current.isScheduleModalOpen).toBe(false);
        expect(result.current.scheduleCoordinates).toBeNull();
    });

    it('cible bouton ou élément interactif ignorée', () => {
        const { result } = renderHook(() => useDashboard());
        const buttonEvent = {
            originalEvent: {
                target: {
                    closest: (selector: string) => selector.includes('button'),
                },
            },
            point: { x: 100, y: 100 },
            lngLat: { toArray: () => [2.3522, 48.8566] },
        };

        act(() => {
            result.current.handleMapPointerDown(buttonEvent);
            vi.advanceTimersByTime(800);
        });

        expect(result.current.isScheduleModalOpen).toBe(false);
        expect(result.current.scheduleCoordinates).toBeNull();
    });

    it('démontage du hook annule le timer sans effet de bord', () => {
        const { result, unmount } = renderHook(() => useDashboard());
        const event = {
            originalEvent: { target: { closest: () => null } },
            point: { x: 100, y: 100 },
            lngLat: { toArray: () => [2.3522, 48.8566] },
        };

        act(() => {
            result.current.handleMapPointerDown(event);
            vi.advanceTimersByTime(400);
        });

        unmount();

        act(() => {
            vi.advanceTimersByTime(500);
        });

        expect(result.current.isScheduleModalOpen).toBe(false);
    });
});
