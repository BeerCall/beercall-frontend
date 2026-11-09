import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { queryGeolocationPermission } from '../lib/geolocationPermission';

interface LocationState {
    userLocation: { lat: number; lng: number } | null;
    acquiredAt: number | null;
    accuracy: number | null;
    hasSessionFix: boolean;
    locationStatus: 'idle' | 'searching' | 'available' | 'denied' | 'unavailable' | 'timeout' | 'unsupported';
    isTracking: boolean;
    error: string | null;
    /** Permission confirmée par un fix réussi pendant cette session. */
    permissionGranted: boolean;
    startTracking: () => void;
    /** Acquisition automatique uniquement si la permission est déjà connue. */
    startTrackingIfPermitted: () => Promise<void>;
    stopTracking: () => void;
}

export const useLocationStore = create<LocationState>()(
    persist(
        (set, get) => {
            let watchId: number | null = null;
            let generation = 0;
            let permissionQueryGeneration = 0;
            let trackingGeolocation: Geolocation | null = null;

            return {
                userLocation: null,
                acquiredAt: null,
                accuracy: null,
                hasSessionFix: false,
                locationStatus: 'idle',
                isTracking: false,
                error: null,
                permissionGranted: false,

                startTracking: () => {
                    permissionQueryGeneration++;
                    const current = get();
                    // Une acquisition en cours (recherche ou fix utilisable) ne se double pas.
                    // Après un échec terminal, la session reste stable mais une demande
                    // explicite (bouton geoloc, retour visible) peut relancer une acquisition.
                    if (current.isTracking && (current.locationStatus === 'searching' || current.locationStatus === 'available')) return;
                    const currentGeneration = ++generation;
                    if (watchId !== null) {
                        trackingGeolocation?.clearWatch(watchId);
                        watchId = null;
                    }
                    let watchHasReported = false;
                    let lastAcceptedTimestamp: number | null = null;
                    set({ hasSessionFix: false, locationStatus: 'searching', error: null, accuracy: null });
                    const geolocation = navigator.geolocation;
                    if (!geolocation) {
                        set({ locationStatus: 'unsupported', isTracking: false, permissionGranted: false, error: "Géolocalisation non supportée par votre navigateur." });
                        return;
                    }
                    trackingGeolocation = geolocation;
                    set({ isTracking: true });
                    const canAccept = (source: 'watch' | 'point') => {
                        if (generation !== currentGeneration || !get().isTracking) return false;
                        if (source === 'watch') watchHasReported = true;
                        return source === 'watch' || !watchHasReported;
                    };
                    const success = (source: 'watch' | 'point', pos: GeolocationPosition) => {
                        if (!canAccept(source)) return;
                        if (lastAcceptedTimestamp !== null && pos.timestamp < lastAcceptedTimestamp) return;
                        lastAcceptedTimestamp = pos.timestamp;
                        const accuracy = Number.isFinite(pos.coords.accuracy) && pos.coords.accuracy >= 0
                            ? pos.coords.accuracy
                            : null;
                        set({ userLocation: { lat: pos.coords.latitude, lng: pos.coords.longitude },
                            acquiredAt: pos.timestamp, accuracy, hasSessionFix: true, locationStatus: 'available', error: null,
                            permissionGranted: true });
                    };
                    const failure = (source: 'watch' | 'point', err: GeolocationPositionError) => {
                        if (!canAccept(source)) return;
                        console.warn('Erreur de géolocalisation', err);
                        const denied = err.code === 1;
                        set({ error: err.message, hasSessionFix: false, accuracy: null,
                            locationStatus: denied ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable',
                            permissionGranted: denied ? false : get().permissionGranted });
                    };
                    geolocation.getCurrentPosition(pos => success('point', pos), err => failure('point', err),
                        { maximumAge: 0, timeout: 5000, enableHighAccuracy: false });
                    const newWatchId = geolocation.watchPosition(pos => success('watch', pos), err => failure('watch', err),
                        { maximumAge: 0, timeout: 10000, enableHighAccuracy: true });
                    if (generation !== currentGeneration) geolocation.clearWatch(newWatchId);
                    else watchId = newWatchId;
                },

                startTrackingIfPermitted: async () => {
                    const current = get();
                    if (current.isTracking && (current.locationStatus === 'searching' || current.locationStatus === 'available')) return;
                    if (current.permissionGranted) {
                        get().startTracking();
                        return;
                    }
                    // Safari n'expose pas la permission geolocation : 'unknown' signifie
                    // « attendre un geste utilisateur », jamais « demander maintenant ».
                    const queryGeneration = ++permissionQueryGeneration;
                    const permission = await queryGeolocationPermission();
                    if (permissionQueryGeneration !== queryGeneration) return;
                    if (permission === 'granted') {
                        set({ permissionGranted: true });
                        get().startTracking();
                    } else if (permission === 'denied') {
                        set({ permissionGranted: false, locationStatus: 'denied' });
                    }
                },

                stopTracking: () => {
                    permissionQueryGeneration++;
                    generation++;
                    set({ isTracking: false, hasSessionFix: false, locationStatus: 'idle', accuracy: null });
                    if (watchId !== null) {
                        trackingGeolocation?.clearWatch(watchId);
                        watchId = null;
                    }
                    trackingGeolocation = null;
                }
            };
        },
        {
            name: 'beercall-location-storage', // sauvegarde la dernière position connue dans le localStorage
            partialize: (state) => ({ userLocation: state.userLocation, acquiredAt: state.acquiredAt }),
            merge: (persisted, current) => {
                const cached = persisted as Partial<Pick<LocationState, 'userLocation' | 'acquiredAt'>> | undefined;
                return { ...current, userLocation: cached?.userLocation ?? null,
                    acquiredAt: typeof cached?.acquiredAt === 'number' ? cached.acquiredAt : null,
                    accuracy: null, hasSessionFix: false, locationStatus: 'idle', isTracking: false, error: null,
                    permissionGranted: false };
            },
        }
    )
);
