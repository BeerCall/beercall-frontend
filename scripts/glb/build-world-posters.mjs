#!/usr/bin/env node
/**
 * B14 / B14-poster-entry — Génération des posters statiques des mondes 3D.
 *
 * Utilise le serveur de conversion A03 et Chromium pour rendre chaque décor
 * aux dimensions 640×400 (qualité WebP 90) avec les coordonnées et caméras historiques.
 * Écrit de façon atomique sous `public/worlds/{bar,piscine,dodo}.webp`.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(HERE, '../..');
const PUBLIC_WORLDS_DIR = path.resolve(FRONTEND_ROOT, 'public/worlds');
const CONVERT_PAGE_CONFIG = path.join(HERE, 'convert-page', 'vite.config.ts');
const CONVERT_PORT_RANGE = [5196, 5197, 5198, 5199];

export const WORLD_POSTER_TARGETS = [
    {
        kind: 'bar',
        decorSourceId: 'Bar',
        camera: { position: [0, 80, 450], fov: 45, target: [0, 80, 0] },
        decorTransform: { scale: 0.1, position: [0, 0, 0], rotation: [0, 0, 0] },
    },
    {
        kind: 'piscine',
        decorSourceId: 'Swimming_pool',
        camera: { position: [0, 80, 450], fov: 45, target: [0, 80, 0] },
        decorTransform: { scale: 7.5, position: [0, 0, 0], rotation: [0, 0, 0] },
    },
    {
        kind: 'dodo',
        decorSourceId: 'Floaty_Island',
        camera: { position: [0, 80, 450], fov: 45, target: [0, 80, 0] },
        decorTransform: { scale: 500, position: [0, 100, 0], rotation: [0, 0, 0] },
    },
];

function findFreePort(ports) {
    return new Promise((resolve, reject) => {
        const tryAt = (index) => {
            if (index >= ports.length) {
                reject(new Error(`Aucun port libre dans ${ports.join(', ')}`));
                return;
            }
            const server = createServer();
            server.once('error', () => tryAt(index + 1));
            server.once('listening', () => server.close(() => resolve(ports[index])));
            server.listen(ports[index], '127.0.0.1');
        };
        tryAt(0);
    });
}

async function waitForServer(url, timeout = 60_000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        try {
            const response = await fetch(url);
            if (response.ok) return;
        } catch {
            /* pas encore prêt */
        }
        await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error(`Serveur de conversion indisponible: ${url}`);
}

export async function buildWorldPosters(outDir = PUBLIC_WORLDS_DIR) {
    mkdirSync(outDir, { recursive: true });
    console.log(`[posters] Génération des posters des mondes dans ${outDir}...`);

    const port = await findFreePort(CONVERT_PORT_RANGE);
    const base = `http://127.0.0.1:${port}`;
    const vite = spawn(
        process.execPath,
        [
            path.join(FRONTEND_ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
            '--config', CONVERT_PAGE_CONFIG,
            '--host', '127.0.0.1',
            '--port', String(port),
            '--strictPort',
        ],
        { cwd: FRONTEND_ROOT, stdio: 'inherit' },
    );

    let browser;
    const generated = [];

    try {
        await waitForServer(`${base}/`);
        browser = await chromium.launch();
        const page = await browser.newPage();
        await page.goto(`${base}/`, { waitUntil: 'load' });
        await page.waitForFunction(() => Boolean(window.__renderWorldPoster), null, { timeout: 30_000 });

        for (const target of WORLD_POSTER_TARGETS) {
            console.log(`[posters] Rendu du poster : ${target.kind}...`);
            const pngBase64 = await page.evaluate((opts) => window.__renderWorldPoster(opts), {
                decorSourceId: target.decorSourceId,
                decorTransform: target.decorTransform,
                camera: target.camera,
                width: 640,
                height: 400,
            });

            const pngBuf = Buffer.from(pngBase64, 'base64');
            const webpBuf = await sharp(pngBuf).webp({ quality: 90 }).toBuffer();

            const finalPath = path.join(outDir, `${target.kind}.webp`);
            const stagedPath = `${finalPath}.tmp-${process.pid}`;

            writeFileSync(stagedPath, webpBuf);
            renameSync(stagedPath, finalPath);

            const size = statSync(finalPath).size;
            console.log(`  ✓ ${target.kind}.webp généré : ${size} octets`);
            generated.push({ kind: target.kind, path: finalPath, size });
        }

        return generated;
    } finally {
        await browser?.close();
        vite.kill();
        await new Promise((r) => {
            vite.once('exit', r);
            setTimeout(r, 5_000);
        });
    }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
    buildWorldPosters()
        .then(() => {
            console.log('[posters] Tous les posters ont été générés avec succès.');
            process.exit(0);
        })
        .catch((err) => {
            console.error('[posters] Erreur critique :', err);
            process.exit(1);
        });
}
