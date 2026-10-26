import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { useDashboard } from '../hooks/useDashboard';
import { useLocationStore } from '../store/useLocationStore';
import { DashboardActivityContext } from '../lib/dashboardActivity';

const route = vi.hoisted(() => ({ id: '1' }));

vi.mock('react-router-dom', async () => ({
    ...await vi.importActual<typeof import('react-router-dom')>('react-router-dom'),
    useParams: () => ({ id: route.id }),
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
        route.id = '1';
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

    it('un pointerup / touchend (relâchement) à 400 ms annule le timer et empêche l ouverture à 700 ms', () => {
        const { result } = renderHook(() => useDashboard());
        const startEvent = {
            originalEvent: { target: { closest: () => null } },
            point: { x: 100, y: 100 },
            lngLat: { toArray: () => [2.3522, 48.8566] },
        };

        act(() => {
            result.current.handleMapPointerDown(startEvent);
            vi.advanceTimersByTime(400);
        });

        const releaseEvent = {
            point: { x: 100, y: 100 },
        };

        act(() => {
            result.current.cancelLongPress(releaseEvent);
            vi.advanceTimersByTime(500);
        });

        expect(result.current.isScheduleModalOpen).toBe(false);
        expect(result.current.scheduleCoordinates).toBeNull();
    });

    it('un move de 5 px (inférieur au seuil) via handleMapPointerMove n annule pas le timer et ouvre la modale à 700 ms', () => {
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

        const smallMoveEvent = {
            point: { x: 105, y: 100 },
        };

        act(() => {
            result.current.handleMapPointerMove(smallMoveEvent);
            vi.advanceTimersByTime(400);
        });

        expect(result.current.isScheduleModalOpen).toBe(true);
        expect(result.current.scheduleCoordinates).toEqual({ lng: 2.3522, lat: 48.8566 });
    });

    it('un move de 15 px (supérieur au seuil) via handleMapPointerMove annule et réinitialise', () => {
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

        const largeMoveEvent = {
            point: { x: 115, y: 100 },
        };

        act(() => {
            result.current.handleMapPointerMove(largeMoveEvent);
            vi.advanceTimersByTime(500);
        });

        expect(result.current.isScheduleModalOpen).toBe(false);
        expect(result.current.scheduleCoordinates).toBeNull();
    });

    it('le seuil est exact : 12 px ouvre, 13 px annule via handleMapPointerMove', () => {
        const start = {
            originalEvent: { target: { closest: () => null } },
            point: { x: 100, y: 100 },
            lngLat: { toArray: () => [2.3522, 48.8566] },
        };

        const exact = renderHook(() => useDashboard());
        act(() => {
            exact.result.current.handleMapPointerDown(start);
            vi.advanceTimersByTime(300);
            exact.result.current.handleMapPointerMove({point: {x: 112, y: 100}});
            vi.advanceTimersByTime(500);
        });
        expect(exact.result.current.isScheduleModalOpen).toBe(true);
        exact.unmount();

        route.id = '1';
        const over = renderHook(() => useDashboard());
        act(() => {
            over.result.current.handleMapPointerDown(start);
            vi.advanceTimersByTime(300);
            over.result.current.handleMapPointerMove({point: {x: 113, y: 100}});
            vi.advanceTimersByTime(500);
        });
        expect(over.result.current.isScheduleModalOpen).toBe(false);
        expect(over.result.current.scheduleCoordinates).toBeNull();
    });

    it('un changement d id à 400 ms annule le maintien de la route précédente', () => {
        const { result, rerender } = renderHook(() => useDashboard());
        const event = {
            originalEvent: { target: { closest: () => null } },
            point: { x: 100, y: 100 },
            lngLat: { toArray: () => [2.3522, 48.8566] },
        };

        act(() => {
            result.current.handleMapPointerDown(event);
            vi.advanceTimersByTime(400);
        });

        act(() => {
            route.id = '2';
            rerender();
        });

        act(() => {
            vi.advanceTimersByTime(500);
        });

        expect(result.current.isScheduleModalOpen).toBe(false);
        expect(result.current.scheduleCoordinates).toBeNull();
    });

    it('une perte d activité à 400 ms annule le maintien', () => {
        const InactiveWrapper = ({children}: PropsWithChildren) => (
            <DashboardActivityContext.Provider value={false}>{children}</DashboardActivityContext.Provider>
        );
        const { result } = renderHook(() => useDashboard(), {wrapper: InactiveWrapper});
        const event = {
            originalEvent: { target: { closest: () => null } },
            point: { x: 100, y: 100 },
            lngLat: { toArray: () => [2.3522, 48.8566] },
        };

        act(() => {
            result.current.handleMapPointerDown(event);
            vi.advanceTimersByTime(400);
        });

        act(() => {
            vi.advanceTimersByTime(500);
        });

        expect(result.current.isScheduleModalOpen).toBe(false);
        expect(result.current.scheduleCoordinates).toBeNull();
    });

    it('un événement muté après pointerdown ne change pas les coordonnées initiales', () => {
        const { result } = renderHook(() => useDashboard());
        const event = {
            originalEvent: { target: { closest: () => null } },
            point: { x: 100, y: 100 },
            lngLat: { toArray: () => [2.3522, 48.8566] },
        };

        act(() => {
            result.current.handleMapPointerDown(event);
            event.lngLat.toArray = () => [9.9999, 9.9999];
            event.point = {x: 999, y: 999};
            vi.advanceTimersByTime(700);
        });

        expect(result.current.isScheduleModalOpen).toBe(true);
        expect(result.current.scheduleCoordinates).toEqual({lng: 2.3522, lat: 48.8566});
    });

    it('deux interactions successives : le second appui remplace le premier', () => {
        const { result } = renderHook(() => useDashboard());
        const first = {
            originalEvent: { target: { closest: () => null } },
            point: { x: 100, y: 100 },
            lngLat: { toArray: () => [2.3522, 48.8566] },
        };
        const second = {
            originalEvent: { target: { closest: () => null } },
            point: { x: 140, y: 160 },
            lngLat: { toArray: () => [4.8357, 45.7640] },
        };

        act(() => {
            result.current.handleMapPointerDown(first);
            vi.advanceTimersByTime(400);
            result.current.handleMapPointerDown(second);
            vi.advanceTimersByTime(699);
        });

        expect(result.current.isScheduleModalOpen).toBe(false);

        act(() => {
            vi.advanceTimersByTime(1);
        });

        expect(result.current.isScheduleModalOpen).toBe(true);
        expect(result.current.scheduleCoordinates).toEqual({lng: 4.8357, lat: 45.764});
    });
});
