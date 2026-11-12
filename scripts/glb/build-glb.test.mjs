import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
    catalogKey,
    isUpToDate,
    mergeManifestEntries,
    publishEntries,
    targetRelPath,
    writeJsonAtomic,
    glbStats,
    readManifest,
} from './build-glb.mjs';

function makeGlb(json) {
    const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
    const padded = Buffer.alloc(Math.ceil(jsonBuffer.length / 4) * 4, 0x20);
    jsonBuffer.copy(padded);
    const total = 12 + 8 + padded.length;
    const buffer = Buffer.alloc(total);
    buffer.writeUInt32LE(0x46546c67, 0);
    buffer.writeUInt32LE(2, 4);
    buffer.writeUInt32LE(total, 8);
    buffer.writeUInt32LE(padded.length, 12);
    buffer.writeUInt32LE(0x4e4f534a, 16);
    padded.copy(buffer, 20);
    return buffer;
}

const item = (over = {}) => ({
    key: 'men/head/Men_head_Casual_0',
    kind: 'piece',
    gender: 'Men',
    sourceId: 'Men_head_Casual_0',
    source: 'Men_head_Casual_0.fbx',
    sourceSha256: 'abcdef1234567890',
    ...over,
});

test('targetRelPath suit v1/<kind>/<gender-ou-_>/<sourceId>.<sha8>.glb', () => {
    assert.equal(targetRelPath(item()), 'v1/pieces/Men/Men_head_Casual_0.abcdef12.glb');
    assert.equal(
        targetRelPath(item({ kind: 'accessory', gender: 'Women', sourceId: 'Women_accessory_Beer_500', sourceSha256: '12345678aaaa' })),
        'v1/accessories/Women/Women_accessory_Beer_500.12345678.glb',
    );
    assert.equal(
        targetRelPath(item({ kind: 'decor', gender: null, sourceId: 'Bar', sourceSha256: 'deadbeef00' })),
        'v1/decors/_/Bar.deadbeef.glb',
    );
});

test('isUpToDate exige source identique, pipelineVersion et fichier présent', () => {
    const entry = { key: item().key, sourceSha256: item().sourceSha256, pipelineVersion: 1 };
    assert.equal(isUpToDate(entry, item(), 1, true), true);
    assert.equal(isUpToDate(entry, item(), 2, true), false);
    assert.equal(isUpToDate(entry, item({ sourceSha256: 'different' }), 1, true), false);
    assert.equal(isUpToDate(entry, item(), 1, false), false);
    assert.equal(isUpToDate(undefined, item(), 1, true), false);
});

test('glbStats lit draw calls, triangles et joints', () => {
    const buffer = makeGlb({
        meshes: [{ primitives: [{ indices: 0 }, { indices: 1 }] }],
        accessors: [{ count: 9 }, { count: 6 }],
        skins: [{ joints: [1, 2, 3] }],
    });
    assert.deepEqual(glbStats(buffer), { drawCalls: 2, triangles: 5, joints: 3, images: 0, materials: 0 });
    assert.throws(() => glbStats(Buffer.from('nope')), /GLB/);
});

test('writeJsonAtomic écrit puis readManifest relit', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'build-glb-'));
    try {
        const file = path.join(dir, 'manifest.json');
        writeJsonAtomic(file, { version: 1, items: [] });
        assert.deepEqual(readManifest(file), { version: 1, items: [] });
        assert.equal(readManifest(path.join(dir, 'absent.json')), null);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('writeJsonAtomic ne laisse aucun temporaire après succès', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'build-glb-'));
    try {
        const file = path.join(dir, 'manifest.json');
        writeJsonAtomic(file, { version: 1, items: [] });
        assert.deepEqual(readdirSync(dir), ['manifest.json']);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('writeJsonAtomic laisse l ancien manifeste intact si la sérialisation échoue', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'build-glb-'));
    try {
        const file = path.join(dir, 'manifest.json');
        writeFileSync(file, '{"version":1,"items":[{"key":"old"}]}', 'utf8');
        const before = readFileSync(file, 'utf8');
        const circular = {};
        circular.self = circular;

        assert.throws(() => writeJsonAtomic(file, circular), /circular/i);
        assert.equal(readFileSync(file, 'utf8'), before);
        assert.deepEqual(readdirSync(dir), ['manifest.json']);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('catalogKey ignore le prix', () => {
    assert.equal(catalogKey('Men_accessory_Sudowoodo'), 'Men_accessory_Sudowoodo');
    assert.equal(catalogKey('Men_accessory_Sudowoodo_600.fbx'), 'Men_accessory_Sudowoodo');
    assert.equal(catalogKey('Women_body_Casual2_0'), 'Women_body_Casual2');
    assert.equal(catalogKey('Bar.fbx'), null);
});

test('mergeManifestEntries replaceKeys retire l’ancienne variante', () => {
    const existing = {
        items: [
            { key: 'acc/men/Men_accessory_Sudowoodo', sourceId: 'Men_accessory_Sudowoodo' },
            { key: 'other/key', sha256: 'keep' },
        ],
    };
    const produced = [{
        key: 'acc/men/Men_accessory_Sudowoodo_600',
        sourceId: 'Men_accessory_Sudowoodo_600',
    }];

    const merged = mergeManifestEntries({
        existing,
        produced,
        pipelineVersion: 1,
        replaceKeys: new Set(['Men_accessory_Sudowoodo']),
    });

    assert.deepEqual(
        merged.items.map((entry) => entry.key),
        ['acc/men/Men_accessory_Sudowoodo_600', 'other/key'],
    );
});

test('mergeManifestEntries conserve l’article courant déjà à jour', () => {
    const existing = {
        items: [
            { key: 'acc/men/Men_accessory_Sudowoodo', sourceId: 'Men_accessory_Sudowoodo' },
            { key: 'acc/men/Men_accessory_Sudowoodo_600', sourceId: 'Men_accessory_Sudowoodo_600' },
        ],
    };

    const merged = mergeManifestEntries({
        existing,
        produced: [],
        pipelineVersion: 1,
        replaceKeys: new Set(['Men_accessory_Sudowoodo']),
        keepSourceIds: new Set(['Men_accessory_Sudowoodo_600']),
    });

    assert.deepEqual(
        merged.items.map((entry) => entry.sourceId),
        ['Men_accessory_Sudowoodo_600'],
    );
});

test('mergeManifestEntries conserve les entrées non produites', () => {
    const existing = { items: [{ key: 'a', sha256: 'old-a' }, { key: 'b', sha256: 'keep-b' }] };
    const merged = mergeManifestEntries({ existing, produced: [{ key: 'a', sha256: 'new-a' }], pipelineVersion: 1 });
    assert.deepEqual(merged.items.map((entry) => [entry.key, entry.sha256]), [['a', 'new-a'], ['b', 'keep-b']]);
});

test('publishEntries avec --only préserve les autres entrées', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'build-glb-'));
    try {
        const manifestPath = path.join(dir, 'manifest.json');
        const existing = { version: 1, pipelineVersion: 1, items: [{ key: 'other/key', sha256: 'keep', pipelineVersion: 1 }] };
        writeJsonAtomic(manifestPath, existing);
        const results = await publishEntries({
            items: [item()],
            outDir: dir,
            manifestPath,
            existing,
            pipelineVersion: 1,
            convert: async (ids) => new Map(ids.map((id) => [id, { base64: Buffer.from('fake').toString('base64'), bbox: { min: [0, 0, 0], max: [1, 1, 1] } }])),
            publish: async (buffer, target) => {
                mkdirSync(path.dirname(target), { recursive: true });
                writeFileSync(target, buffer);
                return { drawCalls: 1, triangles: 1, joints: 0, images: 0 };
            },
        });
        assert.equal(results.built, 1);
        const manifest = readManifest(manifestPath);
        assert.deepEqual(manifest.items.map((entry) => entry.key).sort(), ['men/head/Men_head_Casual_0', 'other/key']);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('un échec de publication laisse le manifeste intact', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'build-glb-'));
    try {
        const manifestPath = path.join(dir, 'manifest.json');
        writeJsonAtomic(manifestPath, { version: 1, pipelineVersion: 1, items: [{ key: 'old', sha256: 'unchanged' }] });
        const before = readFileSync(manifestPath, 'utf8');
        await assert.rejects(
            publishEntries({
                items: [item()],
                outDir: dir,
                manifestPath,
                existing: readManifest(manifestPath),
                pipelineVersion: 1,
                convert: async (ids) => new Map(ids.map((id) => [id, { base64: Buffer.from('fake').toString('base64'), bbox: { min: [0, 0, 0], max: [1, 1, 1] } }])),
                publish: async () => {
                    throw new Error('échec simulé de publication');
                },
            }),
            /échec simulé/,
        );
        assert.equal(readFileSync(manifestPath, 'utf8'), before);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('idempotence : une entrée à jour est ignorée', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'build-glb-'));
    try {
        const manifestPath = path.join(dir, 'manifest.json');
        const relPath = targetRelPath(item());
        const target = path.join(dir, relPath);
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, 'existing');
        const existing = { version: 1, pipelineVersion: 1, items: [{ key: item().key, sourceSha256: item().sourceSha256, pipelineVersion: 1, sha256: 'x' }] };
        writeJsonAtomic(manifestPath, existing);
        let converted = 0;
        const results = await publishEntries({
            items: [item()],
            outDir: dir,
            manifestPath,
            existing,
            pipelineVersion: 1,
            convert: async () => { converted += 1; return new Map(); },
            publish: async () => { throw new Error('ne doit pas publier'); },
        });
        assert.equal(results.built, 0);
        assert.equal(results.skipped, 1);
        assert.equal(converted, 0);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('mergeManifestEntries conserve la vignette quand le GLB est identique', () => {
    const thumbnail = {
        url: '/models/glb/v1/thumbs/Men/Men_head_Casual_0.1234abcd.webp',
        sha256: 'a'.repeat(64),
        bytes: 1234,
        width: 192,
        height: 192,
    };
    const existing = {
        items: [{ key: 'men/head/Men_head_Casual_0', sourceSha256: 'same', thumbnail }],
    };
    const produced = [{ key: 'men/head/Men_head_Casual_0', sourceSha256: 'same', sha256: 'new' }];

    const merged = mergeManifestEntries({ existing, produced, pipelineVersion: 1 });

    assert.deepEqual(merged.items[0].thumbnail, thumbnail);
});

test('mergeManifestEntries retire la vignette quand le GLB change', () => {
    const existing = {
        items: [{
            key: 'men/head/Men_head_Casual_0',
            sourceSha256: 'old',
            thumbnail: {
                url: '/models/glb/v1/thumbs/Men/Men_head_Casual_0.1234abcd.webp',
                sha256: 'a'.repeat(64),
                bytes: 1234,
                width: 192,
                height: 192,
            },
        }],
    };
    const produced = [{ key: 'men/head/Men_head_Casual_0', sourceSha256: 'new', sha256: 'new' }];

    const merged = mergeManifestEntries({ existing, produced, pipelineVersion: 1 });

    assert.equal(merged.items[0].thumbnail, undefined);
});
