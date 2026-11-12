#!/usr/bin/env node
/**
 * Génère les vignettes d'articles du catalogue.
 *
 * Une pièce = un rendu 256x256 transparent par le serveur de rendu existant,
 * puis publication en WebP 192x192 q85. Le manifeste reçoit un champ
 * `thumbnail {url, sha256, bytes, width, height}` avec hash dans l'URL.
 *
 * `--only a,b` limite la génération ; sans option, génère les 159 articles.
 * `RENDERER_URL` permet d'utiliser un serveur déjà lancé ; sinon le CLI démarre
 * le serveur de rendu local (même Chromium que les sprites).
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { createRendererServer } from '../../tools/avatar-renderer/server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GLB_DIR = path.resolve(HERE, '../../../beercall-backend/static/models/glb');
const MANIFEST_PATH = path.join(GLB_DIR, 'manifest.json');
const DIST_ENTRY = path.resolve(HERE, '../../.renderer-dist/render.html');
const ARTICLE_RE = /^(Men|Women)_(head|body|legs|feet|accessory)_/;

function writeJsonAtomic(file, data) {
    const staged = `${file}.tmp-${process.pid}`;
    try {
        writeFileSync(staged, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
        renameSync(staged, file);
    } finally {
        rmSync(staged, { force: true });
    }
}

function parseArgs(argv) {
    const options = { only: [] };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--all') continue;
        if (arg === '--only') {
            const value = argv[index + 1];
            if (!value) throw new Error('--only attend une liste de sourceId séparés par des virgules.');
            options.only = value.split(',').map((value) => value.trim()).filter(Boolean);
            index += 1;
            continue;
        }
        throw new Error(`Argument inconnu : ${arg}`);
    }
    return options;
}

async function requestThumbnail(baseUrl, sourceId) {
    const response = await fetch(`${baseUrl}/thumbnail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId }),
    });
    if (!response.ok) {
        throw new Error(`Vignette "${sourceId}" : HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
    }
    const data = await response.json();
    if (typeof data.webp !== 'string' || !data.webp) {
        throw new Error(`Vignette "${sourceId}" : réponse sans image WebP`);
    }
    const buffer = Buffer.from(data.webp, 'base64');
    if (data.bytes !== buffer.length) {
        throw new Error(`Vignette "${sourceId}" : ${data.bytes} octets annoncés, ${buffer.length} reçus`);
    }
    if (data.width !== 192 || data.height !== 192) {
        throw new Error(`Vignette "${sourceId}" : dimensions ${data.width}x${data.height} (attendu 192x192)`);
    }
    return buffer;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    const articles = manifest.items.filter((item) => ARTICLE_RE.test(item.sourceId));

    let targets = articles;
    if (options.only.length > 0) {
        const requested = new Set(options.only);
        for (const sourceId of requested) {
            if (!articles.some((item) => item.sourceId === sourceId)) {
                throw new Error(`Article introuvable dans le manifeste : ${sourceId}`);
            }
        }
        targets = articles.filter((item) => requested.has(item.sourceId));
    }

    let instance = null;
    let baseUrl = process.env.RENDERER_URL?.replace(/\/$/, '') ?? '';
    const startedAt = Date.now();

    try {
        if (!baseUrl) {
            if (!existsSync(DIST_ENTRY)) {
                throw new Error('Renderer non compilé : lancez npm run renderer:build avant glb:thumbnails.');
            }
            const port = Number(process.env.THUMBNAIL_RENDERER_PORT || 8791);
            instance = createRendererServer({ port, host: '127.0.0.1' });
            await instance.start();
            baseUrl = `http://127.0.0.1:${port}`;
        }

        const rendered = [];
        for (const item of targets) {
            const buffer = await requestThumbnail(baseUrl, item.sourceId);
            const sha256 = createHash('sha256').update(buffer).digest('hex');
            const sha8 = sha256.slice(0, 8);
            const gender = item.sourceId.split('_')[0];
            const relPath = `v1/thumbs/${gender}/${item.sourceId}.${sha8}.webp`;
            rendered.push({ item, buffer, sha256, relPath });
            if (rendered.length % 10 === 0 || rendered.length === targets.length) {
                console.log(`[thumbnails] ${rendered.length}/${targets.length}`);
            }
        }

        let totalBytes = 0;
        for (const entry of rendered) {
            const absolutePath = path.join(GLB_DIR, entry.relPath);
            mkdirSync(path.dirname(absolutePath), { recursive: true });
            const staged = `${absolutePath}.tmp-${process.pid}`;
            try {
                writeFileSync(staged, entry.buffer);
                renameSync(staged, absolutePath);
            } finally {
                rmSync(staged, { force: true });
            }

            const previousUrl = entry.item.thumbnail?.url;
            if (previousUrl) {
                const previousPath = path.join(GLB_DIR, previousUrl.replace('/models/glb/', ''));
                if (previousPath !== absolutePath) rmSync(previousPath, { force: true });
            }

            entry.item.thumbnail = {
                url: `/models/glb/${entry.relPath}`,
                sha256: entry.sha256,
                bytes: entry.buffer.length,
                width: 192,
                height: 192,
            };
            totalBytes += entry.buffer.length;
        }

        writeJsonAtomic(MANIFEST_PATH, manifest);

        console.log(JSON.stringify({
            requested: targets.length,
            generated: rendered.length,
            totalBytes,
            durationMs: Date.now() - startedAt,
        }, null, 2));
    } finally {
        if (instance) await instance.stop();
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
