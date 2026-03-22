import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate', // Met à jour l'appli en arrière-plan chez tes potes
            includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
            manifest: {
                name: 'BeerCall',
                short_name: 'BeerCall',
                description: 'Ne rate plus aucun apéro avec ta Squad !',
                theme_color: '#f8fafc', // Correspond au bg de ton app
                background_color: '#f8fafc',
                display: 'standalone', // Cache le navigateur (UI 100% Native)
                orientation: 'portrait', // Bloque la rotation
                icons: [
                    {
                        src: '/pwa-192x192.svg',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: '/pwa-512x512.svg',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any maskable' // Android pourra arrondir le logo proprement
                    }
                ]
            }
        })
    ],
    server: {
        host: true,
    }
});