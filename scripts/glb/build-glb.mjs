#!/usr/bin/env node
/**
 * A04 — Publication du catalogue GLB.
 *
 * `glb:build = node scripts/glb/build-glb.mjs`
 *   --out <dir>       dossier de sortie (défaut : backend `static/models/glb`)
 *   --only <key,...>  ne reconstruit que ces clés, sans supprimer les autres
 *
 * Le convertisseur A03 est réutilisé séquentiellement. Les GLB sont écrits
 * complets via temporaires sur le même FS ; le manifeste est publié EN DERNIER
 * par rename atomique, afin qu'un échec laisse l'ancien manifeste et les anciens
 * fichiers utilisables.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { buildInventory } from './inventory.mjs';
import { catalogKey } from './catalog-name.mjs';
import { convertSources } from './convert.mjs';
import { publishGlb } from './lib/publish-glb.mjs';

export { catalogKey };

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PIPELINE_VERSION = 1;
export const DEFAULT_OUT_DIR = path.resolve(HERE, '../../../beercall-backend/static/models/glb');

const KIND_DIR = { piece: 'pieces', accessory: 'accessories', decor: 'decors' };

/** Chemin relatif publié : `v1/<kind>/<gender-ou-_>/<sourceId>.<sha8>.glb`. */
export function targetRelPath(item) {
    const kindDir = KIND_DIR[item.kind] ?? item.kind;
    const gender = item.gender ?? '_';
    const sha8 = (item.sourceSha256 ?? '').slice(0, 8);
    return `v1/${kindDir}/${gender}/${item.sourceId}.${sha8}.glb`;
}

/** URL publique d'un fichier publié (`manifest.url`). */
export function manifestUrl(relPath) {
    return `/models/glb/${relPath.split(path.sep).join('/')}`;
}

/** Un item est à jour si source, pipelineVersion et fichier publié correspondent. */
export function isUpToDate(existingItem, item, pipelineVersion, fileExists) {
    return Boolean(
        existingItem
        && existingItem.sourceSha256 === item.sourceSha256
        && existingItem.pipelineVersion === pipelineVersion
        && fileExists,
    );
}

/** Statistiques structurelles lues dans le chunk JSON du GLB. */
export function glbStats(buffer) {
    if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error("Ce n'est pas un GLB");
    const jsonLength = buffer.readUInt32LE(12);
    const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
    const accessors = json.accessors ?? [];
    let drawCalls = 0;
    let triangles = 0;
    for (const mesh of json.meshes ?? []) {
        for (const primitive of mesh.primitives ?? []) {
            drawCalls += 1;
            const count = primitive.indices != null
                ? accessors[primitive.indices]?.count ?? 0
                : accessors[primitive.attributes?.POSITION]?.count ?? 0;
            triangles += Math.floor(count / 3);
        }
    }
    let joints = 0;
    for (const skin of json.skins ?? []) joints += skin.joints?.length ?? 0;
    return { drawCalls, triangles, joints, images: (json.images ?? []).length, materials: (json.materials ?? []).length };
}

/** Écrit un JSON de façon atomique (temporaire sur le même FS puis rename). */
export function writeJsonAtomic(file, data) {
    const staged = `${file}.tmp-${process.pid}`;
    try {
        writeFileSync(staged, JSON.stringify(data, null, 2) + '\n', 'utf8');
        renameSync(staged, file);
    } finally {
        rmSync(staged, { force: true });
    }
}

export function readManifest(manifestPath) {
    if (!existsSync(manifestPath)) return null;
    try {
        return JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
        return null;
    }
}

/**
 * Fusionne les entrées : les items produits remplacent, les autres sont
 * conservés. `replaceKeys` retire les anciennes variantes d'un même article
 * (par exemple `..._Sudowoodo` quand on publie `..._Sudowoodo_600`).
 */
export function mergeManifestEntries({
    existing,
    produced,
    pipelineVersion,
    replaceKeys = new Set(),
    keepSourceIds = new Set(),
}) {
    const byKey = new Map();
    for (const entry of existing?.items ?? []) {
        const key = catalogKey(entry.sourceId ?? entry.source ?? '');
        // Une variante remplacée est retirée, sauf l'item courant déjà à jour.
        if (key && replaceKeys.has(key) && !keepSourceIds.has(entry.sourceId)) continue;
        byKey.set(entry.key, entry);
    }
    for (const entry of produced) {
        if (entry === null) continue;
        byKey.set(entry.key, entry);
    }
    const items = [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return {
        version: 1,
        pipelineVersion,
        generatedAt: new Date().toISOString(),
        items,
    };
}

/**
 * Publie une liste d'items (dépendances injectées pour les tests).
 * Le manifeste n'est écrit qu'après succès complet de tous les items demandés.
 */
export async function publishEntries({ items, outDir, manifestPath, existing, pipelineVersion, convert, publish, replaceKeys = new Set() }) {
    const toBuild = [];
    const produced = [];
    for (const item of items) {
        const relPath = targetRelPath(item);
        const target = path.join(outDir, relPath);
        const already = existing?.items?.find((entry) => entry.key === item.key);
        if (isUpToDate(already, item, pipelineVersion, existsSync(target))) {
            continue;
        }
        toBuild.push({ item, relPath, target });
    }

    let converted = new Map();
    if (toBuild.length > 0) {
        converted = await convert(toBuild.map((entry) => entry.item.sourceId));
    }

    for (const entry of toBuild) {
        const { item, relPath, target } = entry;
        const convertedResult = converted.get(item.sourceId);
        if (!convertedResult) throw new Error(`Conversion manquante pour ${item.sourceId}`);
        mkdirSync(path.dirname(target), { recursive: true });
        const inputBuffer = Buffer.from(convertedResult.base64, 'base64');
        const stats = await publish(inputBuffer, target, item);
        const bytes = readFileSync(target);
        produced.push({
            key: item.key,
            url: manifestUrl(relPath),
            sha256: createHash('sha256').update(bytes).digest('hex'),
            bytes: bytes.byteLength,
            drawCalls: stats.drawCalls,
            triangles: stats.triangles,
            joints: stats.joints,
            textures: stats.images,
            source: item.source,
            sourceId: item.sourceId,
            sourceSha256: item.sourceSha256,
            sourceBBox: convertedResult.bbox,
            pipelineVersion,
            ...(item.transform ? { transform: item.transform } : {}),
        });
    }

    const manifest = mergeManifestEntries({
        existing,
        produced,
        pipelineVersion,
        replaceKeys,
        keepSourceIds: new Set(items.map((item) => item.sourceId)),
    });
    writeJsonAtomic(manifestPath, manifest);
    return { manifest, built: produced.length, skipped: items.length - toBuild.length };
}

function parseArgs(argv) {
    const result = { out: DEFAULT_OUT_DIR, only: [] };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--out') { result.out = path.resolve(argv[index + 1]); index += 1; }
        else if (arg.startsWith('--out=')) result.out = path.resolve(arg.slice('--out='.length));
        else if (arg === '--only') { result.only = (argv[index + 1] ?? '').split(',').map((v) => v.trim()).filter(Boolean); index += 1; }
        else if (arg.startsWith('--only=')) result.only = arg.slice('--only='.length).split(',').map((v) => v.trim()).filter(Boolean);
    }
    return result;
}

async function defaultPublish(inputBuffer, target, item) {
    const input = `${target}.in.glb`;
    try {
        writeFileSync(input, inputBuffer);
        await publishGlb(input, target, { resizeMax: item.kind === 'decor' ? 1024 : null });
        return glbStats(readFileSync(target));
    } finally {
        rmSync(input, { force: true });
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const inventory = buildInventory({ hash: true });
    mkdirSync(options.out, { recursive: true });
    const manifestPath = path.join(options.out, 'manifest.json');
    const existing = readManifest(manifestPath);

    let items = inventory.items;
    let replaceKeys = new Set();
    if (options.only.length > 0) {
        const requested = new Set(options.only);
        items = inventory.items.filter(
            (item) => requested.has(item.key) || requested.has(item.sourceId),
        );
        const found = new Set(items.flatMap((item) => [item.key, item.sourceId]));
        const missing = options.only.filter((key) => !found.has(key));
        if (missing.length > 0) throw new Error(`Clés hors catalogue : ${missing.join(', ')}`);
        replaceKeys = new Set(
            items.map((item) => catalogKey(item.sourceId)).filter(Boolean),
        );
    }

    const { manifest, built, skipped } = await publishEntries({
        items,
        outDir: options.out,
        manifestPath,
        existing,
        pipelineVersion: PIPELINE_VERSION,
        replaceKeys,
        convert: async (sourceIds) => {
            const { results } = await convertSources({ sources: sourceIds });
            return new Map(results.map((result) => [result.sourceId, result]));
        },
        publish: defaultPublish,
    });

    console.log(`GLB publiés : ${built}, ignorés (à jour) : ${skipped}, total manifeste : ${manifest.items.length}`);
    console.log(`Manifeste : ${manifestPath}`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
