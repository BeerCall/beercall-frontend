import {initializeApp} from 'firebase/app';
import {getMessaging} from 'firebase/messaging';
import {getDatabase, ref} from 'firebase/database';

// Récupère ces valeurs dans Console Firebase > Paramètres > Général > Tes applications (Web)
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL
};

// Firebase est facultatif : une configuration absente/partielle ne doit pas
// empêcher les parcours REST/WebSocket de démarrer.
const app = firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
    ? initializeApp(firebaseConfig)
    : null;

// On exporte l'instance messaging.
// Sécurité : On vérifie que le navigateur supporte bien les Service Workers avant de l'initialiser
export const messaging = app && firebaseConfig.messagingSenderId && typeof window !== 'undefined' && 'serviceWorker' in navigator
    ? getMessaging(app)
    : null;

// 📡 REALTIME DATABASE (pour le chat)
// Initialisée côté navigateur avec l'URL explicite pour éviter tout problème de résolution
export const db = app && firebaseConfig.databaseURL && typeof window !== 'undefined'
    ? getDatabase(app, firebaseConfig.databaseURL)
    : null;

// 🪣 Référence de la collection de messages d'un squad
// Chemin : squads/{squadId}/messages
export const squadChatRef = (squadId: string) => {
    if (!db) throw new Error('Le chat est indisponible : Firebase n’est pas configuré.');
    return ref(db, `squads/${squadId}/messages`);
};

// 🍻 Référence de la collection de messages dédiée à un apéro
// Chemin : squads/{squadId}/beer-calls/{beerCallId}/messages
export const beerCallChatRef = (squadId: string, beerCallId: string) => {
    if (!db) throw new Error('Le chat est indisponible : Firebase n’est pas configuré.');
    return ref(db, `squads/${squadId}/beer-calls/${beerCallId}/messages`);
};
