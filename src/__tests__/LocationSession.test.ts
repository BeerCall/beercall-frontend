import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useLocationStore } from '../store/useLocationStore';

interface Callbacks { success: PositionCallback; error?: PositionErrorCallback | null }
const pointCallbacks: Callbacks[] = [];
const watchCallbacks: Callbacks[] = [];
const getPosition = vi.fn<Geolocation['getCurrentPosition']>();
const watchPosition = vi.fn<Geolocation['watchPosition']>();
const clearWatch = vi.fn<Geolocation['clearWatch']>();
const originalGeo = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
const position = (timestamp: number, lat = 48, lng = 2) => ({
    timestamp, coords: { latitude: lat, longitude: lng, accuracy: 1, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
} as GeolocationPosition);
const gpsError = (code: number): GeolocationPositionError => ({ code, message: `GPS ${code}`, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
const state = () => useLocationStore.getState();
const start = () => state().startTracking();
const watchSuccess = (timestamp: number, lat = 48) => watchCallbacks[0].success(position(timestamp, lat));
const pointSuccess = (timestamp: number, lat = 48) => pointCallbacks[0].success(position(timestamp, lat));
const watchError = (code: number) => watchCallbacks[0].error?.(gpsError(code));
const pointError = (code: number) => pointCallbacks[0].error?.(gpsError(code));

beforeEach(() => {
    state().stopTracking();
    useLocationStore.setState({ userLocation: null, acquiredAt: null, hasSessionFix: false, locationStatus: 'idle', isTracking: false, error: null });
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

describe('GPS de session : cache et acquisitions concurrentes', () => {
    it('lance les deux sources sans cache navigateur et ne double pas le suivi', () => {
        start(); start();
        expect(getPosition).toHaveBeenCalledTimes(1);
        expect(watchPosition).toHaveBeenCalledTimes(1);
        expect(getPosition.mock.calls[0][2]).toMatchObject({ maximumAge: 0 });
        expect(watchPosition.mock.calls[0][2]).toMatchObject({ maximumAge: 0 });
        expect(state()).toMatchObject({ isTracking: true, locationStatus: 'searching', hasSessionFix: false });
    });

    it.each([undefined, 1234])('restaure le cache daté ou ancien sans inventer une session (%s)', async acquiredAt => {
        localStorage.setItem('beercall-location-storage', JSON.stringify({ state: { userLocation: { lat: 40, lng: 3 }, ...(acquiredAt === undefined ? {} : { acquiredAt }) }, version: 0 }));
        await useLocationStore.persist.rehydrate();
        expect(state()).toMatchObject({ userLocation: { lat: 40, lng: 3 }, acquiredAt: acquiredAt ?? null, hasSessionFix: false, locationStatus: 'idle', isTracking: false });
    });

    it.each([false, true])('conserve le cache après refus GPS, cache présent : %s', cached => {
        if (cached) useLocationStore.setState({ userLocation: { lat: 40, lng: 3 }, acquiredAt: 1234 });
        start(); watchError(1);
        expect(state()).toMatchObject({ locationStatus: 'denied', hasSessionFix: false, error: 'GPS 1',
            userLocation: cached ? { lat: 40, lng: 3 } : null, acquiredAt: cached ? 1234 : null });
    });

    it.each([[2, 'unavailable'], [3, 'timeout']] as const)('expose le code %i sans effacer les coordonnées', (code, status) => {
        useLocationStore.setState({ userLocation: { lat: 40, lng: 3 }, acquiredAt: 1234 });
        start(); pointError(code);
        expect(state()).toMatchObject({ locationStatus: status, hasSessionFix: false, acquiredAt: 1234, userLocation: { lat: 40, lng: 3 } });
    });

    it('signale unsupported sans démarrer une session', () => {
        Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
        start();
        expect(state()).toMatchObject({ locationStatus: 'unsupported', hasSessionFix: false, isTracking: false });
        expect(getPosition).not.toHaveBeenCalled();
    });

    it('accepte une position GPS courante et ne persiste que coordonnées/date', () => {
        start(); watchSuccess(2000);
        expect(state()).toMatchObject({ locationStatus: 'available', hasSessionFix: true, acquiredAt: 2000, userLocation: { lat: 48, lng: 2 }, error: null });
        expect(JSON.parse(localStorage.getItem('beercall-location-storage')!).state).toEqual({ userLocation: { lat: 48, lng: 2 }, acquiredAt: 2000 });
    });

    it('invalide immédiatement la génération après arrêt/reprise', () => {
        start(); const oldPoint = pointCallbacks[0], oldWatch = watchCallbacks[0];
        watchSuccess(2000);
        state().stopTracking();
        oldWatch.success(position(3000, 99)); oldPoint.error?.(gpsError(1));
        expect(state()).toMatchObject({ locationStatus: 'idle', hasSessionFix: false, acquiredAt: 2000 });
        expect(clearWatch).toHaveBeenCalledWith(42);
        start();
        oldPoint.success(position(5000, 99)); oldWatch.error?.(gpsError(1));
        expect(state()).toMatchObject({ locationStatus: 'searching', hasSessionFix: false, acquiredAt: 2000 });
        watchCallbacks[1].success(position(2500, 49));
        expect(state()).toMatchObject({ locationStatus: 'available', acquiredAt: 2500, userLocation: { lat: 49, lng: 2 } });
    });

    it('ignore le timeout ponctuel après un watch réussi', () => {
        start(); watchSuccess(2000); pointError(3);
        expect(state()).toMatchObject({ hasSessionFix: true, locationStatus: 'available', acquiredAt: 2000, error: null });
    });

    it('rétablit la session par watch après timeout ponctuel', () => {
        start(); pointError(3); watchSuccess(2000);
        expect(state()).toMatchObject({ hasSessionFix: true, locationStatus: 'available', acquiredAt: 2000, error: null });
    });

    it('ignore un succès ponctuel tardif même plus récent après le premier watch', () => {
        start(); pointSuccess(1000, 45); watchSuccess(2000, 48); pointSuccess(3000, 99);
        expect(state()).toMatchObject({ acquiredAt: 2000, userLocation: { lat: 48, lng: 2 }, hasSessionFix: true });
    });

    it('ne réactive pas la session par requête ponctuelle après une erreur watch', () => {
        start(); watchError(1); pointSuccess(3000, 99);
        expect(state()).toMatchObject({ locationStatus: 'denied', hasSessionFix: false, userLocation: null });
    });

    it('invalide puis rétablit une session par les callbacks watch courants', () => {
        start(); watchSuccess(2000); watchError(1);
        expect(state()).toMatchObject({ locationStatus: 'denied', hasSessionFix: false, acquiredAt: 2000 });
        watchSuccess(3000, 49);
        expect(state()).toMatchObject({ locationStatus: 'available', hasSessionFix: true, acquiredAt: 3000, error: null });
    });

    it('ignore les timestamps décroissants mais accepte un timestamp égal', () => {
        start(); watchSuccess(3000, 49); watchSuccess(2000, 99);
        expect(state()).toMatchObject({ acquiredAt: 3000, userLocation: { lat: 49, lng: 2 } });
        watchSuccess(3000, 50);
        expect(state()).toMatchObject({ acquiredAt: 3000, userLocation: { lat: 50, lng: 2 } });
    });

    it('ne prend pas la date du cache comme seuil de la nouvelle génération', () => {
        useLocationStore.setState({ userLocation: { lat: 40, lng: 3 }, acquiredAt: 9000 });
        start(); pointSuccess(1000);
        expect(state()).toMatchObject({ acquiredAt: 1000, hasSessionFix: true });
    });

    it('un premier watch obsolète ferme néanmoins la source ponctuelle', () => {
        start(); pointSuccess(3000, 48); watchSuccess(2000, 99); pointError(3);
        expect(state()).toMatchObject({ acquiredAt: 3000, locationStatus: 'available', hasSessionFix: true, userLocation: { lat: 48, lng: 2 } });
    });

    it('relance une acquisition après un échec terminal, sans doublon pendant la recherche', () => {
        start(); watchError(1);
        expect(getPosition).toHaveBeenCalledTimes(1);
        expect(state().isTracking).toBe(true);

        start();
        expect(getPosition).toHaveBeenCalledTimes(2);
        expect(watchPosition).toHaveBeenCalledTimes(2);
        expect(clearWatch).toHaveBeenCalledWith(42);
        expect(state()).toMatchObject({ locationStatus: 'searching', hasSessionFix: false });
        expect(watchCallbacks).toHaveLength(2);

        watchCallbacks[0].success(position(3000, 99));
        expect(state().hasSessionFix).toBe(false);
        watchCallbacks[1].success(position(4000, 49));
        expect(state()).toMatchObject({ hasSessionFix: true, acquiredAt: 4000, userLocation: { lat: 49, lng: 2 } });
    });

    it('ne relance pas une acquisition quand un fix est déjà disponible', () => {
        start(); watchSuccess(2000);
        start();
        expect(getPosition).toHaveBeenCalledTimes(1);
        expect(watchPosition).toHaveBeenCalledTimes(1);
    });
});
