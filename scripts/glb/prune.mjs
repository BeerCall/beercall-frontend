#!/usr/bin/env node
/**
 * Retire du manifeste les entrées dont le FBX source a disparu, ainsi que
 * leurs fichiers dérivés (GLB, vignette, préparés). Les fichiers sont la seule
 * source : aucune liste d'articles en dur.
 *
 * `--out <fichier>` écrit la liste des retraits pour la synchronisation backend.
 * `--dry-run` affiche le plan sans supprimer.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MODELS_DIR = path.resolve(HERE, '../../../beercall-backend/static/models');

function writeJsonAtomic(file, data) {
    const staged = `${file}.tmp-${process.pid}`;
    try {
        writeFileSync(staged, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
        renameSync(staged, file);
    } finally {
        rmSync(staged, { force: true });
    }
}

function relativeFromUrl(url) {
    if (typeof url !== 'string' || !url.startsWith('/models/')) return null;
    return url.slice('/models/'.length);
}

export function pruneModels({ modelsDir = DEFAULT_MODELS_DIR, dryRun = false } = {}) {
    const manifestPath = path.join(modelsDir, 'glb', 'manifest.json');
    const preparedPath = path.join(modelsDir, 'prepared', 'manifest.json');
    if (!existsSync(manifestPath)) {
        throw new Error(`Manifeste GLB introuvable : ${manifestPath}`);
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const prepared = existsSync(preparedPath)
        ? JSON.parse(readFileSync(preparedPath, 'utf8'))
        : { version: 1, models: {} };

    const removed = [];
    const kept = [];
    for (const item of manifest.items ?? []) {
        if (!item.source || !item.sourceId) {
            kept.push(item);
            continue;
        }
        if (existsSync(path.join(modelsDir, item.source))) {
            kept.push(item);
            continue;
        }

        const derived = new Set();
        const glbRelative = relativeFromUrl(item.url);
        if (glbRelative) derived.add(glbRelative);
        const thumbRelative = relativeFromUrl(item.thumbnail?.url);
        if (thumbRelative) derived.add(thumbRelative);
        derived.add(`${item.source}.gz`);

        const preparedEntry = prepared.models?.[item.source];
        if (preparedEntry?.file) {
            derived.add(`prepared/${preparedEntry.file}`);
            derived.add(`prepared/${preparedEntry.file}.gz`);
            delete prepared.models[item.source];
        }

        removed.push({
            sourceId: item.sourceId,
            source: item.source,
            derived: [...derived].map((entry) => entry.split(path.sep).join('/')),
        });
    }

    manifest.items = kept;

    if (!dryRun) {
        for (const entry of removed) {
            for (const relative of entry.derived) {
                const target = path.join(modelsDir, relative);
                try {
                    rmSync(target, { force: true });
                } catch (error) {
                    throw new Error(`Retrait impossible pour ${entry.sourceId} : ${relative} (${error.message})`);
                }
            }
            console.log(`[prune] retrait ${entry.sourceId} (source ${entry.source})`);
        }
        writeJsonAtomic(manifestPath, manifest);
        if (existsSync(preparedPath)) writeJsonAtomic(preparedPath, prepared);
    }

    return { removed, kept: kept.length, manifest };
}

function parseArgs(argv) {
    const options = { modelsDir: DEFAULT_MODELS_DIR, dryRun: false, out: null };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--dry-run') {
            options.dryRun = true;
            continue;
        }
        if (arg === '--out') {
            options.out = argv[index + 1];
            if (!options.out) throw new Error('--out attend un chemin de fichier.');
            index += 1;
            continue;
        }
        throw new Error(`Argument inconnu : ${arg}`);
    }
    return options;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
    try {
        const options = parseArgs(process.argv.slice(2));
        const result = pruneModels(options);
        const summary = {
            removed: result.removed,
            kept: result.kept,
            dryRun: options.dryRun,
        };
        if (options.out) {
            mkdirSync(path.dirname(options.out), { recursive: true });
            writeFileSync(options.out, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
        }
        console.log(JSON.stringify(summary));
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}
