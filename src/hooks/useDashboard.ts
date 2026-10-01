import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProfile } from './useProfile';
import { useSquadDetails } from './useSquadDetails';
import { useSquadWebSocket } from './useSquadWebSocket';
import { usePushNotifications } from './usePushNotifications';
import { useGameUIStore } from '../store/useGameUIStore';
import { useLocationStore } from '../store/useLocationStore';
import { toast } from '../store/useToastStore';
import { type MapRef } from 'react-map-gl/maplibre';

export const useDashboard = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    // États des Modales de gestion
    const [isSquadModalOpen, setIsSquadModalOpen] = useState(false);
    const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);

    // États de l'apéro
    const [selectedBeerCall, setSelectedBeerCall] = useState<any | null>(null);
    const [isWorldsModalOpen, setIsWorldsModalOpen] = useState<string | null>(null);
    const [scheduleCoordinates, setScheduleCoordinates] = useState<{ lat: number; lng: number } | null>(null);
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    const [isMapReady, setIsMapReady] = useState(false);

    const [isNightMode, setIsNightMode] = useState(false);

    const { data: profile } = useProfile();
    const { data: squadDetails } = useSquadDetails(id);
    useSquadWebSocket(id ? Number(id) : null);
    const { isGameScreenOpen, currentAperoId, closeGameScreen } = useGameUIStore();
    const { userLocation, startTracking, stopTracking } = useLocationStore();
    const isActiveApero = squadDetails?.active_beer_call?.some((call: any) => call.id === isWorldsModalOpen);

    // Fermer l'écran de jeu quand on change de squad
    useEffect(() => {
        if (isGameScreenOpen) {
            closeGameScreen();
        }
    }, [id, isGameScreenOpen, closeGameScreen]);

    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [startingScheduledApero, setStartingScheduledApero] = useState<any>(null);
    const [photoLocation, setPhotoLocation] = useState<{ lat: number, lng: number } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const mapRef = useRef<MapRef>(null);
    const longPressTimer = useRef<number | null>(null);
    const longPressStart = useRef<{ x: number; y: number } | null>(null);
    const hasCentered = useRef(false);
    const [copied, setCopied] = useState(false);
    const [showPushBanner, setShowPushBanner] = useState(false);

    const { subscribeToNotifications } = usePushNotifications();

    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            setShowPushBanner(true);
        }
    }, []);

    const handleEnableNotifications = async () => {
        const success = await subscribeToNotifications();
        setShowPushBanner(false);
        if (success) {
            toast.success("Radar Activé ! 🍻", "Ton téléphone vibrera au prochain appel.");
        }
    };

    const handleMapPointerDown = (event: any) => {
        if (event.originalEvent?.target?.closest?.('button, a, input, [role="button"]')) return;
        
        if (event.originalEvent?.touches && event.originalEvent.touches.length > 1) {
            cancelLongPress();
            return;
        }

        if (longPressTimer.current) window.clearTimeout(longPressTimer.current);

        longPressStart.current = {x: event.point?.x || 0, y: event.point?.y || 0};
        longPressTimer.current = window.setTimeout(() => {
            const [lng, lat] = event.lngLat.toArray();
            setScheduleCoordinates({lng, lat});
            setIsScheduleModalOpen(true);
        }, 700);
    };

    const cancelLongPress = (event?: any) => {
        if (event?.originalEvent?.touches && event.originalEvent.touches.length > 1) {
            if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
            return;
        }

        if (event && longPressStart.current && event.point) {
            const dx = event.point.x - longPressStart.current.x;
            const dy = event.point.y - longPressStart.current.y;
            if (Math.hypot(dx, dy) > 12) {
                if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
            }
        } else {
            if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const openCamera = (location = userLocation, apero: any = null) => {
        setPhotoLocation(location);
        setStartingScheduledApero(apero);
        if (fileInputRef.current) fileInputRef.current.click();
    };

    const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setPhotoFile(e.target.files[0]);
        }
        e.target.value = '';
    };

    const focusOnLocation = (lng: any, lat: any) => {
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
    };

    const handleManualRecenter = () => {
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
    };

    useEffect(() => {
        const currentHour = new Date().getHours();
        setIsNightMode(currentHour >= 19 || currentHour < 6);
    }, []);

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

    const handleBeerCallClick = (beerCall: any) => {
        if (beerCall.has_responded) {
            setIsWorldsModalOpen(beerCall.id);
        } else {
            setSelectedBeerCall(beerCall);
        }
    };

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
