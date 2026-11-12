#!/usr/bin/env node
/**
 * A17 — Test de fumée réel du renderer d'avatar (Playwright / Chromium).
 *
 * Échantillonne 6 tenues réelles du catalogue (homme, femme, avec Beer, Backpack,
 * McLaren large, et accessoire tourné). Contrôle dimensions, alpha, couverture et marges.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT_DIR = path.resolve(HERE, '../../../../.opencode/plan/beercall/runs/A17/samples');

export const FIXTURES = [
    {
        id: 'men-casual',
        config: {
            gender: 'Men',
            head: 'Men_head_Casual_0',
            body: 'Men_body_Casual_0',
            legs: 'Men_legs_Casual_0',
            feet: 'Men_feet_Casual_0',
            accessory: 'none',
        },
        hash: '0123456789abcdef',
    },
    {
        id: 'women-casual',
        config: {
            gender: 'Women',
            head: 'Women_head_Casual_0',
            body: 'Women_body_Casual_0',
            legs: 'Women_legs_Casual_0',
            feet: 'Women_feet_Casual_0',
            accessory: 'none',
        },
        hash: '1234567890abcdef',
    },
    {
        id: 'men-beer',
        config: {
            gender: 'Men',
            head: 'Men_head_Casual_0',
            body: 'Men_body_Casual_0',
            legs: 'Men_legs_Casual_0',
            feet: 'Men_feet_Casual_0',
            accessory: 'Men_accessory_Beer_500',
        },
        hash: '2345678901abcdef',
    },
    {
        id: 'men-backpack',
        config: {
            gender: 'Men',
            head: 'Men_head_Casual_0',
            body: 'Men_body_Casual_0',
            legs: 'Men_legs_Casual_0',
            feet: 'Men_feet_Casual_0',
            accessory: 'Men_accessory_Backpack_0',
        },
        hash: '3456789012abcdef',
    },
    {
        id: 'men-mclaren',
        config: {
            gender: 'Men',
            head: 'Men_head_Casual_0',
            body: 'Men_body_Casual_0',
            legs: 'Men_legs_Casual_0',
            feet: 'Men_feet_Casual_0',
            accessory: 'Men_accessory_McLaren_5000',
        },
        hash: '4567890123abcdef',
    },
    {
        id: 'men-pikachu-rotated',
        config: {
            gender: 'Men',
            head: 'Men_head_Casual_0',
            body: 'Men_body_Casual_0',
            legs: 'Men_legs_Casual_0',
            feet: 'Men_feet_Casual_0',
            accessory: 'Men_accessory_Pikachu_2000',
        },
        hash: '5678901234abcdef',
    },
];

async function inspectImage(buffer, expectedWidth, expectedHeight, minCoveragePercent, checkMargins = false) {
    const img = sharp(buffer);
    const meta = await img.metadata();

    if (meta.width !== expectedWidth || meta.height !== expectedHeight) {
        throw new Error(`Dimensions incorrectes : ${meta.width}x${meta.height} (attendu ${expectedWidth}x${expectedHeight})`);
    }
    if (!meta.hasAlpha) {
        throw new Error('Canal alpha transparent manquant');
    }

    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    let nonTransparentPixels = 0;
    let minX = info.width, maxX = 0, minY = info.height, maxY = 0;

    for (let y = 0; y < info.height; y += 1) {
        for (let x = 0; x < info.width; x += 1) {
            const idx = (y * info.width + x) * info.channels;
            const alpha = data[idx + 3];
            if (alpha > 10) {
                nonTransparentPixels += 1;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }

    const totalPixels = info.width * info.height;
    const coverage = (nonTransparentPixels / totalPixels) * 100;

    if (coverage < minCoveragePercent) {
        throw new Error(`Couverture insuffisante : ${coverage.toFixed(2)} % (minimum requis : ${minCoveragePercent} %)`);
    }

    if (checkMargins) {
        // Pas de rognage : marges corps top >= 2, bottom <= height - 3, left >= 1, right <= width - 2
        if (minY < 2) throw new Error(`Rognage en haut du corps : minY=${minY} < 2`);
        if (maxY > info.height - 3) throw new Error(`Rognage en bas du corps : maxY=${maxY} > ${info.height - 3}`);
        if (minX < 1) throw new Error(`Rognage à gauche du corps : minX=${minX} < 1`);
        if (maxX > info.width - 2) throw new Error(`Rognage à droite du corps : maxX=${maxX} > ${info.width - 2}`);
    }

    return { coverage, minX, maxX, minY, maxY };
}

export async function runSmoke(options = {}) {
    const serverUrl = (options.url || 'http://127.0.0.1:8787').replace(/\/+$/, '');
    const outDir = options.out || DEFAULT_OUT_DIR;
    mkdirSync(outDir, { recursive: true });

    console.log(`[smoke] Démarrage du smoke renderer sur ${serverUrl} vers ${outDir}`);

    const results = [];
    for (const fixture of FIXTURES) {
        console.log(`[smoke] Rendu de la fixture : ${fixture.id}...`);
        const response = await fetch(`${serverUrl}/render`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config: fixture.config, hash: fixture.hash }),
        });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`Échec HTTP ${response.status} sur ${fixture.id} : ${body}`);
        }

        const data = await response.json();
        const headBuf = Buffer.from(data.head, 'base64');
        const portraitBuf = Buffer.from(data.portrait, 'base64');
        const bodyBuf = Buffer.from(data.body, 'base64');

        const fixDir = path.join(outDir, fixture.id);
        mkdirSync(fixDir, { recursive: true });
        writeFileSync(path.join(fixDir, 'head.webp'), headBuf);
        writeFileSync(path.join(fixDir, 'portrait.webp'), portraitBuf);
        writeFileSync(path.join(fixDir, 'body.webp'), bodyBuf);

        const headStats = await inspectImage(headBuf, 256, 256, 2.0);
        const portraitStats = await inspectImage(portraitBuf, 512, 512, 2.0);
        const bodyStats = await inspectImage(bodyBuf, 256, 512, 5.0, true);

        console.log(`  ✓ ${fixture.id} OK (couverture tête=${headStats.coverage.toFixed(1)}%, portrait=${portraitStats.coverage.toFixed(1)}%, corps=${bodyStats.coverage.toFixed(1)}%)`);
        results.push({ fixture: fixture.id, headStats, portraitStats, bodyStats });
    }

    console.log(`[smoke] Succès total : ${results.length} fixtures rendues et vérifiées sans rognage.`);
    return results;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
    const args = process.argv.slice(2);
    let url = 'http://127.0.0.1:8787';
    let out = DEFAULT_OUT_DIR;
    for (let i = 0; i < args.length; i += 1) {
        if (args[i] === '--url' && args[i + 1]) { url = args[i + 1]; i += 1; }
        else if (args[i].startsWith('--url=')) { url = args[i].slice('--url='.length); }
        else if (args[i] === '--out' && args[i + 1]) { out = path.resolve(args[i + 1]); i += 1; }
        else if (args[i].startsWith('--out=')) { out = path.resolve(args[i].slice('--out='.length)); }
    }

    runSmoke({ url, out }).catch((err) => {
        console.error('[smoke] ERREUR :', err);
        process.exit(1);
    });
}
