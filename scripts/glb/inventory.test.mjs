import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
    buildInventory,
    classifyFbx,
    findMissingReferencedIds,
    MODELS_SRC_DIR,
    EXPECTED_TOTAL,
    EXPECTED_PIECES,
    EXPECTED_ACCESSORIES,
    EXPECTED_DECORS,
} from './inventory.mjs';

function withTempDir(names, fn) {
    const dir = mkdtempSync(path.join(tmpdir(), 'glb-inventory-'));
    try {
        for (const name of names) writeFileSync(path.join(dir, name), name);
        return fn(dir);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

test('classifyFbx classe pièces, accessoires et décors', () => {
    assert.deepEqual(classifyFbx('Men_head_Adventurer_150.fbx'), {
        kind: 'piece',
        key: 'men/head/Men_head_Adventurer_150',
        sourceId: 'Men_head_Adventurer_150',
        gender: 'Men',
        slot: 'head',
        decor: null,
    });
    assert.equal(classifyFbx('Women_feet_Worker_0.fbx').key, 'women/feet/Women_feet_Worker_0');
    assert.equal(classifyFbx('Men_accessory_Beer_500.fbx').key, 'acc/men/Men_accessory_Beer_500');
    assert.equal(classifyFbx('Men_accessory_Sudowoodo.fbx').key, 'acc/men/Men_accessory_Sudowoodo');
    assert.equal(classifyFbx('Bar.fbx').key, 'decor/bar');
    assert.equal(classifyFbx('Swimming_pool.fbx').key, 'decor/piscine');
    assert.equal(classifyFbx('Floaty_Island.fbx').key, 'decor/dodo');
});

test('classifyFbx rejette un FBX non classable', () => {
    assert.throws(() => classifyFbx('SomethingElse.fbx'), /non classable/);
    assert.throws(() => classifyFbx('Men_head_Adventurer_150.glb'), /Not an FBX/);
});

test('buildInventory exclut Animations.fbx et signale les non classables', () => {
    withTempDir(['Animations.fbx', 'Men_head_Adventurer_150.fbx', 'Weird.fbx', 'Men_head_Adventurer_150.fbx.gz'], (dir) => {
        const inv = buildInventory({ dir });
        assert.equal(inv.items.length, 1);
        assert.equal(inv.items[0].sourceId, 'Men_head_Adventurer_150');
        assert.deepEqual(inv.unclassified.map((u) => u.source), ['Weird.fbx']);
    });
});

test('buildInventory produit des clés uniques', () => {
    withTempDir(['Men_head_A.fbx', 'Women_head_A.fbx', 'Men_accessory_A.fbx', 'Women_accessory_A.fbx', 'Bar.fbx'], (dir) => {
        const inv = buildInventory({ dir });
        assert.equal(new Set(inv.items.map((i) => i.key)).size, inv.items.length);
        assert.equal(inv.counts.piece, 2);
        assert.equal(inv.counts.accessory, 2);
        assert.equal(inv.counts.decor, 1);
    });
});

test('findMissingReferencedIds remonte les sources absentes', () => {
    const inventory = { items: [{ sourceId: 'Men_head_A' }, { sourceId: 'Women_body_B' }] };
    assert.deepEqual(findMissingReferencedIds(inventory, ['Men_head_A', 'Women_body_B', 'none', null, 'Men_head_C']), ['Men_head_C']);
    assert.deepEqual(findMissingReferencedIds(inventory, ['Men_head_A.fbx']), []);
});

test('l\'inventaire réel de ce checkout respecte les comptes attendus', () => {
    const inv = buildInventory({ dir: MODELS_SRC_DIR });
    assert.equal(inv.unclassified.length, 0, `non classables: ${JSON.stringify(inv.unclassified)}`);
    assert.equal(inv.counts.total, EXPECTED_TOTAL);
    assert.equal(inv.counts.piece, EXPECTED_PIECES);
    assert.equal(inv.counts.accessory, EXPECTED_ACCESSORIES);
    assert.equal(inv.counts.decor, EXPECTED_DECORS);
    assert.equal(new Set(inv.items.map((i) => i.key)).size, EXPECTED_TOTAL);
    const accessories = inv.items.filter((i) => i.kind === 'accessory');
    assert.equal(accessories.length, 74);
    assert.ok(inv.items.some((i) => i.sourceId === 'Men_accessory_Sudowoodo'));
    assert.ok(inv.items.some((i) => i.sourceId === 'Men_accessory_McLaren_5000'));
    assert.ok(!inv.items.some((i) => i.sourceId === 'Animations'));
});
