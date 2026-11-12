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

const routerState = vi.hoisted(() => ({ squadId: '1' as string | undefined }));
vi.mock('react-router-dom', async () => ({ ...await vi.importActual<typeof import('react-router-dom')>('react-router-dom'), useParams: () => ({ id: routerState.squadId }), useNavigate: () => vi.fn() }));
vi.mock('../hooks/useProfile', () => ({ useProfile: () => ({ data: null }) }));
vi.mock('../hooks/useSquadDetails', () => ({ useSquadDetails: () => ({ data: { id: '1', name: 'Squad test', color: '#F59E0B', icon: 'beer', invite_code: 'TEST', active_beer_call: [], scheduled_beer_calls: [], past_beer_calls: [] } }) }));
vi.mock('../hooks/useSquads', () => ({ useSquads: () => ({ data: [], isLoading: false }) }));
vi.mock('../hooks/usePushNotifications', () => ({ usePushNotifications: () => ({ subscribeToNotifications: vi.fn() }) }));
vi.mock('../hooks/useSquadWebSocket', () => ({ useSquadWebSocket: vi.fn() }));
vi.mock('react-map-gl/maplibre', () => ({
    default: ({ children }: PropsWithChildren) => <div>{children}</div>,
    Marker: ({ children }: PropsWithChildren) => <div>{children}</div>, NavigationControl: () => null,
    useMap: () => ({ current: null }),
    Source: ({ children }: PropsWithChildren) => <div>{children}</div>,
    Layer: () => null,
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
    useLocationStore.setState({ userLocation: null, acquiredAt: null, isTracking: false, hasSessionFix: false, locationStatus: 'idle', error: null, permissionGranted: false });
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
    routerState.squadId = '1';
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

    it('openCamera suit id absent → présent → absent sans clic hors squad', () => {
        const view = renderHook(() => useDashboard());
        const input = document.createElement('input');
        const click = vi.spyOn(input, 'click').mockImplementation(() => {});
        view.result.current.fileInputRef.current = input;

        routerState.squadId = undefined;
        view.rerender();
        act(() => { state().startTracking(); watches[0].success(position(1000)); });
        act(() => view.result.current.openCamera());
        expect(click).not.toHaveBeenCalled();

        routerState.squadId = '1';
        view.rerender();
        act(() => view.result.current.openCamera());
        expect(click).toHaveBeenCalledTimes(1);

        routerState.squadId = undefined;
        view.rerender();
        act(() => view.result.current.openCamera());
        expect(click).toHaveBeenCalledTimes(1);
    });

    it('sans fix live : aucun joueur, aucun texte GPS mémorisé, cache conservé et création bloquée', () => {
        cache(1234);
        render(<Dashboard />);
        act(() => { watches.at(-1)!.error?.(gpsError); });

        expect(screen.queryByText(/Position mémorisée —/)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Position mémorisée/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Créer un Beer Call' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Relancer la localisation' })).toBeInTheDocument();
        expect(state().userLocation).toEqual({ lat: 40, lng: 3 });
        expect(state().hasSessionFix).toBe(false);

        const input = screen.getByLabelText('Photo du Beer Call');
        const click = vi.spyOn(input, 'click').mockImplementation(() => {});
        expect(click).not.toHaveBeenCalled();
    });

    it('recentre seulement avec un fix live et ne monte jamais le marker Créer', () => {
        cache(1234);
        render(<Dashboard />);
        expect(screen.queryByRole('button', { name: 'Créer un Beer Call' })).not.toBeInTheDocument();

        act(() => watches.at(-1)!.success(position(4000, 48, 2)));

        expect(screen.queryByRole('button', { name: 'Créer un Beer Call' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Me recentrer' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Relancer la localisation' })).not.toBeInTheDocument();

        // Avec un fix, le bouton recentre : aucune nouvelle acquisition.
        const before = watches.length;
        fireEvent.click(screen.getByRole('button', { name: 'Me recentrer' }));
        expect(watches).toHaveLength(before);
        expect(state().hasSessionFix).toBe(true);
    });

    it('le bouton geoloc relance une acquisition GPS quand aucun fix live n existe', () => {
        render(<Dashboard />);
        act(() => watches.at(-1)!.error?.(gpsError));
        const before = watches.length;

        fireEvent.click(screen.getByRole('button', { name: 'Relancer la localisation' }));

        expect(watches).toHaveLength(before + 1);
        expect(state()).toMatchObject({ isTracking: true, locationStatus: 'searching', hasSessionFix: false });
    });

    it('relance après un échec puis un nouveau watch réactive la création', () => {
        cache();
        const { result, click } = mountHook();
        act(() => { state().startTracking(); watches[0].error?.(gpsError); });
        act(() => result.current.openCamera());
        expect(click).not.toHaveBeenCalled();
        expect((result.current as unknown as Record<string, unknown>).retryGPS).toBeUndefined();
        act(() => state().startTracking());
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

    it('refuse le démarrage programmé sans fix live, même avec des coordonnées explicites', () => {
        cache();
        const { result, click } = mountHook();
        const scheduled: BeerCall = { id: 'scheduled', creator_name: 'User', creator_id: 1, location_name: 'Lieu prévu',
            longitude: 5, latitude: 50, status: 'scheduled', participants_count: 0, has_responded: false, can_start: true };
        act(() => result.current.openCamera({ lat: 50, lng: 5 }, scheduled));
        expect(click).not.toHaveBeenCalled();
        expect(result.current.photoLocation).toBeNull();
        expect(result.current.startingScheduledApero).toBeNull();
        expect(state().hasSessionFix).toBe(false);
    });

    it('démarre un apero programmé avec le fix live, jamais avec les coordonnées du marqueur', () => {
        const { result, click } = mountHook();
        act(() => watches[0].success(position(2000, 48.1, 2.1)));
        const scheduled: BeerCall = { id: 'scheduled', creator_name: 'User', creator_id: 1, location_name: 'Lieu prévu',
            longitude: 5, latitude: 50, status: 'scheduled', participants_count: 0, has_responded: false, can_start: true };
        act(() => result.current.openCamera({ lat: 50, lng: 5 }, scheduled));
        expect(click).toHaveBeenCalledTimes(1);
        expect(result.current.photoLocation).toEqual({ lat: 48.1, lng: 2.1 });
        expect(result.current.startingScheduledApero).toEqual(scheduled);
        expect(result.current.startingScheduledApero).toMatchObject({ id: 'scheduled', location_name: 'Lieu prévu' });
    });

    it('démarre le suivi au montage actif sans permission préalable et l arrête au démontage', () => {
        const { unmount } = renderHook(() => useDashboard());
        expect(watches).toHaveLength(1);
        expect(points).toHaveLength(1);
        expect(state()).toMatchObject({ isTracking: true, permissionGranted: false });

        act(() => unmount());
        expect(state().isTracking).toBe(false);
    });

    it('ne relance pas d acquisition au retour visible après un refus', () => {
        renderHook(() => useDashboard());
        act(() => watches[0].error?.(gpsError));
        const setVisibility = (value: DocumentVisibilityState) => {
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
            act(() => { document.dispatchEvent(new Event('visibilitychange')); });
        };
        try {
            setVisibility('hidden');
            setVisibility('visible');
            expect(watches).toHaveLength(1);
            expect(state()).toMatchObject({ locationStatus: 'denied', permissionGranted: false });
        } finally {
            Reflect.deleteProperty(document, 'visibilityState');
        }
    });

    it('dix rerenders ne doublent ni le point ni le watch', () => {
        const { rerender } = renderHook(() => useDashboard());
        for (let i = 0; i < 10; i++) act(() => rerender());
        expect(points).toHaveLength(1);
        expect(watches).toHaveLength(1);
    });

    it('garde le suivi en arrière-plan et ne rejoue pas d acquisition au retour visible', () => {
        renderHook(() => useDashboard());
        const setVisibility = (value: DocumentVisibilityState) => {
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
            act(() => { document.dispatchEvent(new Event('visibilitychange')); });
        };
        try {
            setVisibility('hidden');
            expect(state()).toMatchObject({ isTracking: true, locationStatus: 'searching' });
            expect(watches).toHaveLength(1);
            setVisibility('visible');
            expect(watches).toHaveLength(1);
            setVisibility('visible');
            expect(watches).toHaveLength(1);
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

    it('sans fix, Lancer existe avec squad mais ne déclenche jamais l’input et aucun marker Créer n’existe', () => {
        const { container } = render(<Dashboard />);
        const input = container.querySelector('input[aria-label="Photo du Beer Call"]') as HTMLInputElement;
        const click = vi.spyOn(input, 'click').mockImplementation(() => {});

        const launch = screen.getByRole('button', { name: /Lancer l'apéro/i });
        expect(launch).toBeEnabled();
        fireEvent.click(launch);
        expect(click).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: 'Créer un Beer Call' })).not.toBeInTheDocument();
    });

    it('avec fix live, Lancer déclenche l’input une fois avec la position live', () => {
        const { container } = render(<Dashboard />);
        act(() => { state().startTracking(); watches[0].success(position(2000, 49, 4)); });
        const input = container.querySelector('input[aria-label="Photo du Beer Call"]') as HTMLInputElement;
        const click = vi.spyOn(input, 'click').mockImplementation(() => {});

        fireEvent.click(screen.getByRole('button', { name: /Lancer l'apéro/i }));

        expect(click).toHaveBeenCalledTimes(1);
        expect(state().userLocation).toEqual({ lat: 49, lng: 4 });
        expect(screen.queryByRole('button', { name: 'Créer un Beer Call' })).not.toBeInTheDocument();
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
