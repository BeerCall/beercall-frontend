import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import {VitePWA} from 'vite-plugin-pwa'

export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        VitePWA({
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'firebase-messaging-sw.js',
            manifestFilename: 'manifest.webmanifest',
            registerType: 'autoUpdate',
            devOptions: {
                enabled: true,
                type: 'module'
            },
            injectManifest: {
                globIgnores: ['**/node_modules/**/*', '**/animations/**', 'animations/**'],
            },
            includeAssets: [
                'favicon.svg',
                'apple-touch-icon.svg',
                'apple-touch-icon-180.png',
                'pwa-192x192.png',
                'pwa-512x512.png',
            ],
            manifest: {
                name: 'BeerCall',
                short_name: 'BeerCall',
                description: 'Ne rate plus aucun apéro avec ta Squad !',
                start_url: '/',
                scope: '/',
                theme_color: '#0F081C',
                background_color: '#0F081C',
                display: 'standalone',
                orientation: 'portrait',
                icons: [
                    {
                        src: '/pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'any'
                    },
                    {
                        src: '/pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'maskable'
                    },
                    {
                        src: '/pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any'
                    },
                    {
                        src: '/pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable'
                    }
                ]
            }
        })
    ],
    server: {
        host: true,
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:8000',
                ws: true,
                changeOrigin: true,
                secure: false,
            },
            '/models': {
                target: 'http://127.0.0.1:8000',
                changeOrigin: true,
                secure: false,
            },
            '/uploads': {
                target: 'http://127.0.0.1:8000',
                changeOrigin: true,
                secure: false,
            }
        }
    }
})
