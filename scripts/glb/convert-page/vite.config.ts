import { defineConfig, type Plugin } from 'vite';
import { createReadStream, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// `scripts/glb/convert-page` -> `../../../..` = racine BeerCall, puis backend voisin.
export const MODELS_DIR = path.resolve(HERE, '../../../../beercall-backend/static/models');

/** Noms de fichiers FBX autorisés, calculés une fois depuis le dossier source. */
export function allowedModelNames(): Set<string> {
    return new Set(readdirSync(MODELS_DIR).filter((name) => name.toLowerCase().endsWith('.fbx')));
}

/**
 * Résout une requête `/models-src/<fichier>` vers un chemin sous MODELS_DIR.
 * Refuse toute traversée de chemin et toute source hors catalogue (allowlist FBX).
 * Exporté pour les tests.
 */
export function resolveServedModel(urlPath: string, allowed: Set<string>): string | null {
    const withoutQuery = urlPath.split('?')[0].split('#')[0];
    let decoded: string;
    try {
        decoded = decodeURIComponent(withoutQuery);
    } catch {
        return null;
    }
    const bare = path.basename(decoded);
    if (decoded !== bare || !allowed.has(bare)) return null;
    const abs = path.resolve(MODELS_DIR, bare);
    if (abs !== path.join(MODELS_DIR, bare)) return null;
    return abs;
}

function modelsSourcesPlugin(): Plugin {
    const allowed = allowedModelNames();
    return {
        name: 'beercall-models-src',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                if (!req.url || !req.url.startsWith('/models-src/')) {
                    next();
                    return;
                }
                const requestPath = req.url.slice('/models-src/'.length);
                const abs = resolveServedModel(requestPath, allowed);
                if (!abs) {
                    res.statusCode = 404;
                    res.end('Not found');
                    return;
                }
                res.setHeader('Content-Type', 'application/octet-stream');
                res.setHeader('Content-Length', String(statSync(abs).size));
                createReadStream(abs).pipe(res);
            });
        },
    };
}

export default defineConfig({
    root: HERE,
    publicDir: false,
    server: {
        fs: { strict: true },
    },
    plugins: [modelsSourcesPlugin()],
});
