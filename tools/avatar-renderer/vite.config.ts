import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    root: HERE,
    publicDir: false,
    build: {
        outDir: path.resolve(HERE, '../../.renderer-dist'),
        emptyOutDir: true,
        rollupOptions: {
            input: path.resolve(HERE, 'render.html'),
        },
    },
    server: {
        fs: { strict: true },
    },
});
