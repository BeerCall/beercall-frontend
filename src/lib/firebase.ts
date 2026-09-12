import {initializeApp} from 'firebase/app';
import {getMessaging} from 'firebase/messaging';
import {getDatabase, ref} from 'firebase/database';

// Récupère ces valeurs dans Console Firebase > Paramètres > Général > Tes applications (Web)
const firebaseConfig = {
    apiKey: "AIzaSyDFbNca0hG9vVpbT0PidxT_Qs0hJuXhXTw",
    authDomain: "beercall-7be4e.firebaseapp.com",
    projectId: "beercall-7be4e",
    storageBucket: "beercall-7be4e.firebasestorage.app",
    messagingSenderId: "983909265712",
    appId: "1:983909265712:web:d9f7a5101f9cad43e818f5",
    databaseURL: "https://beercall-7be4e-default-rtdb.europe-west1.firebasedatabase.app"
};

// Initialisation de l'application Firebase
const app = initializeApp(firebaseConfig);

// On exporte l'instance messaging.
// Sécurité : On vérifie que le navigateur supporte bien les Service Workers avant de l'initialiser
export const messaging = typeof window !== 'undefined' && 'serviceWorker' in navigator
    ? getMessaging(app)
    : null;

// 📡 REALTIME DATABASE (pour le chat)
// Initialisée côté navigateur avec l'URL explicite pour éviter tout problème de résolution
export const db = typeof window !== 'undefined'
    ? getDatabase(app, firebaseConfig.databaseURL)
    : null;

// 🪣 Référence de la collection de messages d'un squad
// Chemin : squads/{squadId}/messages
export const squadChatRef = (squadId: string) => ref(db!, `squads/${squadId}/messages`);

// 🍻 Référence de la collection de messages dédiée à un apéro
// Chemin : squads/{squadId}/beer-calls/{beerCallId}/messages
export const beerCallChatRef = (squadId: string, beerCallId: string) =>
    ref(db!, `squads/${squadId}/beer-calls/${beerCallId}/messages`);