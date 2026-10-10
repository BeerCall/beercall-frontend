// 1. Importation de l'outil de cache de Workbox (fourni par vite-plugin-pwa)
import {precacheAndRoute} from 'workbox-precaching';

// NOUVEAU : Imports ES Modules pour Firebase (spécifique au Service Worker)
import { initializeApp } from 'firebase/app';
import { getMessaging } from 'firebase/messaging/sw';

// 2. On exécute la mise en cache de tes fichiers compilés
precacheAndRoute(self.__WB_MANIFEST || []);

// 🔥 3. LA MAGIE ANTI-CACHE : On force l'iPhone à tuer l'ancienne version
self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
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
