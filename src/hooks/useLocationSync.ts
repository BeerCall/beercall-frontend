import {useEffect, useRef} from 'react';
import {useMutation} from '@tanstack/react-query';
import {api} from '../lib/api';
import {useLocationStore} from '../store/useLocationStore';
import {useUserStore} from '../store/useUserStore';
import {useDocumentVisible} from './useDocumentVisible';

/** B04b — synchro de la position courante, décision pure et testable. */
export const EARTH_RADIUS_M = 6_371_000;
export const LOCATION_MIN_INTERVAL_MS = 60_000;
export const LOCATION_MIN_DISTANCE_M = 50;
export const LOCATION_HEARTBEAT_MS = 300_000;
export const LOCATION_MAX_ACCURACY_M = 500;
export const LOCATION_RETRY_BACKOFF_MS = 60_000;
const TICK_MS = 15_000;

export interface LocationPoint {
    lat: number;
    lng: number;
}

export function haversineMeters(a: LocationPoint, b: LocationPoint): number {
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2
        + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface LocationSyncSnapshot {
    visible: boolean;
    hasSessionFix: boolean;
    status: string;
    lat: number | null;
    lng: number | null;
    accuracy: number | null;
    now: number;
    lastSuccessAt: number | null;
    lastSent: LocationPoint | null;
    /** Vrai au premier tick qui suit un retour de visibilité. */
    resumed?: boolean;
}

/**
 * Décision d'envoi :
 * - jamais depuis le cache seul, hors `available`, coordonnées non finies ou
 *   précision > 500 m ;
 * - premier fix valide immédiatement ;
 * - ensuite >= 60 s ET >= 50 m ;
 * - heartbeat 5 min quand la page est visible ;
 * - retour de visibilité après > 60 s.
 */
export function shouldSendLocation(snapshot: LocationSyncSnapshot): boolean {
    if (!snapshot.visible) return false;
    if (!snapshot.hasSessionFix || snapshot.status !== 'available') return false;
    if (snapshot.lat === null || snapshot.lng === null) return false;
    if (!Number.isFinite(snapshot.lat) || !Number.isFinite(snapshot.lng)) return false;
    if (snapshot.accuracy !== null
        && (!Number.isFinite(snapshot.accuracy) || snapshot.accuracy < 0 || snapshot.accuracy > LOCATION_MAX_ACCURACY_M)) {
        return false;
    }
    if (snapshot.lastSuccessAt === null) return true;

    const elapsed = snapshot.now - snapshot.lastSuccessAt;
    if (snapshot.resumed && elapsed >= LOCATION_MIN_INTERVAL_MS) return true;
    if (elapsed >= LOCATION_HEARTBEAT_MS) return true;
    if (elapsed < LOCATION_MIN_INTERVAL_MS) return false;
    if (snapshot.lastSent) {
        const distance = haversineMeters(snapshot.lastSent, {lat: snapshot.lat, lng: snapshot.lng});
        if (distance < LOCATION_MIN_DISTANCE_M) return false;
    }
    return true;
}

interface LocationPayload {
    latitude: number;
    longitude: number;
    accuracy: number | null;
}

/**
 * Envoie la position de la session au backend. L'acquisition GPS reste la
 * responsabilité du Dashboard : ce hook ne demande jamais la permission.
 */
export function useLocationSync(enabled = true) {
    const visible = useDocumentVisible();
    const username = useUserStore((state) => state.username);
    const userLocation = useLocationStore((state) => state.userLocation);
    const accuracy = useLocationStore((state) => state.accuracy);
    const hasSessionFix = useLocationStore((state) => state.hasSessionFix);
    const locationStatus = useLocationStore((state) => state.locationStatus);

    const lastSuccessAt = useRef<number | null>(null);
    const lastSent = useRef<LocationPoint | null>(null);
    const inFlight = useRef(false);
    const generation = useRef(0);
    const wasVisible = useRef(false);
    const resumed = useRef(false);
    const blockedUntil = useRef(0);

    const {mutate} = useMutation({
        mutationFn: async (payload: LocationPayload) => {
            const response = await api.put('/auth/location/', payload);
            return response.data;
        },
        retry: 1,
        retryDelay: 2_000,
    });

    // Changement de compte et démontage : toute réponse en vol devient obsolète.
    useEffect(() => {
        generation.current += 1;
        lastSuccessAt.current = null;
        lastSent.current = null;
        inFlight.current = false;
        blockedUntil.current = 0;
        return () => {
            generation.current += 1;
        };
    }, [username]);

    // Retour de visibilité, consommé par le prochain tick.
    useEffect(() => {
        if (visible) {
            if (!wasVisible.current) resumed.current = true;
            wasVisible.current = true;
        } else {
            wasVisible.current = false;
        }
    }, [visible]);

    useEffect(() => {
        if (!enabled || !visible) return;

        const attempt = () => {
            const now = Date.now();
            const lat = userLocation?.lat ?? null;
            const lng = userLocation?.lng ?? null;
            const canSend = shouldSendLocation({
                visible,
                hasSessionFix,
                status: locationStatus,
                lat,
                lng,
                accuracy,
                now,
                lastSuccessAt: lastSuccessAt.current,
                lastSent: lastSent.current,
                resumed: resumed.current,
            });
            if (!canSend || inFlight.current || now < blockedUntil.current) return;
            if (lat === null || lng === null) return;

            resumed.current = false;
            inFlight.current = true;
            const currentGeneration = generation.current;
            const sent = {lat, lng};

            mutate({latitude: lat, longitude: lng, accuracy}, {
                onSuccess: () => {
                    if (generation.current !== currentGeneration) return;
                    lastSuccessAt.current = Date.now();
                    lastSent.current = sent;
                },
                onError: () => {
                    if (generation.current !== currentGeneration) return;
                    blockedUntil.current = Date.now() + LOCATION_RETRY_BACKOFF_MS;
                },
                onSettled: () => {
                    if (generation.current === currentGeneration) inFlight.current = false;
                },
            });
        };

        attempt();
        const timer = setInterval(attempt, TICK_MS);
        return () => clearInterval(timer);
    }, [enabled, visible, username, userLocation, accuracy, hasSessionFix, locationStatus, mutate]);
}
