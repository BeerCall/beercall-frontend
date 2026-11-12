#!/usr/bin/env node
/**
 * Vignettes des animations — une par clip et par genre, sur Casual_0, de face.
 *
 * - L'instant clé est l'écart maximal à Idle (somme des écarts angulaires des
 *   quaternions + distances des translations), calculé une fois par clip.
 * - Le cadrage est commun à toutes les vignettes : centré sur Idle, élargi au
 *   maximum des poses clés (choix B).
 * - Rendu 256×256 transparent par le serveur existant, publication WebP 192
 *   q85, puis `animations:export` remplit le manifeste v2.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import { Box3, Quaternion, Vector3 } from 'three';

import { createRendererServer } from '../tools/avatar-renderer/server.mjs';
import { reconstructClip, runCli } from './export-animations.mjs';
import { checkAnimations } from './check-animations.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ANIMATIONS_DIR = path.resolve(HERE, '../public/animations');
const MANIFEST_PATH = path.join(ANIMATIONS_DIR, 'manifest.json');
const THUMBNAILS_DIR = path.join(ANIMATIONS_DIR, 'thumbnails');
const DIST_ENTRY = path.resolve(HERE, '../.renderer-dist/render.html');

export const ANIMATION_THUMBNAIL_SIZE = 192;
export const ANIMATION_THUMBNAIL_MARGIN = 1.15;
const GENDERS = ['Men', 'Women'];
const COARSE_SAMPLES = 240;
const REFINE_SAMPLES = 30;

function parseArgs(argv) {
    const options = { only: [] };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--only') {
            const value = argv[index + 1];
            if (!value) throw new Error('--only attend une liste de noms de clips séparés par des virgules.');
            options.only = value.split(',').map((name) => name.trim()).filter(Boolean);
            index += 1;
            continue;
        }
        throw new Error(`Argument inconnu : ${arg}`);
    }
    return options;
}

function sampleTrack(track, time) {
    const stride = track.ValueTypeName === 'quaternion' ? 4 : 3;
    const times = track.times;
    const values = track.values;
    if (times.length === 1 || time <= times[0]) {
        return Array.from(values.slice(0, stride));
    }
    const last = times.length - 1;
    if (time >= times[last]) {
        const offset = last * stride;
        return Array.from(values.slice(offset, offset + stride));
    }
    let hi = 1;
    while (times[hi] < time) hi += 1;
    const lo = hi - 1;
    const span = times[hi] - times[lo];
    const alpha = span > 0 ? (time - times[lo]) / span : 0;
    if (stride === 3) {
        return [0, 1, 2].map((component) => values[lo * 3 + component]
            + (values[hi * 3 + component] - values[lo * 3 + component]) * alpha);
    }
    const a = new Quaternion(
        values[lo * 4], values[lo * 4 + 1], values[lo * 4 + 2], values[lo * 4 + 3],
    );
    const b = new Quaternion(
        values[hi * 4], values[hi * 4 + 1], values[hi * 4 + 2], values[hi * 4 + 3],
    );
    a.slerp(b, alpha);
    return [a.x, a.y, a.z, a.w];
}

function poseDistance(clip, idleClip, time, idleTracks) {
    const idleTime = idleClip.duration > 0 ? time % idleClip.duration : 0;
    let score = 0;
    for (const track of clip.tracks) {
        const idleTrack = idleTracks.get(track.name);
        if (!idleTrack) continue;
        const current = sampleTrack(track, time);
        const reference = sampleTrack(idleTrack, idleTime);
        if (track.ValueTypeName === 'quaternion') {
            const dot = Math.abs(
                current[0] * reference[0]
                + current[1] * reference[1]
                + current[2] * reference[2]
                + current[3] * reference[3],
            );
            score += 2 * Math.acos(Math.min(1, dot));
        } else {
            score += Math.hypot(
                current[0] - reference[0],
                current[1] - reference[1],
                current[2] - reference[2],
            );
        }
    }
    return score;
}

/** Instant où l'écart de pose à Idle est maximal. Idle est la référence à t=0. */
export function computeKeyTime(clip, idleClip, options = {}) {
    if (clip.name === 'Idle' || clip.duration <= 0) return 0;
    const coarseSamples = Math.max(2, options.coarseSamples ?? COARSE_SAMPLES);
    const refineSamples = Math.max(1, options.refineSamples ?? REFINE_SAMPLES);
    const idleTracks = new Map(idleClip.tracks.map((track) => [track.name, track]));

    let bestTime = 0;
    let bestScore = -Infinity;
    for (let index = 0; index <= coarseSamples; index += 1) {
        const time = (clip.duration * index) / coarseSamples;
        const score = poseDistance(clip, idleClip, time, idleTracks);
        if (score > bestScore) {
            bestScore = score;
            bestTime = time;
        }
    }

    const step = clip.duration / coarseSamples;
    const start = Math.max(0, bestTime - step);
    const end = Math.min(clip.duration, bestTime + step);
    for (let index = 0; index <= refineSamples; index += 1) {
        const time = start + ((end - start) * index) / refineSamples;
        const score = poseDistance(clip, idleClip, time, idleTracks);
        if (score > bestScore) {
            bestScore = score;
            bestTime = time;
        }
    }
    return bestTime;
}

function boxFromArray(values) {
    if (!Array.isArray(values) || values.length !== 6) {
        throw new Error('Bornes de rendu invalides (6 nombres attendus).');
    }
    return new Box3(
        new Vector3(values[0], values[1], values[2]),
        new Vector3(values[3], values[4], values[5]),
    );
}

/** Cadrage carré commun : centre Idle, demi-étendue maximale des poses clés. */
export function computeCommonFrame(idleBounds, clipBounds, margin = ANIMATION_THUMBNAIL_MARGIN) {
    if (idleBounds.length === 0 || clipBounds.length === 0) {
        throw new Error('Bornes insuffisantes pour calculer le cadrage commun.');
    }
    const idleUnion = new Box3();
    for (const bounds of idleBounds) idleUnion.union(bounds);
    const clipUnion = new Box3();
    for (const bounds of clipBounds) clipUnion.union(bounds);

    const center = idleUnion.getCenter(new Vector3());
    const idleHalfHeight = (idleUnion.max.y - idleUnion.min.y) / 2;
    const requiredHalf = Math.max(
        idleHalfHeight,
        Math.abs(clipUnion.min.x - center.x),
        Math.abs(clipUnion.max.x - center.x),
        Math.abs(clipUnion.min.y - center.y),
        Math.abs(clipUnion.max.y - center.y),
    );
    const extent = Math.max(1e-6, 2 * requiredHalf * margin);
    return { center: [center.x, center.y, center.z], extent };
}

async function postJson(baseUrl, pathname, body) {
    const response = await fetch(`${baseUrl}${pathname}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error(`${pathname} : HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
    }
    return response.json();
}

function writeAtomic(filePath, buffer) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    const staged = `${filePath}.tmp-${process.pid}`;
    try {
        writeFileSync(staged, buffer);
        renameSync(staged, filePath);
    } finally {
        rmSync(staged, { force: true });
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    const idlePack = JSON.parse(readFileSync(path.join(ANIMATIONS_DIR, manifest.critical.file), 'utf8'));
    const deferredPack = JSON.parse(readFileSync(path.join(ANIMATIONS_DIR, manifest.deferred.file), 'utf8'));
    const idleClip = reconstructClip(idlePack.clips[0]);
    const clips = new Map();
    for (const serialized of [...idlePack.clips, ...deferredPack.clips]) {
        clips.set(serialized.name, reconstructClip(serialized));
    }

    let targets = manifest.clips;
    if (options.only.length > 0) {
        const requested = new Set(options.only);
        for (const name of requested) {
            if (!manifest.clips.some((clip) => clip.name === name)) {
                throw new Error(`Clip introuvable dans le manifeste : ${name}`);
            }
        }
        targets = manifest.clips.filter((clip) => requested.has(clip.name));
    }

    const keyTimes = new Map();
    for (const entry of targets) {
        const clip = clips.get(entry.name);
        if (!clip) throw new Error(`Clip ${entry.name} absent des packs.`);
        keyTimes.set(entry.name, computeKeyTime(clip, idleClip));
    }

    let instance = null;
    let baseUrl = process.env.RENDERER_URL?.replace(/\/$/, '') ?? '';
    const startedAt = Date.now();

    try {
        if (!baseUrl) {
            if (!existsSync(DIST_ENTRY)) {
                throw new Error('Renderer non compilé : lancez npm run renderer:build avant animations:thumbnails.');
            }
            const port = Number(process.env.ANIMATION_THUMBNAIL_RENDERER_PORT || 8792);
            instance = createRendererServer({ port, host: '127.0.0.1' });
            await instance.start();
            baseUrl = `http://127.0.0.1:${port}`;
        }

        const idleBounds = [];
        const clipBounds = [];
        for (const entry of targets) {
            for (const gender of GENDERS) {
                const result = await postJson(baseUrl, '/animation-thumbnail/bounds', {
                    clipName: entry.name,
                    gender,
                    keyTime: keyTimes.get(entry.name),
                });
                idleBounds.push(boxFromArray(result.idle));
                clipBounds.push(boxFromArray(result.clip));
            }
        }
        const frame = computeCommonFrame(idleBounds, clipBounds);

        const rendered = [];
        for (const entry of targets) {
            for (const gender of GENDERS) {
                const data = await postJson(baseUrl, '/animation-thumbnail/render', {
                    clipName: entry.name,
                    gender,
                    keyTime: keyTimes.get(entry.name),
                    center: frame.center,
                    extent: frame.extent,
                });
                const buffer = Buffer.from(data.webp, 'base64');
                if (data.bytes !== buffer.length) {
                    throw new Error(`Vignette ${entry.name}/${gender} : ${data.bytes} octets annoncés, ${buffer.length} reçus.`);
                }
                if (data.width !== ANIMATION_THUMBNAIL_SIZE || data.height !== ANIMATION_THUMBNAIL_SIZE) {
                    throw new Error(`Vignette ${entry.name}/${gender} : dimensions ${data.width}x${data.height}.`);
                }
                const meta = await sharp(buffer).metadata();
                if (meta.width !== ANIMATION_THUMBNAIL_SIZE || meta.height !== ANIMATION_THUMBNAIL_SIZE || !meta.hasAlpha) {
                    throw new Error(`Vignette ${entry.name}/${gender} : WebP 192 transparent attendu.`);
                }

                const fileName = `${entry.id}_${gender}.webp`;
                writeAtomic(path.join(THUMBNAILS_DIR, fileName), buffer);
                rendered.push({
                    entry,
                    gender,
                    fileName,
                    sha256: createHash('sha256').update(buffer).digest('hex'),
                    bytes: buffer.length,
                });
                if (rendered.length % 10 === 0 || rendered.length === targets.length * GENDERS.length) {
                    console.log(`[animation-thumbnails] ${rendered.length}/${targets.length * GENDERS.length}`);
                }
            }
        }

        const partial = targets.length !== manifest.clips.length;
        let check = null;
        if (!partial) {
            // Le manifeste reste la source : l'export relit les WebP écrits et
            // remplit thumbnail {url, sha256, bytes, width, height}.
            await runCli([]);
            check = await checkAnimations();
        }

        const keyTimesReport = targets.map((entry) => ({
            name: entry.name,
            keyTime: Number(keyTimes.get(entry.name).toFixed(3)),
        }));
        const totalBytes = rendered.reduce((sum, item) => sum + item.bytes, 0);
        console.log(JSON.stringify({
            generated: rendered.length,
            partial,
            totalBytes,
            frame,
            keyTimes: keyTimesReport,
            fillMin: check?.fillMin ?? null,
            fillMax: check?.fillMax ?? null,
            durationMs: Date.now() - startedAt,
        }, null, 2));
    } finally {
        if (instance) await instance.stop();
    }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
