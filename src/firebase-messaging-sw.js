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

// 4. Ta configuration Firebase d'origine
const firebaseConfig = {
    apiKey: "AIzaSyDFbNca0hG9vVpbT0PidxT_Qs0hJuXhXTw",
    authDomain: "beercall-7be4e.firebaseapp.com",
    projectId: "beercall-7be4e",
    storageBucket: "beercall-7be4e.firebasestorage.app",
    messagingSenderId: "983909265712",
    appId: "1:983909265712:web:d9f7a5101f9cad43e818f5"
};

// Initialisation moderne de l'app et du messaging
const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);