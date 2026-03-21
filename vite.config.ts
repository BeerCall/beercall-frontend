import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        basicSsl()
    ],
    server: {
        host: true,
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:8000',
                changeOrigin: true,
                secure: false,
            },
            '/models': {
                target: 'http://127.0.0.1:8000', // Remplace par l'IP/Port de ton backend
                changeOrigin: true,
            }
        }
    }
})