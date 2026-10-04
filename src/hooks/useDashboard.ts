import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProfile } from './useProfile';
import { useSquadDetails } from './useSquadDetails';
import { usePushNotifications } from './usePushNotifications';
import { useGameUIStore } from '../store/useGameUIStore';
import { useLocationStore } from '../store/useLocationStore';
import { toast } from '../store/useToastStore';
import type { MapRef } from 'react-map-gl/maplibre';
import type { BeerCall } from '../types/dashboard';

export const useDashboard = () => {
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

    const { data: profile } = useProfile();
    const { data: squadDetails } = useSquadDetails(id);
    // TODO(REV-04): The useSquadWebSocket hook was just a no-op placeholder masking the absence
    // of a real WebSocket implementation. It has been removed. A proper WS hook should be
    // implemented when real-time features are actually supported by the backend and frontend.
    const { isGameScreenOpen, currentAperoId, closeGameScreen } = useGameUIStore();
    const { userLocation, startTracking, stopTracking } = useLocationStore();
    const isActiveApero = squadDetails?.active_beer_call?.some((call: { id: string }) => call.id === isWorldsModalOpen);

    // Fermer l'écran de jeu quand on change de squad
    useEffect(() => {
        if (isGameScreenOpen) {
            closeGameScreen();
        }
    }, [id, isGameScreenOpen, closeGameScreen]);

    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [startingScheduledApero, setStartingScheduledApero] = useState<BeerCall | null>(null);
    const [photoLocation, setPhotoLocation] = useState<{ lat: number, lng: number } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const mapRef = useRef<MapRef>(null);
    const longPressTimer = useRef<number | null>(null);
    const longPressStart = useRef<{ x: number; y: number } | null>(null);
    const hasCentered = useRef(false);
    const [copied, setCopied] = useState(false);
    const [showPushBanner, setShowPushBanner] = useState(() => 'Notification' in window && Notification.permission === 'default');

    const { subscribeToNotifications } = usePushNotifications();

    const handleEnableNotifications = async () => {
        const success = await subscribeToNotifications();
        setShowPushBanner(false);
        if (success) {
            toast.success("Radar Activé ! 🍻", "Ton téléphone vibrera au prochain appel.");
        }
    };

    const cancelLongPress = useCallback((event?: unknown) => {
        const ev = event as { originalEvent?: { touches?: unknown[] }, point?: { x: number, y: number } } | undefined;
        if (ev?.originalEvent?.touches && ev.originalEvent.touches.length > 1) {
            if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
            return;
        }

        if (ev && longPressStart.current && ev.point) {
            const dx = ev.point.x - longPressStart.current.x;
            const dy = ev.point.y - longPressStart.current.y;
            if (Math.hypot(dx, dy) > 12) {
                if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
            }
        } else {
            if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    }, []);

    const handleMapPointerDown = useCallback((event: unknown) => {
        const ev = event as { originalEvent?: { target?: { closest?: (s: string) => boolean }, touches?: unknown[] }, point?: { x: number, y: number }, lngLat?: { toArray: () => [number, number] } };
        if (ev.originalEvent?.target?.closest?.('button, a, input, [role="button"]')) return;
        
        if (ev.originalEvent?.touches && ev.originalEvent.touches.length > 1) {
            cancelLongPress();
            return;
        }

        if (longPressTimer.current) window.clearTimeout(longPressTimer.current);

        longPressStart.current = {x: ev.point?.x || 0, y: ev.point?.y || 0};
        longPressTimer.current = window.setTimeout(() => {
            if (ev.lngLat) {
                const [lng, lat] = ev.lngLat.toArray();
                setScheduleCoordinates({lng, lat});
                setIsScheduleModalOpen(true);
            }
        }, 700);
    }, [cancelLongPress]);

    const openCamera = useCallback((location = userLocation, apero: BeerCall | null = null) => {
        setPhotoLocation(location);
        setStartingScheduledApero(apero);
        if (fileInputRef.current) fileInputRef.current.click();
    }, [userLocation]);

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
        } else if (!userLocation) {
            toast.error("Recherche en cours 🛰️", "Le GPS cherche encore votre position... 📡");
        }
    }, [userLocation]);

    useEffect(() => {
        const handleFirstInteraction = () => {
            startTracking();
            window.removeEventListener('click', handleFirstInteraction);
            window.removeEventListener('touchstart', handleFirstInteraction);
        };
        
        window.addEventListener('click', handleFirstInteraction);
        window.addEventListener('touchstart', handleFirstInteraction);

        return () => {
            window.removeEventListener('click', handleFirstInteraction);
            window.removeEventListener('touchstart', handleFirstInteraction);
            stopTracking();
        };
    }, [startTracking, stopTracking]);

    useEffect(() => {
        if (id && userLocation && mapRef.current && !hasCentered.current) {
            mapRef.current.jumpTo({
                center: [userLocation.lng, userLocation.lat],
                zoom: 14
            });
            hasCentered.current = true;
        }
    }, [userLocation, id]);

    useEffect(() => {
        const timer = setTimeout(() => setIsMapReady(true), 500);
        return () => clearTimeout(timer);
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
        id,
        navigate,
        profile,
        squadDetails,
        isActiveApero,
        isGameScreenOpen,
        currentAperoId,
        userLocation,
        isNightMode,
        isMapReady,
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
        openCamera,
        handlePhotoCapture,
        focusOnLocation,
        handleManualRecenter,
        handleBeerCallClick,
        handleCopyCode
    };
};
