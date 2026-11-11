// 1. Importation de l'outil de cache de Workbox (fourni par vite-plugin-pwa)
import {precacheAndRoute} from 'workbox-precaching';

// NOUVEAU : Imports ES Modules pour Firebase (spécifique au Service Worker)
import { initializeApp } from 'firebase/app';
import { getMessaging } from 'firebase/messaging/sw';

// 2. On exécute la mise en cache de tes fichiers compilés
precacheAndRoute(self.__WB_MANIFEST || []);

// 3. Mise à jour sûre : plus de `skipWaiting()`.
// Un nouveau service worker s'installe et attend que toutes les pages soient
// fermées avant de s'activer. Sans cela, son activation supprime les anciens
// chunks hachés pendant qu'une page ouverte peut encore les demander : c'est
// exactement le scénario d'écran blanc après rebuild.
// `clients.claim()` reste sans danger : il ne s'applique qu'après activation,
// donc quand plus aucune ancienne page ne tourne.
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Le bandeau « Nouvelle version disponible » demande explicitement l'activation.
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        event.waitUntil(self.skipWaiting());
    }
});

// 4. Même configuration optionnelle que l'application, injectée au build.
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialisation moderne de l'app et du messaging
if (firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId && firebaseConfig.messagingSenderId) {
    const app = initializeApp(firebaseConfig);
    getMessaging(app);
}
