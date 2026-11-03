#!/usr/bin/env node
/**
 * A15 — Serveur HTTP Node de rendu des sprites d'avatar (Playwright / Chromium).
 *
 * Pilote un navigateur Chromium en mode isolé et sérialisé (concurrence 1, file max 32).
 * Exécute le rendu WebGL, convertit la sortie PNG en WebP q90 via sharp,
 * et sert les fichiers statiques (build, /models/, /animations/) avec protection anti-traversal.
 */

import { createServer } from 'node:http';
import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT || '8787', 10);
const HOST = process.env.HOST || '127.0.0.1';

const DIST_DIR = path.resolve(HERE, '../../.renderer-dist');
const MODELS_DIR = path.resolve(process.env.MODELS_DIR || path.join(HERE, '../../../beercall-backend/static/models'));
const ANIMATIONS_DIR = path.resolve(process.env.ANIMATIONS_DIR || path.join(HERE, '../../public/animations'));

const MAX_QUEUE_SIZE = 32;
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RENDERS_BEFORE_RELOAD = 50;
const MAX_BODY_BYTES = 64 * 1024; // 64 Ko

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.glb': 'model/gltf-binary',
    '.png': 'image/png',
    '.webp': 'image/webp',
};

let browser = null;
let page = null;
let rendererReady = false;
let renderCount = 0;
let isShuttingDown = false;

// File de requêtes sérialisées (concurrence 1)
const requestQueue = [];
let isProcessingQueue = false;

function safeResolve(baseDir, requestedPath) {
    const cleanPath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
    const absolutePath = path.resolve(baseDir, cleanPath);

    const baseResolved = path.resolve(baseDir);
    const baseLower = baseResolved.toLowerCase();
    if (!absolutePath.toLowerCase().startsWith(baseLower)) return null;
    if (!existsSync(absolutePath)) return null;

    try {
        const real = realpathSync(absolutePath);
        if (!real.toLowerCase().startsWith(baseLower)) return null;
        return real;
    } catch {
        return null;
    }
}

function serveStatic(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    let pathname = decodeURIComponent(url.pathname);

    let filePath = null;
    if (pathname.startsWith('/models/')) {
        filePath = safeResolve(MODELS_DIR, pathname.slice('/models/'.length));
    } else if (pathname.startsWith('/animations/')) {
        filePath = safeResolve(ANIMATIONS_DIR, pathname.slice('/animations/'.length));
    } else {
        if (pathname === '/' || pathname === '') pathname = '/render.html';
        filePath = safeResolve(DIST_DIR, pathname);
    }

    if (!filePath || !statSync(filePath).isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': statSync(filePath).size,
    });
    createReadStream(filePath).pipe(res);
}

async function convertToWebP(pngBase64, expectedWidth, expectedHeight, name) {
    const buf = Buffer.from(pngBase64, 'base64');
    const meta = await sharp(buf).metadata();

    if (meta.width !== expectedWidth || meta.height !== expectedHeight) {
        throw new Error(`Dimensions invalides pour ${name} : ${meta.width}x${meta.height} (attendu ${expectedWidth}x${expectedHeight})`);
    }
    if (!meta.hasAlpha) {
        throw new Error(`L'image ${name} doit posséder un canal alpha transparent`);
    }

    const webpBuffer = await sharp(buf).webp({ quality: 90 }).toBuffer();
    return webpBuffer.toString('base64');
}

async function initBrowser(localPort) {
    rendererReady = false;
    const isSoftwareGl = Boolean(process.env.RENDERER_SOFTWARE_GL || process.platform === 'linux');
    const args = [
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-sync',
        '--no-first-run',
    ];

    if (isSoftwareGl) {
        args.push(
            '--use-gl=angle',
            '--use-angle=swiftshader-webgl',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
            '--no-sandbox',
            '--disable-setuid-sandbox',
        );
    }

    browser = await chromium.launch({ headless: true, args });
    page = await browser.newPage();
    page.on('console', (msg) => {
        if (msg.type() === 'error') console.error(`[browser:error] ${msg.text()}`);
    });
    page.on('pageerror', (err) => console.error(`[browser:pageerror]`, err));

    // Bloquer les requêtes réseau externes (seul le serveur local est autorisé)
    await page.route('**', (route) => {
        const reqUrl = route.request().url();
        if (reqUrl.startsWith(`http://127.0.0.1:${localPort}`) || reqUrl.startsWith(`http://localhost:${localPort}`)) {
            route.continue();
        } else {
            route.abort();
        }
    });

    const targetUrl = `http://127.0.0.1:${localPort}/render.html`;
    await page.goto(targetUrl, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForFunction(() => Boolean(window.__rendererReady), null, { timeout: 30_000 });

    rendererReady = true;
    console.log(`[renderer] Navigateur prêt sur ${targetUrl}`);
}

async function reloadBrowser(localPort) {
    console.log('[renderer] Rechargement préventif de la page du navigateur...');
    rendererReady = false;
    try {
        await page?.close();
        page = await browser.newPage();
        await page.route('**', (route) => {
            const reqUrl = route.request().url();
            if (reqUrl.startsWith(`http://127.0.0.1:${localPort}`) || reqUrl.startsWith(`http://localhost:${localPort}`)) {
                route.continue();
            } else {
                route.abort();
            }
        });
        await page.goto(`http://127.0.0.1:${localPort}/render.html`, { waitUntil: 'load', timeout: 30_000 });
        await page.waitForFunction(() => Boolean(window.__rendererReady), null, { timeout: 30_000 });
        renderCount = 0;
        rendererReady = true;
        console.log('[renderer] Rechargement terminé, renderer prêt.');
    } catch (error) {
        console.error('[renderer] Échec du rechargement du navigateur :', error);
    }
}

async function processQueue(localPort) {
    if (isProcessingQueue || requestQueue.length === 0 || isShuttingDown) return;
    isProcessingQueue = true;

    while (requestQueue.length > 0 && !isShuttingDown) {
        const item = requestQueue.shift();
        const { payload, resolve, reject } = item;

        if (!rendererReady) {
            reject({ status: 503, message: 'Renderer indisponible' });
            continue;
        }

        let timeoutTimer = null;
        try {
            const timeoutPromise = new Promise((_, reqReject) => {
                timeoutTimer = setTimeout(() => {
                    reqReject(new Error('TIMEOUT_RENDER'));
                }, REQUEST_TIMEOUT_MS);
            });

            const renderPromise = page.evaluate((cfg) => window.__renderAvatar(cfg), payload.config);
            const rawResult = await Promise.race([renderPromise, timeoutPromise]);
            clearTimeout(timeoutTimer);

            const [headWebp, portraitWebp, bodyWebp] = await Promise.all([
                convertToWebP(rawResult.head, 256, 256, 'head'),
                convertToWebP(rawResult.portrait, 512, 512, 'portrait'),
                convertToWebP(rawResult.body, 256, 512, 'body'),
            ]);

            renderCount += 1;
            resolve({
                status: 200,
                data: {
                    head: headWebp,
                    portrait: portraitWebp,
                    body: bodyWebp,
                    checks: rawResult.checks,
                },
            });

            if (renderCount >= MAX_RENDERS_BEFORE_RELOAD) {
                await reloadBrowser(localPort);
            }
        } catch (error) {
            clearTimeout(timeoutTimer);
            if (error?.message === 'TIMEOUT_RENDER') {
                console.error('[renderer] Requête expirée (> 60s), redémarrage du contexte...');
                await reloadBrowser(localPort);
                reject({ status: 504, message: 'Délai maximal de rendu dépassé (504)' });
            } else {
                reject({ status: 422, message: error?.message || 'Erreur lors du rendu' });
            }
        }
    }

    isProcessingQueue = false;
}

export function createRendererServer(options = {}) {
    const port = options.port || PORT;
    const host = options.host || HOST;

    const server = createServer((req, res) => {
        const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

        // 1. Healthcheck
        if (req.method === 'GET' && url.pathname === '/healthz') {
            if (rendererReady && !isShuttingDown) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok', ready: true }));
            } else {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'initializing', ready: false }));
            }
            return;
        }

        // 2. Rendu POST /render ou POST /
        if (req.method === 'POST' && (url.pathname === '/render' || url.pathname === '/')) {
            if (!rendererReady) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ detail: 'Renderer en cours d initialisation' }));
                return;
            }

            if (requestQueue.length >= MAX_QUEUE_SIZE) {
                res.writeHead(429, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ detail: 'File de rendu saturée (429)' }));
                return;
            }

            const chunks = [];
            let totalBytes = 0;

            req.on('data', (chunk) => {
                totalBytes += chunk.length;
                if (totalBytes > MAX_BODY_BYTES) {
                    res.writeHead(413, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ detail: 'Payload trop volumineux (> 64 Ko)' }));
                    req.destroy();
                } else {
                    chunks.push(chunk);
                }
            });

            req.on('end', () => {
                if (totalBytes > MAX_BODY_BYTES) return;
                let payload = null;
                try {
                    payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                } catch {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ detail: 'JSON malformé' }));
                    return;
                }

                if (!payload?.config || typeof payload.config !== 'object') {
                    res.writeHead(422, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ detail: 'Champ "config" requis' }));
                    return;
                }
                if (!payload?.hash || !/^[0-9a-f]{16}$/.test(payload.hash)) {
                    res.writeHead(422, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ detail: 'Champ "hash" requis (16 hex)' }));
                    return;
                }

                new Promise((resolve, reject) => {
                    requestQueue.push({ payload, resolve, reject });
                    processQueue(port);
                })
                    .then(({ status: respStatus, data }) => {
                        res.writeHead(respStatus, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(data));
                    })
                    .catch(({ status: errStatus, message }) => {
                        res.writeHead(errStatus || 500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ detail: message }));
                    });
            });
            return;
        }

        // 3. Fichiers statiques
        if (req.method === 'GET' || req.method === 'HEAD') {
            serveStatic(req, res);
            return;
        }

        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.end('Method Not Allowed');
    });

    return {
        server,
        start: async () => {
            await new Promise((resolve) => server.listen(port, host, resolve));
            console.log(`[renderer] Serveur HTTP écoute sur http://${host}:${port}`);
            await initBrowser(port);
        },
        stop: async () => {
            isShuttingDown = true;
            await page?.close().catch(() => {});
            await browser?.close().catch(() => {});
            await new Promise((resolve) => server.close(resolve));
        },
    };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
    const instance = createRendererServer();
    const shutdown = async () => {
        console.log('[renderer] Arrêt demandé...');
        await instance.stop();
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    instance.start().catch((error) => {
        console.error('[renderer] Erreur critique au démarrage :', error);
        process.exit(1);
    });
}
