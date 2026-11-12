import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    compareBoundingBoxes,
    parseGlbHeaderAndJson,
} from './check-glb.mjs';

describe('A05 — Tests unitaires de validation du catalogue GLB', () => {
    it('compare les bounding boxes avec tolérance relative de 1 %', () => {
        const src = { min: [-50, -50, -50], max: [50, 50, 50] };
        // Diagonale = sqrt(100^2 + 100^2 + 100^2) = ~173.2. 1% = ~1.732.
        const glbValid = { min: [-50.5, -50.2, -50.1], max: [50.8, 50.4, 50.3] };
        const resValid = compareBoundingBoxes(src, glbValid, 1.0);
        assert.equal(resValid.pass, true);
        assert.ok(resValid.errorPercent < 1.0);

        // Écart supérieur à 1 %
        const glbInvalid = { min: [-55, -50, -50], max: [50, 50, 50] };
        const resInvalid = compareBoundingBoxes(src, glbInvalid, 1.0);
        assert.equal(resInvalid.pass, false);
        assert.ok(resInvalid.errorPercent > 1.0);
    });

    it('tolère les dimensions quasi-nulles ou les bboxes absentes', () => {
        assert.equal(compareBoundingBoxes(null, null).pass, true);
        const zero = { min: [0, 0, 0], max: [0, 0, 0] };
        assert.equal(compareBoundingBoxes(zero, zero).pass, true);
    });

    it('valide le header magique GLB', () => {
        const jsonStr = '{}  '; // 4 octets alignés
        const validHeader = Buffer.alloc(20 + jsonStr.length);
        validHeader.writeUInt32LE(0x46546c67, 0); // glTF
        validHeader.writeUInt32LE(2, 4);          // version 2
        validHeader.writeUInt32LE(validHeader.length, 8); // total length
        validHeader.writeUInt32LE(jsonStr.length, 12);    // chunk 0 length
        validHeader.writeUInt32LE(0x4e4f534a, 16); // JSON
        validHeader.write(jsonStr, 20);

        const parsed = parseGlbHeaderAndJson(validHeader);
        assert.equal(parsed.version, 2);
        assert.deepEqual(parsed.json, {});

        // Header invalide
        const invalidHeader = Buffer.alloc(20);
        assert.throws(() => parseGlbHeaderAndJson(invalidHeader), /Ce n'est pas un binaire GLB valide/);
    });
});
