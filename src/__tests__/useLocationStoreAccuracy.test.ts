import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useLocationStore } from '../store/useLocationStore';

interface Callbacks { success: PositionCallback; error?: PositionErrorCallback | null }
const pointCallbacks: Callbacks[] = [];
const watchCallbacks: Callbacks[] = [];
const getPosition = vi.fn<Geolocation['getCurrentPosition']>();
const watchPosition = vi.fn<Geolocation['watchPosition']>();
const clearWatch = vi.fn<Geolocation['clearWatch']>();
const originalGeo = Object.getOwnPropertyDescriptor(navigator, 'geolocation');

const position = (timestamp: number, accuracy: number, lat = 48, lng = 2) => ({
    timestamp,
    coords: { latitude: lat, longitude: lng, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
} as GeolocationPosition);

const state = () => useLocationStore.getState();
const start = () => state().startTracking();
const watchSuccess = (timestamp: number, accuracy: number, lat = 48) => watchCallbacks[0].success(position(timestamp, accuracy, lat));

beforeEach(() => {
    state().stopTracking();
    useLocationStore.setState({ userLocation: null, acquiredAt: null, accuracy: null, hasSessionFix: false, locationStatus: 'idle', isTracking: false, error: null });
    pointCallbacks.length = 0;
    watchCallbacks.length = 0;
    vi.clearAllMocks();
    getPosition.mockImplementation((success, error) => { pointCallbacks.push({ success, error }); });
    watchPosition.mockImplementation((success, error) => { watchCallbacks.push({ success, error }); return 42; });
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: getPosition, watchPosition, clearWatch } });
});

afterEach(() => {
    state().stopTracking();
    if (originalGeo) Object.defineProperty(navigator, 'geolocation', originalGeo);
    else Reflect.deleteProperty(navigator, 'geolocation');
});

describe('B03 — précision GPS', () => {
    it('capture une précision finie positive', () => {
        start();
        watchSuccess(2000, 12.5);
        expect(state()).toMatchObject({ accuracy: 12.5, hasSessionFix: true, locationStatus: 'available' });
    });

    it('remet null pour une précision non valide', () => {
        for (const accuracy of [NaN, -1, Infinity, -Infinity]) {
            useLocationStore.setState({ accuracy: 42 });
            start();
            watchSuccess(2000, accuracy);
            expect(state().accuracy).toBeNull();
            state().stopTracking();
            watchCallbacks.length = 0;
        }
    });

    it('remet null au démarrage d une nouvelle acquisition', () => {
        start();
        watchSuccess(2000, 9);
        expect(state().accuracy).toBe(9);
        state().stopTracking();
        expect(state().accuracy).toBeNull();
        start();
        expect(state().accuracy).toBeNull();
    });

    it('remet null sur échec sans effacer les coordonnées', () => {
        useLocationStore.setState({ userLocation: { lat: 40, lng: 3 }, acquiredAt: 1234, accuracy: 5 });
        start();
        watchCallbacks[0].error?.({ code: 1, message: 'GPS 1', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
        expect(state()).toMatchObject({ accuracy: null, locationStatus: 'denied', userLocation: { lat: 40, lng: 3 }, acquiredAt: 1234 });
    });

    it('ne persiste pas la précision', async () => {
        start();
        watchSuccess(2000, 7);
        const stored = JSON.parse(localStorage.getItem('beercall-location-storage')!).state;
        expect(stored).toEqual({ userLocation: { lat: 48, lng: 2 }, acquiredAt: 2000 });
        expect(stored).not.toHaveProperty('accuracy');
        await useLocationStore.persist.rehydrate();
        expect(state()).toMatchObject({ accuracy: null, userLocation: { lat: 48, lng: 2 }, acquiredAt: 2000, hasSessionFix: false });
    });
});
