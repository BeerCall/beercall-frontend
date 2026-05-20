import {useEffect} from 'react';
import {getToken} from 'firebase/messaging';
import {messaging} from '../lib/firebase';
import {api} from '../lib/api';
import {useUserStore} from '../store/useUserStore';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export function usePushNotifications() {
    // On écoute l'état de connexion de l'utilisateur
    const isAuthenticated = useUserStore((state) => state.isAuthenticated);

    // Fonction utilitaire centralisée pour récupérer/mettre à jour le token
    const syncToken = async () => {
        if (!messaging) return false;

        try {
            // 1. On récupère le SEUL Service Worker de l'app (celui géré par VitePWA via injectManifest)
            const registration = await navigator.serviceWorker.ready;

            // 2. On demande le token à Firebase en le forçant à utiliser ce Service Worker
            const currentToken = await getToken(messaging, {
                vapidKey: VAPID_KEY,
                serviceWorkerRegistration: registration
            });

            if (currentToken) {
                // 3. On envoie le token valide au backend
                await api.put('/auth/push-token/', {token: currentToken});
                return true;
            }
            return false;
        } catch (error) {
            console.error("Erreur FCM lors de la récupération du token :", error);
            return false;
        }
    };

    // 1️⃣ L'ACTION MANUELLE (Au clic sur le bouton de demande d'autorisation)
    const subscribeToNotifications = async () => {
        try {
            const permission = await Notification.requestPermission();

            if (permission === 'granted') {
                return await syncToken();
            }
            return false;
        } catch (error) {
            console.error("Erreur lors de la demande de permission :", error);
            return false;
        }
    };

    // 2️⃣ LA RESTAURATION SILENCIEUSE (À l'ouverture / reconnexion)
    useEffect(() => {
        if (!isAuthenticated || !messaging) return;

        // Si l'OS nous dit que l'utilisateur a DÉJÀ accepté les notifs dans le passé
        if (Notification.permission === 'granted') {
            // On lance la synchronisation (qui utilisera navigator.serviceWorker.ready)
            syncToken();
        }
    }, [isAuthenticated]); // Se déclenche quand le joueur se loggue

    return {subscribeToNotifications};
}