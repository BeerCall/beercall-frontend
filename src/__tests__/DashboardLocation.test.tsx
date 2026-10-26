import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, screen, fireEvent } from '@testing-library/react';
import { StrictMode, type PropsWithChildren } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import { render } from './utils/test-utils';
import { useDashboard } from '../hooks/useDashboard';
import { useLocationStore } from '../store/useLocationStore';
import { useToastStore } from '../store/useToastStore';
import Dashboard from '../pages/Dashboard';
import type { BeerCall } from '../types/api';

vi.mock('react-router-dom', async () => ({ ...await vi.importActual<typeof import('react-router-dom')>('react-router-dom'), useParams: () => ({ id: '1' }), useNavigate: () => vi.fn() }));
vi.mock('../hooks/useProfile', () => ({ useProfile: () => ({ data: null }) }));
vi.mock('../hooks/useSquadDetails', () => ({ useSquadDetails: () => ({ data: { id: '1', name: 'Squad test', color: '#F59E0B', icon: 'beer', invite_code: 'TEST', active_beer_call: [], scheduled_beer_calls: [], past_beer_calls: [] } }) }));
vi.mock('../hooks/useSquads', () => ({ useSquads: () => ({ data: [], isLoading: false }) }));
vi.mock('../hooks/usePushNotifications', () => ({ usePushNotifications: () => ({ subscribeToNotifications: vi.fn() }) }));
vi.mock('../hooks/useSquadWebSocket', () => ({ useSquadWebSocket: vi.fn() }));
vi.mock('react-map-gl/maplibre', () => ({
    default: ({ children }: PropsWithChildren) => <div>{children}</div>,
    Marker: ({ children }: PropsWithChildren) => <div>{children}</div>, NavigationControl: () => null,
}));
interface Callbacks { success: PositionCallback; error?: PositionErrorCallback | null }
const points: Callbacks[] = [], watches: Callbacks[] = [];
const originalGeo = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
const position = (timestamp: number, lat = 48, lng = 2) => ({ timestamp, coords: { latitude: lat, longitude: lng } } as GeolocationPosition);
const gpsError: GeolocationPositionError = { code: 1, message: 'Refus GPS', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
const state = () => useLocationStore.getState();
const cache = (date: number | null = null) => useLocationStore.setState({ userLocation: { lat: 40, lng: 3 }, acquiredAt: date });
function mountHook() {
    const view = renderHook(() => useDashboard());
    const input = document.createElement('input');
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    view.result.current.fileInputRef.current = input;
    return { ...view, click };
}
beforeEach(() => {
    state().stopTracking();
    useLocationStore.setState({ userLocation: null, acquiredAt: null, isTracking: false, hasSessionFix: false, locationStatus: 'idle', error: null });
    useToastStore.setState({ toasts: [] });
    points.length = 0; watches.length = 0;
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
        getCurrentPosition: vi.fn((success: PositionCallback, error?: PositionErrorCallback) => { points.push({ success, error }); }),
        watchPosition: vi.fn((success: PositionCallback, error?: PositionErrorCallback) => { watches.push({ success, error }); return 1; }),
        clearWatch: vi.fn(),
    } });
});
afterEach(() => {
    state().stopTracking();
    if (originalGeo) Object.defineProperty(navigator, 'geolocation', originalGeo);
    else Reflect.deleteProperty(navigator, 'geolocation');
});

describe('Dashboard : GPS de session et garde live de caméra', () => {
    it('signale le refus sans cache et ne prétend pas rechercher au recentrage', () => {
        const { result, click } = mountHook();
        act(() => { state().startTracking(); watches[0].error?.(gpsError); });
        expect(result.current.locationMessage).toContain('Autorise la localisation dans les réglages du navigateur');
        act(() => { result.current.openCamera(); result.current.handleManualRecenter(); });
        expect(click).not.toHaveBeenCalled();
        expect(useToastStore.getState().toasts.at(-1)?.message).toContain('Autorise la localisation');
        expect(useToastStore.getState().toasts.at(-1)?.message).not.toContain('Recherche en cours');
    });

    it.each([null, 1234])('conserve le repère du cache et expose son ancienneté (%s)', date => {
        cache(date);
        render(<Dashboard />);
        act(() => { state().startTracking(); watches[0].error?.(gpsError); });
        expect(screen.getByText(/Position mémorisée —/)).toHaveTextContent(date === null ? 'ancienneté inconnue' : new Date(date).toLocaleString());
        const marker = screen.getByRole('button', { name: 'Position mémorisée — création indisponible' });
        expect(marker).toHaveAttribute('aria-disabled', 'true');
        const input = screen.getByLabelText('Photo du Beer Call');
        const click = vi.spyOn(input, 'click').mockImplementation(() => {});
        fireEvent.click(marker);
        fireEvent.keyDown(marker, { key: 'Enter' });
        fireEvent.keyDown(marker, { key: ' ' });
        expect(click).not.toHaveBeenCalled();
        expect(state().userLocation).toEqual({ lat: 40, lng: 3 });
    });

    it('retry invalide le suivi puis un nouveau watch réactive la création', () => {
        cache();
        const { result, click } = mountHook();
        act(() => { state().startTracking(); watches[0].error?.(gpsError); });
        act(() => result.current.openCamera());
        expect(click).not.toHaveBeenCalled();
        act(() => result.current.retryGPS());
        expect(result.current.locationStatus).toBe('searching');
        act(() => watches[1].success(position(2000, 49, 4)));
        expect(result.current.canCreateFromLocation).toBe(true);
        act(() => result.current.openCamera());
        expect(click).toHaveBeenCalledTimes(1);
        expect(result.current.photoLocation).toEqual({ lat: 49, lng: 4 });
    });

    it('bloque un ancien callback capturé avec un fix devenu refusé', () => {
        const { result, click } = mountHook();
        act(() => { state().startTracking(); watches[0].success(position(2000)); });
        const oldOpenCamera = result.current.openCamera;
        act(() => watches[0].error?.(gpsError));
        act(() => oldOpenCamera());
        expect(click).not.toHaveBeenCalled();
        expect(result.current.canCreateFromLocation).toBe(false);
        expect(state().userLocation).toEqual({ lat: 48, lng: 2 });
    });

    it('utilise les coordonnées live du watch malgré un callback plus ancien et un timeout ponctuel', () => {
        const { result, click } = mountHook();
        const oldOpenCamera = result.current.openCamera;
        act(() => { state().startTracking(); watches[0].success(position(2000, 49, 4)); points[0].error?.({ ...gpsError, code: 3 }); });
        act(() => oldOpenCamera());
        expect(click).toHaveBeenCalledTimes(1);
        expect(result.current.photoLocation).toEqual({ lat: 49, lng: 4 });
    });

    it('un succès ponctuel tardif ne contourne pas le refus du watch', () => {
        const { result, click } = mountHook();
        act(() => { state().startTracking(); watches[0].error?.(gpsError); points[0].success(position(3000)); });
        act(() => result.current.openCamera());
        expect(click).not.toHaveBeenCalled();
        expect(result.current.locationStatus).toBe('denied');
    });

    it('recentre le cache en expliquant sa provenance', () => {
        cache();
        const { result } = mountHook();
        const flyTo = vi.fn();
        result.current.mapRef.current = { flyTo } as unknown as MapRef;
        act(() => result.current.handleManualRecenter());
        expect(flyTo).toHaveBeenCalledWith(expect.objectContaining({ center: [3, 40] }));
        expect(useToastStore.getState().toasts.at(-1)?.title).toBe('Position mémorisée');
    });

    it('garde le démarrage programmé avec ses coordonnées explicites sans nouveau fix', () => {
        cache();
        const { result, click } = mountHook();
        const scheduled: BeerCall = { id: 'scheduled', creator_name: 'User', creator_id: 1, location_name: 'Lieu prévu',
            longitude: 5, latitude: 50, status: 'scheduled', participants_count: 0, has_responded: false, can_start: true };
        act(() => result.current.openCamera({ lat: 50, lng: 5 }, scheduled));
        expect(click).toHaveBeenCalledTimes(1);
        expect(result.current.photoLocation).toEqual({ lat: 50, lng: 5 });
        expect(result.current.startingScheduledApero).toEqual(scheduled);
    });

    it('démarre le suivi au montage actif et l arrête au démontage', () => {
        const { unmount } = renderHook(() => useDashboard());
        expect(watches).toHaveLength(1);
        expect(points).toHaveLength(1);
        expect(state().isTracking).toBe(true);

        act(() => unmount());
        expect(state().isTracking).toBe(false);
    });

    it('dix rerenders ne doublent ni le point ni le watch', () => {
        const { rerender } = renderHook(() => useDashboard());
        for (let i = 0; i < 10; i++) act(() => rerender());
        expect(points).toHaveLength(1);
        expect(watches).toHaveLength(1);
    });

    it('arrête à la mise en arrière-plan et reprend une seule fois au retour visible', () => {
        renderHook(() => useDashboard());
        const setVisibility = (value: DocumentVisibilityState) => {
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
            act(() => { document.dispatchEvent(new Event('visibilitychange')); });
        };
        try {
            setVisibility('hidden');
            expect(state()).toMatchObject({ isTracking: false, locationStatus: 'idle' });
            setVisibility('visible');
            expect(watches).toHaveLength(2);
            setVisibility('visible');
            expect(watches).toHaveLength(2);
        } finally {
            Reflect.deleteProperty(document, 'visibilityState');
        }
    });

    it('sous StrictMode, un seul watch reste actif et les callbacks périmés sont ignorés', () => {
        renderHook(() => useDashboard(), { wrapper: ({ children }) => <StrictMode>{children}</StrictMode> });
        expect(state().isTracking).toBe(true);
        expect(watches.length).toBeGreaterThanOrEqual(1);

        act(() => watches.at(-1)!.success(position(2000, 49)));
        expect(state()).toMatchObject({ hasSessionFix: true, acquiredAt: 2000, userLocation: { lat: 49, lng: 2 } });

        // Si StrictMode a bien rejoué l'effet, le callback de la génération précédente
        // ne doit plus déplacer le fix.
        if (watches.length > 1) {
            act(() => watches[0].success(position(3000, 90)));
            expect(state()).toMatchObject({ acquiredAt: 2000, userLocation: { lat: 49, lng: 2 } });
        }
    });

    it('un refus ne relance pas de lui-même et une demande explicite réussit', () => {
        renderHook(() => useDashboard());
        act(() => watches[0].error?.(gpsError));
        expect(points).toHaveLength(1);
        expect(watches).toHaveLength(1);
        expect(state().isTracking).toBe(true);

        act(() => state().startTracking());
        expect(watches).toHaveLength(2);
        act(() => watches[1].success(position(2000, 49)));
        expect(state()).toMatchObject({ hasSessionFix: true, userLocation: { lat: 49, lng: 2 } });
    });
});
