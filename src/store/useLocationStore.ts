import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface LocationState {
    userLocation: { lat: number; lng: number } | null;
    isTracking: boolean;
    error: string | null;
    startTracking: () => void;
    stopTracking: () => void;
}

export const useLocationStore = create<LocationState>()(
    persist(
        (set, get) => {
            let watchId: number | null = null;

            return {
                userLocation: null,
                isTracking: false,
                error: null,

                startTracking: () => {
                    if (get().isTracking) return;

                    if (!navigator.geolocation) {
                        set({ error: "Géolocalisation non supportée par votre navigateur." });
                        return;
                    }

                    // Tenter d'avoir une position très rapidement d'abord
                    navigator.geolocation.getCurrentPosition(
                        (pos) => {
                            set({
                                userLocation: { lat: pos.coords.latitude, lng: pos.coords.longitude },
                                error: null
                            });
                        },
                        (err) => console.warn("Erreur rapide de géoloc", err),
                        { maximumAge: 60000, timeout: 5000, enableHighAccuracy: false }
                    );

                    // Puis démarrer le tracking précis
                    watchId = navigator.geolocation.watchPosition(
                        (pos) => {
                            set({
                                userLocation: { lat: pos.coords.latitude, lng: pos.coords.longitude },
                                error: null
                            });
                        },
                        (err) => {
                            console.warn("Erreur géoloc (ignorée):", err);
                            set({ error: err.message });
                        },
                        {
                            enableHighAccuracy: true,
                            maximumAge: 10000,
                            timeout: 10000
                        }
                    );

                    set({ isTracking: true });
                },

                stopTracking: () => {
                    if (watchId !== null) {
                        navigator.geolocation.clearWatch(watchId);
                        watchId = null;
                    }
                    set({ isTracking: false });
                }
            };
        },
        {
            name: 'beercall-location-storage', // sauvegarde la dernière position connue dans le localStorage
            partialize: (state) => ({ userLocation: state.userLocation }), // Ne persister que userLocation
        }
    )
);