import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';

const sha = process.env.BEERCALL_AVATAR_PROBE_SHA;
if (!sha || !/^[a-f0-9]{40}$/.test(sha)) throw new Error('BEERCALL_AVATAR_PROBE_SHA doit identifier le SHA F exact (40 caractères).');
const root = fileURLToPath(new URL('.', import.meta.url));
const frontend = fileURLToPath(new URL('../..', import.meta.url));
const temporary = resolve(process.env.LOCALAPPDATA ? resolve(process.env.LOCALAPPDATA, 'Temp') : tmpdir(), 'opencode');
const proxy = {'/models': {target: 'http://127.0.0.1:8080', changeOrigin: true}};

export default defineConfig({
    root,
    envDir: root,
    publicDir: resolve(frontend, 'public'),
    plugins: [react(), tailwindcss(), basicSsl({name: 'BeerCall local avatar probe', certDir: resolve(temporary, 'avatar-hardware-ssl')})],
    define: {__BEERCALL_AVATAR_PROBE_SHA__: JSON.stringify(sha)},
    server: {host: '127.0.0.1', port: 4175, strictPort: true, https: {}, proxy, fs: {strict: true, allow: [frontend]}},
    preview: {host: '127.0.0.1', port: 4175, strictPort: true, https: {}, proxy},
    build: {emptyOutDir: false, outDir: resolve(temporary, `avatar-hardware-${sha}-${randomUUID()}`)},
});
