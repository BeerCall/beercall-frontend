import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import {VitePWA} from 'vite-plugin-pwa'

export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        basicSsl(), // 🔒 Parfait pour tester la PWA sur ton tel en HTTPS !
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
            manifest: {
                name: 'BeerCall',
                short_name: 'BeerCall',
                description: 'Ne rate plus aucun apéro avec ta Squad !',
                theme_color: '#f8fafc',
                background_color: '#f8fafc',
                display: 'standalone',
                orientation: 'portrait',
                icons: [
                    {
                        src: '/pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: '/pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any maskable'
                    }
                ]
            }
        })
    ],
    server: {
        host: true,
        proxy: {
            // Ton proxy pour les requêtes backend
            '/api': {
                target: 'http://127.0.0.1:8000',
                changeOrigin: true,
                secure: false, // Nécessaire car target est en http mais ton dev server est en https (basicSsl)
            },
            // Ton proxy pour les modèles 3D
            '/models': {
                target: 'http://127.0.0.1:8000',
                changeOrigin: true,
                secure: false,
            }
        }
    }
})