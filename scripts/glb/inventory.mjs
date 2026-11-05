#!/usr/bin/env node
// A02 — Inventaire exhaustif des FBX sources.
// Le chemin des sources est calculé depuis ce fichier (jamais depuis cwd) :
// `scripts/glb/` -> `../../../beercall-backend/static/models`.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseSourceName } from './catalog-name.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Racine du dépôt frontal (`beercall-frontend`). */
export const FRONTEND_ROOT = path.resolve(HERE, '../..');
/** Dossier des modèles source, voisin du frontend. */
export const MODELS_SRC_DIR = path.resolve(HERE, '../../../beercall-backend/static/models');
/** Emplacement par défaut du catalogue généré. */
export const CATALOG_PATH = path.join(HERE, 'catalog.json');

export const PIECE_RE = /^(Men|Women)_(head|body|legs|feet)_(.+)\.fbx$/;
export const ACCESSORY_RE = /^(Men|Women)_accessory_(.+)\.fbx$/;

/** FBX explicitement exclus de l'inventaire (Animations.fbx uniquement). */
export const EXCLUDED_FBX = new Set(['Animations.fbx']);

/** Décors reconnus, avec leur clé stable. */
export const DECOR_KEYS = {
    'Bar.fbx': 'decor/bar',
    'Swimming_pool.fbx': 'decor/piscine',
    'Floaty_Island.fbx': 'decor/dodo',
};

export const EXPECTED_TOTAL = 162;
export const EXPECTED_PIECES = 85;
export const EXPECTED_ACCESSORIES = 74;
export const EXPECTED_DECORS = 3;

/**
 * Classe un nom de fichier FBX.
 * @returns {{kind:'piece'|'accessory'|'decor', key:string, sourceId:string,
 *   gender:'Men'|'Women'|null, slot:string|null, decor:string|null}}
 * @throws {Error} si le fichier n'est pas classable.
 */
export function classifyFbx(filename) {
    if (!filename.toLowerCase().endsWith('.fbx')) {
        throw new Error(`Not an FBX file: ${filename}`);
    }
    const sourceId = path.basename(filename, '.fbx');

    const parsed = parseSourceName(filename);

    const piece = PIECE_RE.exec(filename);
    if (piece) {
        const [, gender, slot] = piece;
        return {
            kind: 'piece',
            key: `${gender.toLowerCase()}/${slot}/${sourceId}`,
            sourceId,
            gender,
            slot,
            decor: null,
            ...(parsed?.transform ? { transform: parsed.transform } : {}),
        };
    }

    const accessory = ACCESSORY_RE.exec(filename);
    if (accessory) {
        const [, gender] = accessory;
        return {
            kind: 'accessory',
            key: `acc/${gender.toLowerCase()}/${sourceId}`,
            sourceId,
            gender,
            slot: 'accessory',
            decor: null,
            ...(parsed?.transform ? { transform: parsed.transform } : {}),
        };
    }

    const decorKey = DECOR_KEYS[filename];
    if (decorKey) {
        const decor = decorKey.split('/')[1];
        return { kind: 'decor', key: decorKey, sourceId, gender: null, slot: null, decor };
    }

    throw new Error(`FBX non classable (inventaire incomplet) : ${filename}`);
}

/** SHA-256 hexadécimal d'un fichier. */
export function sha256File(filePath) {
    return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/** Liste triée des FBX d'un dossier (hors Animations et fichiers `.fbx.gz`). */
export function listFbxFiles(dir) {
    return readdirSync(dir)
        .filter((name) => name.toLowerCase().endsWith('.fbx'))
        .filter((name) => !EXCLUDED_FBX.has(name))
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Construit l'inventaire complet.
 * @param {{dir?:string, hash?:boolean}} [options]
 */
export function buildInventory({ dir = MODELS_SRC_DIR, hash = false } = {}) {
    const files = listFbxFiles(dir);
    const items = [];
    const unclassified = [];
    const seenKeys = new Map();

    for (const filename of files) {
        let meta;
        try {
            meta = classifyFbx(filename);
        } catch (err) {
            unclassified.push({ source: filename, reason: err.message });
            continue;
        }
        if (seenKeys.has(meta.key)) {
            unclassified.push({ source: filename, reason: `clé dupliquée ${meta.key}` });
            continue;
        }
        seenKeys.set(meta.key, filename);
        const abs = path.join(dir, filename);
        const item = {
            key: meta.key,
            source: filename,
            sourceId: meta.sourceId,
            kind: meta.kind,
            gender: meta.gender,
            slot: meta.slot,
            decor: meta.decor,
        };
        if (meta.transform) item.transform = meta.transform;
        if (hash) item.sourceSha256 = sha256File(abs);
        items.push(item);
    }

    items.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

    const counts = {
        total: items.length,
        piece: items.filter((i) => i.kind === 'piece').length,
        accessory: items.filter((i) => i.kind === 'accessory').length,
        decor: items.filter((i) => i.kind === 'decor').length,
        byGender: {
            Men: items.filter((i) => i.gender === 'Men').length,
            Women: items.filter((i) => i.gender === 'Women').length,
        },
        bySlot: items.reduce((acc, i) => {
            if (i.slot) acc[i.slot] = (acc[i.slot] ?? 0) + 1;
            return acc;
        }, {}),
    };

    return {
        version: 1,
        generatedAt: new Date().toISOString(),
        sourceDir: path.relative(FRONTEND_ROOT, dir).split(path.sep).join('/'),
        counts,
        items,
        unclassified,
    };
}

/**
 * Vérifie qu'un jeu d'identifiants référencés est bien couvert par l'inventaire.
 * Sert au recoupement avec ModularAvatar et le seed de `main.py`.
 */
export function findMissingReferencedIds(inventory, referencedIds) {
    const present = new Set(inventory.items.map((i) => i.sourceId));
    const missing = new Set();
    for (const id of referencedIds) {
        if (typeof id !== 'string' || id.length === 0 || id === 'none') continue;
        const bare = id.endsWith('.fbx') ? id.slice(0, -4) : id;
        if (!present.has(bare)) missing.add(bare);
    }
    return [...missing].sort();
}

function main() {
    if (!statSync(MODELS_SRC_DIR, { throwIfNoEntry: false })) {
        console.error(`Dossier source introuvable : ${MODELS_SRC_DIR}`);
        process.exit(1);
    }
    const inventory = buildInventory({ hash: true });
    writeFileSync(CATALOG_PATH, JSON.stringify(inventory, null, 2) + '\n', 'utf8');

    const { counts } = inventory;
    console.log(`Inventaire : ${counts.total} items (pièces ${counts.piece}, accessoires ${counts.accessory}, décors ${counts.decor})`);
    console.log(`Genres : Men ${counts.byGender.Men}, Women ${counts.byGender.Women}`);
    console.log(`Catalogue écrit : ${CATALOG_PATH}`);

    let failed = false;
    if (inventory.unclassified.length > 0) {
        console.error(`FBX non classables : ${inventory.unclassified.map((u) => u.source).join(', ')}`);
        failed = true;
    }
    if (counts.total !== EXPECTED_TOTAL) {
        console.error(`Total inattendu : ${counts.total} (attendu ${EXPECTED_TOTAL})`);
        failed = true;
    }
    if (counts.piece !== EXPECTED_PIECES || counts.accessory !== EXPECTED_ACCESSORIES || counts.decor !== EXPECTED_DECORS) {
        console.error(
            `Répartition inattendue : pièces ${counts.piece}/${EXPECTED_PIECES}, ` +
                `accessoires ${counts.accessory}/${EXPECTED_ACCESSORIES}, décors ${counts.decor}/${EXPECTED_DECORS}`,
        );
        failed = true;
    }
    process.exit(failed ? 1 : 0);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
