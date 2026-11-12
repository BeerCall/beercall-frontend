import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
    ACCEPTANCE_SOURCES,
    DEFAULT_STAGING_DIR,
    convertSources,
    parseConvertArgs,
    selectSources,
} from './convert.mjs';
import { buildInventory } from './inventory.mjs';

test('parseConvertArgs lit --only / --out / --all', () => {
    assert.deepEqual(parseConvertArgs([]), { only: [], out: DEFAULT_STAGING_DIR, all: false });
    const parsed = parseConvertArgs(['--only', 'Bar,Men_head_Casual_0', '--out', 'C:\\tmp\\out']);
    assert.deepEqual(parsed.only, ['Bar', 'Men_head_Casual_0']);
    assert.equal(parsed.out, path.resolve('C:\\tmp\\out'));
    assert.equal(parseConvertArgs(['--only=Bar']).only[0], 'Bar');
    assert.equal(parseConvertArgs(['--all']).all, true);
});

test('selectSources refuse une source hors catalogue', () => {
    const inventory = { items: [{ sourceId: 'Bar' }, { sourceId: 'Men_head_Casual_0' }] };
    assert.deepEqual(selectSources(inventory, { only: ['Bar'] }).map((i) => i.sourceId), ['Bar']);
    assert.throws(() => selectSources(inventory, { only: ['Nope'] }), /hors catalogue/);
});

test('les sources du smoke appartiennent au catalogue', () => {
    const inventory = buildInventory({ hash: false });
    assert.doesNotThrow(() => selectSources(inventory, { only: ACCEPTANCE_SOURCES }));
});

test('conversion réelle des fixtures A03 (Chromium)', async () => {
    mkdirSync(DEFAULT_STAGING_DIR, { recursive: true });
    const { results } = await convertSources({
        sources: ACCEPTANCE_SOURCES,
        onResult: (result) => {
            writeFileSync(path.join(DEFAULT_STAGING_DIR, `${result.sourceId}.glb`), Buffer.from(result.base64, 'base64'));
        },
    });
    assert.equal(results.length, ACCEPTANCE_SOURCES.length);
    for (const result of results) {
        assert.ok(result.bytes > 0, `${result.sourceId}: GLB vide`);
        assert.ok(result.stats.meshes >= 1, `${result.sourceId}: aucun mesh`);
        assert.equal(result.stats.missingTextures, 0, `${result.sourceId}: textures manquantes`);
        assert.ok(result.bbox, `${result.sourceId}: bbox absente`);
        for (const value of [...result.bbox.min, ...result.bbox.max]) {
            assert.ok(Number.isFinite(value), `${result.sourceId}: bbox non finie`);
        }
        assert.equal(result.verified.decodedTextures, result.verified.textures, `${result.sourceId}: texture non décodée`);
    }
    // Deux sources riggées et trois décors parmi les fixtures.
    const rigged = results.find((r) => r.sourceId === 'Men_head_Casual_0');
    assert.ok(rigged.stats.skinned >= 1, 'la tête Men doit être skinnée');
    const decors = results.filter((r) => ['Bar', 'Swimming_pool', 'Floaty_Island'].includes(r.sourceId));
    assert.equal(decors.length, 3);
});
