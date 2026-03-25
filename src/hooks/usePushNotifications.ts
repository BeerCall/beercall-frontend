import {useEffect} from 'react';
import {getToken} from 'firebase/messaging';
import {messaging} from '../lib/firebase';
import {api} from '../lib/api';
import {useUserStore} from '../store/useUserStore';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export function usePushNotifications() {
    // On écoute l'état de connexion de l'utilisateur
    const isAuthenticated = useUserStore((state) => state.isAuthenticated);

    // 1️⃣ L'ACTION MANUELLE (Au clic sur le bouton)
    const subscribeToNotifications = async () => {
        if (!messaging) return false;

        try {
            const permission = await Notification.requestPermission();

            if (permission === 'granted') {
                const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
                const currentToken = await getToken(messaging, {
                    vapidKey: VAPID_KEY,
                    serviceWorkerRegistration: registration
                });

                if (currentToken) {
                    await api.put('/auth/push-token/', {token: currentToken});
                    console.log("🍻 Token FCM enregistré avec succès !");
                    return true;
                }
            }
            return false;
        } catch (error) {
            console.error("Erreur FCM :", error);
            return false;
        }
    };

    useEffect(() => {
        if (!isAuthenticated || !messaging) return;

        const restoreSubscription = async () => {
            if (Notification.permission === 'granted') {
                try {
                    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

                    if (messaging) {
                        const currentToken = await getToken(messaging, {
                            vapidKey: VAPID_KEY,
                            serviceWorkerRegistration: registration
                        });

                        if (currentToken) {
                            await api.put('/auth/push-token/', {token: currentToken});
                            console.log("🔄 Token FCM restauré silencieusement (Retour de l'utilisateur) !");
                        }
                    }
                } catch (error) {
                    console.error("Erreur lors de la restauration FCM :", error);
                }
            }
        };

        restoreSubscription();
    }, [isAuthenticated]); // Se déclenche à chaque fois que le joueur se log

    return {subscribeToNotifications};
}