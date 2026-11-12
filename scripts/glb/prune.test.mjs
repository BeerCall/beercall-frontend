import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { pruneModels } from './prune.mjs';

function write(file, content = 'x') {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
}

function fixture() {
    const root = mkdtempSync(path.join(tmpdir(), 'prune-models-'));
    const models = path.join(root, 'models');
    const manifest = {
        version: 1,
        items: [
            {
                key: 'men/head/Men_head_Keep_0',
                url: '/models/glb/v1/pieces/Men/Men_head_Keep_0.keep.glb',
                source: 'Men_head_Keep_0.fbx',
                sourceId: 'Men_head_Keep_0',
                thumbnail: { url: '/models/glb/v1/thumbs/Men/Men_head_Keep_0.keep.webp' },
            },
            {
                key: 'acc/men/Men_accessory_Gone_500',
                url: '/models/glb/v1/accessories/Men/Men_accessory_Gone_500.gone.glb',
                source: 'Men_accessory_Gone_500.fbx',
                sourceId: 'Men_accessory_Gone_500',
                thumbnail: { url: '/models/glb/v1/thumbs/Men/Men_accessory_Gone_500.gone.webp' },
            },
        ],
    };
    const prepared = {
        version: 1,
        models: {
            'Men_head_Keep_0.fbx': { file: 'Men_head_Keep_0.keep.bc3d' },
            'Men_accessory_Gone_500.fbx': { file: 'Men_accessory_Gone_500.gone.bc3d' },
        },
    };
    write(path.join(models, 'glb', 'manifest.json'), JSON.stringify(manifest));
    write(path.join(models, 'prepared', 'manifest.json'), JSON.stringify(prepared));
    write(path.join(models, 'Men_head_Keep_0.fbx'));
    write(path.join(models, 'glb/v1/pieces/Men/Men_head_Keep_0.keep.glb'));
    write(path.join(models, 'glb/v1/thumbs/Men/Men_head_Keep_0.keep.webp'));
    write(path.join(models, 'prepared/Men_head_Keep_0.keep.bc3d'));
    write(path.join(models, 'glb/v1/accessories/Men/Men_accessory_Gone_500.gone.glb'));
    write(path.join(models, 'glb/v1/thumbs/Men/Men_accessory_Gone_500.gone.webp'));
    write(path.join(models, 'prepared/Men_accessory_Gone_500.gone.bc3d'));
    write(path.join(models, 'prepared/Men_accessory_Gone_500.gone.bc3d.gz'));
    return { root, models };
}

test('pruneModels retire l entree sans source, ses derives, et garde les autres', () => {
    const { root, models } = fixture();
    try {
        const result = pruneModels({ modelsDir: models });

        assert.equal(result.removed.length, 1);
        assert.equal(result.removed[0].sourceId, 'Men_accessory_Gone_500');
        assert.equal(result.kept, 1);
        assert.equal(existsSync(path.join(models, 'glb/v1/accessories/Men/Men_accessory_Gone_500.gone.glb')), false);
        assert.equal(existsSync(path.join(models, 'glb/v1/thumbs/Men/Men_accessory_Gone_500.gone.webp')), false);
        assert.equal(existsSync(path.join(models, 'prepared/Men_accessory_Gone_500.gone.bc3d')), false);
        assert.equal(existsSync(path.join(models, 'prepared/Men_accessory_Gone_500.gone.bc3d.gz')), false);
        assert.equal(existsSync(path.join(models, 'Men_head_Keep_0.fbx')), true);

        const manifest = JSON.parse(readFileSync(path.join(models, 'glb', 'manifest.json'), 'utf8'));
        assert.deepEqual(manifest.items.map((item) => item.sourceId), ['Men_head_Keep_0']);
        const prepared = JSON.parse(readFileSync(path.join(models, 'prepared', 'manifest.json'), 'utf8'));
        assert.deepEqual(Object.keys(prepared.models), ['Men_head_Keep_0.fbx']);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('pruneModels en dry-run ne supprime rien', () => {
    const { root, models } = fixture();
    try {
        const result = pruneModels({ modelsDir: models, dryRun: true });
        assert.equal(result.removed.length, 1);
        assert.equal(existsSync(path.join(models, 'glb/v1/accessories/Men/Men_accessory_Gone_500.gone.glb')), true);
        const manifest = JSON.parse(readFileSync(path.join(models, 'glb', 'manifest.json'), 'utf8'));
        assert.equal(manifest.items.length, 2);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('pruneModels conserve toutes les entrees quand toutes les sources existent', () => {
    const { root, models } = fixture();
    try {
        write(path.join(models, 'Men_accessory_Gone_500.fbx'));
        const result = pruneModels({ modelsDir: models });
        assert.equal(result.removed.length, 0);
        assert.equal(result.kept, 2);
        const manifest = JSON.parse(readFileSync(path.join(models, 'glb', 'manifest.json'), 'utf8'));
        assert.equal(manifest.items.length, 2);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
