import {defineConfig, type Plugin} from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import {VitePWA} from 'vite-plugin-pwa'

/**
 * 8h-4b-1 — Le panneau de parcours n'entre dans le graphe que si
 * `VITE_WORLD_PROBE=1`. Sans cette variable, le module virtuel ne contient
 * qu'un `null` : aucun chunk, aucune chaîne du panneau dans le build standard.
 */
function worldProbePlugin(enabled: boolean): Plugin {
    const virtualId = 'virtual:world-probe';
    const resolvedId = `\0${virtualId}`;
    return {
        name: 'beercall-world-probe',
        resolveId(id) {
            if (id === virtualId) return resolvedId;
            return null;
        },
        load(id) {
            if (id !== resolvedId) return null;
            return enabled
                ? "import {lazy} from 'react';\nexport const WorldProbePanel = lazy(() => import('/src/perf/WorldProbePanel.tsx'));\nexport const WorldPreparationBadge = lazy(() => import('/src/perf/WorldPreparationBadge.tsx'));\n"
                : "export const WorldProbePanel = null;\nexport const WorldPreparationBadge = null;\n";
        },
    };
}

/**
 * Panneau de diagnostic de fluidité : même principe, activé uniquement par
 * `VITE_FF_PERF_PANEL=1`. Sans cette variable, aucun chunk n'est produit.
 */
function perfPanelPlugin(enabled: boolean): Plugin {
    const virtualId = 'virtual:perf-panel';
    const resolvedId = `\0${virtualId}`;
    return {
        name: 'beercall-perf-panel',
        resolveId(id) {
            if (id === virtualId) return resolvedId;
            return null;
        },
        load(id) {
            if (id !== resolvedId) return null;
            return enabled
                ? "import {lazy} from 'react';\nexport const PerformancePanel = lazy(() => import('/src/components/UI/PerformancePanel.tsx'));\n"
                : "export const PerformancePanel = null;\n";
        },
    };
}

export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        worldProbePlugin(process.env.VITE_WORLD_PROBE === '1'),
        perfPanelPlugin(process.env.VITE_FF_PERF_PANEL === '1'),
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
