import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProfile } from './useProfile';
import { useSquadDetails } from './useSquadDetails';
import { usePushNotifications } from './usePushNotifications';
import { useSquadWebSocket } from './useSquadWebSocket';
import { useGameUIStore } from '../store/useGameUIStore';
import { useLocationStore } from '../store/useLocationStore';
import { toast } from '../store/useToastStore';
import type { MapRef } from 'react-map-gl/maplibre';
import type { BeerCall } from '../types/api';
import { useDashboardActive } from '../lib/dashboardActivity';

function gpsMessage(location: Pick<ReturnType<typeof useLocationStore.getState>, 'userLocation' | 'acquiredAt' | 'hasSessionFix' | 'locationStatus'>): string | null {
    if (location.hasSessionFix && location.locationStatus === 'available' && location.userLocation) return null;
    const messages = {
        idle: '', searching: 'Recherche de la position GPS…', available: '',
        denied: 'Autorise la localisation dans les réglages du navigateur',
        timeout: 'La recherche GPS a expiré. Réessaie.', unavailable: 'Position GPS indisponible. Réessaie.',
        unsupported: 'Localisation non supportée par ce navigateur.',
    };
    const status = messages[location.locationStatus] ?? '';
    const cache = location.userLocation ? `Position mémorisée — ${location.acquiredAt === null ? 'ancienneté inconnue' : new Date(location.acquiredAt).toLocaleString()}. ` : '';
    return `${status}${status && cache ? ' ' : ''}${cache}${cache || !status ? 'Une nouvelle position GPS est nécessaire pour créer.' : ''}`;
}

export const useDashboard = () => {
    const active = useDashboardActive();
    const { id } = useParams();
    const navigate = useNavigate();

    // États des Modales de gestion
    const [isSquadModalOpen, setIsSquadModalOpen] = useState(false);
    const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);

    // États de l'apéro
    const [selectedBeerCall, setSelectedBeerCall] = useState<BeerCall | null>(null);
    const [isWorldsModalOpen, setIsWorldsModalOpen] = useState<string | null>(null);
    const [scheduleCoordinates, setScheduleCoordinates] = useState<{ lat: number; lng: number } | null>(null);
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    const [isMapReady, setIsMapReady] = useState(false);

    const [isNightMode] = useState(() => {
        const currentHour = new Date().getHours();
        return currentHour >= 19 || currentHour < 6;
    });

    const { data: profile } = useProfile('me', active);
    const squadQuery = useSquadDetails(id, active);
    const squadDetails = squadQuery.data;
    const { isGameScreenOpen, currentAperoId, closeGameScreen } = useGameUIStore();
    const { userLocation, acquiredAt, hasSessionFix, locationStatus, startTracking, stopTracking } = useLocationStore();
    const canCreateFromLocation = hasSessionFix && locationStatus === 'available' && userLocation !== null;
    const locationMessage = gpsMessage({ userLocation, acquiredAt, hasSessionFix, locationStatus });
    const isActiveApero = squadDetails?.active_beer_call?.some((call: { id: string }) => call.id === isWorldsModalOpen);

    // Fermer l'écran de jeu quand on change de squad
    useEffect(() => {
        closeGameScreen();
    }, [id, closeGameScreen]);

    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [startingScheduledApero, setStartingScheduledApero] = useState<BeerCall | null>(null);
    const [photoLocation, setPhotoLocation] = useState<{ lat: number, lng: number } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const mapRef = useRef<MapRef>(null);
    const longPressTimer = useRef<number | null>(null);
    const longPressStart = useRef<{ x: number; y: number } | null>(null);
    const longPressSeq = useRef(0);
    const activeRef = useRef(active);
    const routeIdRef = useRef(id);
    const hasCentered = useRef(false);
    const [copied, setCopied] = useState(false);
    const [showPushBanner, setShowPushBanner] = useState(() => 'Notification' in window && Notification.permission === 'default');

    const { subscribeToNotifications } = usePushNotifications();

    // Init WebSocket
    const squadIdNumber = id ? parseInt(id, 10) : undefined;
    useSquadWebSocket(active ? squadIdNumber : undefined);

    const handleEnableNotifications = async () => {
        const success = await subscribeToNotifications();
        setShowPushBanner(false);
        if (success) {
            toast.success("Radar Activé ! 🍻", "Ton téléphone vibrera au prochain appel.");
        }
    };

    const cancelLongPress = useCallback(() => {
        longPressSeq.current += 1;
        if (longPressTimer.current) {
            window.clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
        longPressStart.current = null;
    }, []);

    // Toute frontière de route ou perte d'activité interrompt un maintien en cours,
    // et le démontage nettoie le timer restant.
    useEffect(() => {
        activeRef.current = active;
        routeIdRef.current = id;
        cancelLongPress();
        return () => {
            cancelLongPress();
        };
    }, [active, id, cancelLongPress]);

    const handleMapPointerMove = useCallback((event?: unknown) => {
        const ev = event as { originalEvent?: { touches?: unknown[] }, point?: { x: number, y: number } } | undefined;
        if (ev?.originalEvent?.touches && ev.originalEvent.touches.length > 1) {
            cancelLongPress();
            return;
        }

        if (ev && longPressStart.current && ev.point) {
            const dx = ev.point.x - longPressStart.current.x;
            const dy = ev.point.y - longPressStart.current.y;
            if (Math.hypot(dx, dy) > 12) {
                cancelLongPress();
            }
        }
    }, [cancelLongPress]);

    const handleMapPointerDown = useCallback((event: unknown) => {
        const ev = event as { originalEvent?: { target?: { closest?: (s: string) => boolean }, touches?: unknown[] }, point?: { x: number, y: number }, lngLat?: { toArray: () => [number, number] } };
        if (ev.originalEvent?.target?.closest?.('button, a, input, [role="button"]')) return;

        // Un nouvel appui remplace toujours le maintien précédent.
        cancelLongPress();

        if (ev.originalEvent?.touches && ev.originalEvent.touches.length > 1) {
            return;
        }

        // Copie immédiate : l'événement peut être réutilisé/muté par MapLibre avant le déclenchement.
        const coordinates = ev.lngLat ? ev.lngLat.toArray() : null;
        const pressSeq = longPressSeq.current;
        const pressRouteId = routeIdRef.current;

        longPressStart.current = {x: ev.point?.x || 0, y: ev.point?.y || 0};
        longPressTimer.current = window.setTimeout(() => {
            longPressTimer.current = null;
            longPressStart.current = null;
            if (pressSeq !== longPressSeq.current) return;
            if (!activeRef.current || routeIdRef.current !== pressRouteId) return;
            if (!coordinates) return;
            const [lng, lat] = coordinates;
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
            setScheduleCoordinates({lng, lat});
            setIsScheduleModalOpen(true);
        }, 700);
    }, [cancelLongPress]);

    // Toute preuve photo (création immédiate ou démarrage d'un apero programmé)
    // exige un fix live et utilise ses coordonnées, jamais celles du marqueur.
    const openCamera = useCallback((_location?: { lng: number; lat: number }, apero: BeerCall | null = null) => {
        const current = useLocationStore.getState();
        if (!current.hasSessionFix || current.locationStatus !== 'available' || !current.userLocation) {
            toast.error('GPS actuel nécessaire', gpsMessage(current) ?? 'Une nouvelle position GPS est nécessaire pour créer.');
            return;
        }
        setPhotoLocation(current.userLocation);
        setStartingScheduledApero(apero);
        if (fileInputRef.current) fileInputRef.current.click();
    }, []);

    const handlePhotoCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setPhotoFile(e.target.files[0]);
        }
        e.target.value = '';
    }, []);

    const focusOnLocation = useCallback((lng: number | string, lat: number | string) => {
        const numLng = Number(lng);
        const numLat = Number(lat);
        if (mapRef.current && !isNaN(numLng) && !isNaN(numLat)) {
            mapRef.current.flyTo({
                center: [numLng, numLat],
                zoom: 16,
                pitch: 60,
                duration: 1500,
                essential: true
            });
        }
    }, []);

    const handleManualRecenter = useCallback(() => {
        if (userLocation && mapRef.current) {
            mapRef.current.flyTo({
                center: [userLocation.lng, userLocation.lat],
                zoom: 16,
                pitch: 60,
                duration: 1000,
                essential: true
            });
            if (!hasSessionFix || locationStatus !== 'available') toast.error('Position mémorisée', gpsMessage({ userLocation, acquiredAt, hasSessionFix, locationStatus }) ?? undefined);
        } else if (!userLocation) {
            toast.error('Localisation GPS', gpsMessage({ userLocation, acquiredAt, hasSessionFix, locationStatus }) ?? undefined);
        }
    }, [userLocation, acquiredAt, hasSessionFix, locationStatus]);

    useEffect(() => {
        if (!active) {
            stopTracking();
            return;
        }
        // Acquisition au montage actif, sans attendre un clic arbitraire.
        startTracking();
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') startTracking();
            else stopTracking();
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            stopTracking();
            cancelLongPress();
        };
    }, [active, startTracking, stopTracking, cancelLongPress]);

    useEffect(() => {
        if (active && id && userLocation && mapRef.current && !hasCentered.current) {
            mapRef.current.jumpTo({
                center: [userLocation.lng, userLocation.lat],
                zoom: 14
            });
            hasCentered.current = true;
        }
    }, [active, userLocation, id]);

    const handleMapLoaded = useCallback(() => {
        setIsMapReady(true);
    }, []);

    const handleBeerCallClick = useCallback((beerCall: BeerCall) => {
        if (beerCall.has_responded && beerCall.id) {
            setIsWorldsModalOpen(beerCall.id);
        } else {
            setSelectedBeerCall(beerCall);
        }
    }, []);

    const handleCopyCode = () => {
        if (squadDetails?.invite_code) {
            navigator.clipboard.writeText(squadDetails.invite_code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return {
        active,
        id,
        navigate,
        profile,
        squadDetails,
        isSquadPending: squadQuery.isPending,
        isSquadFetching: squadQuery.isFetching,
        isSquadError: squadQuery.isError,
        squadError: squadQuery.error,
        refetchSquad: squadQuery.refetch,
        isActiveApero,
        isGameScreenOpen,
        currentAperoId,
        userLocation,
        acquiredAt,
        hasSessionFix,
        locationStatus,
        canCreateFromLocation,
        locationMessage,
        isNightMode,
        isMapReady,
        handleMapLoaded,
        copied,
        showPushBanner,
        handleEnableNotifications,
        isSquadModalOpen,
        setIsSquadModalOpen,
        isJoinModalOpen,
        setIsJoinModalOpen,
        selectedBeerCall,
        setSelectedBeerCall,
        isWorldsModalOpen,
        setIsWorldsModalOpen,
        scheduleCoordinates,
        isScheduleModalOpen,
        setIsScheduleModalOpen,
        photoFile,
        setPhotoFile,
        photoLocation,
        setPhotoLocation,
        startingScheduledApero,
        setStartingScheduledApero,
        fileInputRef,
        mapRef,
        handleMapPointerDown,
        cancelLongPress,
        handleMapPointerMove,
        openCamera,
        handlePhotoCapture,
        focusOnLocation,
        handleManualRecenter,
        handleBeerCallClick,
        handleCopyCode
    };
};
