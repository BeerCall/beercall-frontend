import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface LocationState {
    userLocation: { lat: number; lng: number } | null;
    acquiredAt: number | null;
    hasSessionFix: boolean;
    locationStatus: 'idle' | 'searching' | 'available' | 'denied' | 'unavailable' | 'timeout' | 'unsupported';
    isTracking: boolean;
    error: string | null;
    startTracking: () => void;
    stopTracking: () => void;
}

export const useLocationStore = create<LocationState>()(
    persist(
        (set, get) => {
            let watchId: number | null = null;
            let generation = 0;
            let trackingGeolocation: Geolocation | null = null;

            return {
                userLocation: null,
                acquiredAt: null,
                hasSessionFix: false,
                locationStatus: 'idle',
                isTracking: false,
                error: null,

                startTracking: () => {
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
                    set({ hasSessionFix: false, locationStatus: 'searching', error: null });
                    const geolocation = navigator.geolocation;
                    if (!geolocation) {
                        set({ locationStatus: 'unsupported', isTracking: false, error: "Géolocalisation non supportée par votre navigateur." });
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
                        set({ userLocation: { lat: pos.coords.latitude, lng: pos.coords.longitude },
                            acquiredAt: pos.timestamp, hasSessionFix: true, locationStatus: 'available', error: null });
                    };
                    const failure = (source: 'watch' | 'point', err: GeolocationPositionError) => {
                        if (!canAccept(source)) return;
                        console.warn('Erreur de géolocalisation', err);
                        set({ error: err.message, hasSessionFix: false,
                            locationStatus: err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable' });
                    };
                    geolocation.getCurrentPosition(pos => success('point', pos), err => failure('point', err),
                        { maximumAge: 0, timeout: 5000, enableHighAccuracy: false });
                    const newWatchId = geolocation.watchPosition(pos => success('watch', pos), err => failure('watch', err),
                        { maximumAge: 0, timeout: 10000, enableHighAccuracy: true });
                    if (generation !== currentGeneration) geolocation.clearWatch(newWatchId);
                    else watchId = newWatchId;
                },

                stopTracking: () => {
                    generation++;
                    set({ isTracking: false, hasSessionFix: false, locationStatus: 'idle' });
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
                    hasSessionFix: false, locationStatus: 'idle', isTracking: false, error: null };
            },
        }
    )
);
