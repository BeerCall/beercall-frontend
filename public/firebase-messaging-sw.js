importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyDFbNca0hG9vVpbT0PidxT_Qs0hJuXhXTw",
    authDomain: "beercall-7be4e.firebaseapp.com",
    projectId: "beercall-7be4e",
    storageBucket: "beercall-7be4e.firebasestorage.app",
    messagingSenderId: "983909265712",
    appId: "1:983909265712:web:d9f7a5101f9cad43e818f5"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();
