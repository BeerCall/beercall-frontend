#!/usr/bin/env node
/**
 * A03 — Pilote de conversion FBX -> GLB.
 *
 * Démarre un serveur Vite local (plage 5196–5199) servant la page de conversion
 * et le dossier des modèles en lecture seule sous `/models-src/`, lance Chromium
 * une seule fois, convertit les sources demandées séquentiellement (90 s/item),
 * puis ferme tout dans `finally`.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

import { CATALOG_PATH, buildInventory } from './inventory.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FRONTEND_ROOT = path.resolve(HERE, '../..');
export const CONVERT_PORT_RANGE = [5196, 5197, 5198, 5199];
export const CONVERT_PAGE_CONFIG = path.join(HERE, 'convert-page', 'vite.config.ts');
export const DEFAULT_STAGING_DIR = path.join(HERE, 'staging');

/** Sources converties par le smoke d'acceptation A03. */
export const ACCEPTANCE_SOURCES = [
    'Men_head_Casual_0',
    'Women_head_Casual_0',
    'Men_accessory_Backpack_0',
    'Men_accessory_McLaren_5000',
    'Bar',
    'Swimming_pool',
    'Floaty_Island',
];

/** Analyse les arguments CLI. */
export function parseConvertArgs(argv) {
    const result = { only: [], out: DEFAULT_STAGING_DIR, all: false };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--only') {
            const value = argv[index + 1] ?? '';
            result.only = value.split(',').map((entry) => entry.trim()).filter(Boolean);
            index += 1;
        } else if (arg.startsWith('--only=')) {
            result.only = arg.slice('--only='.length).split(',').map((entry) => entry.trim()).filter(Boolean);
        } else if (arg === '--out') {
            result.out = path.resolve(argv[index + 1] ?? DEFAULT_STAGING_DIR);
            index += 1;
        } else if (arg.startsWith('--out=')) {
            result.out = path.resolve(arg.slice('--out='.length));
        } else if (arg === '--all') {
            result.all = true;
        }
    }
    return result;
}

/** Sélectionne les sources à convertir : explicitement fournies ou tout le catalogue. */
export function selectSources(inventory, { only = [], all = false } = {}) {
    const byId = new Map(inventory.items.map((item) => [item.sourceId, item]));
    const ids = all
        ? inventory.items.map((item) => item.sourceId)
        : only;
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length > 0) throw new Error(`Sources hors catalogue : ${missing.join(', ')}`);
    if (!all) {
        return ids.map((id) => byId.get(id));
    }
    return ids.map((id) => byId.get(id));
}

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
        await new Promise((resolve) => setTimeout(resolve, 400));
    }
    throw new Error(`Serveur de conversion indisponible: ${url}`);
}

function evaluateWithTimeout(page, sourceId, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Conversion de ${sourceId} expirée après ${timeoutMs} ms`)), timeoutMs);
        page.evaluate((id) => window.__convertFbx(id), sourceId)
            .then((value) => { clearTimeout(timer); resolve(value); })
            .catch((error) => { clearTimeout(timer); reject(error); });
    });
}

/**
 * Convertit une liste de sourceIds et retourne les résultats bruts.
 * @param {{sources: string[], timeoutMs?: number, onResult?: (r: object, ms: number) => void}} options
 */
export async function convertSources({ sources, timeoutMs = 90_000, onResult } = {}) {
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
    const results = [];
    try {
        await waitForServer(`${base}/`);
        browser = await chromium.launch();
        const page = await browser.newPage();
        page.on('console', (message) => {
            if (message.type() === 'error') console.error(`[page] ${message.text()}`);
        });
        await page.goto(`${base}/`, { waitUntil: 'load' });
        await page.waitForFunction(() => Boolean(window.__convertFbx), null, { timeout: 30_000 });

        for (const sourceId of sources) {
            const started = Date.now();
            const result = await evaluateWithTimeout(page, sourceId, timeoutMs);
            const elapsed = Date.now() - started;
            results.push(result);
            if (onResult) onResult(result, elapsed);
        }
        return { results, base, port };
    } finally {
        await browser?.close();
        vite.kill();
        await new Promise((resolve) => {
            vite.once('exit', resolve);
            setTimeout(resolve, 5_000);
        });
    }
}

async function main() {
    const options = parseConvertArgs(process.argv.slice(2));
    const inventory = buildInventory({ dir: undefined, hash: false });
    const sources = options.all || options.only.length > 0
        ? selectSources(inventory, options).map((item) => item.sourceId)
        : ACCEPTANCE_SOURCES;
    mkdirSync(options.out, { recursive: true });
    console.log(`Conversion de ${sources.length} source(s) vers ${options.out}`);

    const { results } = await convertSources({
        sources,
        onResult: (result, elapsed) => {
            writeFileSync(path.join(options.out, `${result.sourceId}.glb`), Buffer.from(result.base64, 'base64'));
            console.log(`${result.sourceId}: ${result.bytes} octets, ${elapsed} ms, meshes=${result.stats.meshes}, textures=${result.stats.textures}`);
        },
    });
    const report = {
        generatedAt: new Date().toISOString(),
        catalog: CATALOG_PATH,
        items: results.map((result) => ({ ...result, base64: undefined })),
    };
    writeFileSync(path.join(options.out, 'convert-report.json'), JSON.stringify(report, null, 2));
    console.log(`Conversion terminée : ${results.length} résultat(s).`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
