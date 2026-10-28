import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { AnimationMixer, PropertyBinding, REVISION } from 'three';
import { FBXLoader } from 'three-stdlib';
import { computeThumbnailIdleEnvelope } from '../src/lib/thumbnailIdleEnvelope.ts';
import { createAnimationPackManager } from '../src/lib/animationPack.ts';

// Node 24 native type stripping; no dependency or server required. The sampling
// and the independent 240 Hz validation are exactly the production fallback's.
const directory = resolve(process.argv[2] ?? '../beercall-backend/static/models');
const target = new URL('../src/lib/thumbnailEnvelopes.generated.json', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('../public/animations/manifest.json', import.meta.url), 'utf8'));
const manager = await createAnimationPackManager(manifest,
    new Uint8Array(await readFile(new URL(`../public/animations/${manifest.critical.file}`, import.meta.url))));
const clip = await manager.getClip('Idle');
const json = clip.toJSON();
const clipKey = JSON.stringify({ name: json.name, duration: json.duration, blendMode: json.blendMode, tracks: json.tracks });
const catalog = { version: 1, threeRevision: REVISION, clip: clipKey, models: {} };
const names = (await readdir(directory)).filter(name => /^(Men|Women)_.+\.fbx$/.test(name)).sort();
globalThis.window = { innerWidth: 800, innerHeight: 600 };
const skipped = [];
for (const name of names) {
    const source = await readFile(join(directory, name));
    const hash = createHash('sha256').update(source).digest('hex');
    try {
        const root = new FBXLoader().parse(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength), '');
        // Runtime AvatarPart evaluates Idle at t=0 before framing. Starting the
        // offline measurement in the bind/T-pose would widen and shift the box.
        const applicable = clip.clone();
        applicable.tracks = clip.tracks.filter(track => {
            const { nodeName } = PropertyBinding.parseTrackName(track.name);
            return !nodeName || nodeName === root.name || root.getObjectByName(nodeName);
        });
        const mixer = new AnimationMixer(root);
        if (applicable.tracks.length) {
            mixer.clipAction(applicable).reset().play();
            mixer.update(0);
            root.updateMatrixWorld(true);
        }
        const result = computeThumbnailIdleEnvelope({ parts: [{ partKey: name, root }], clip });
        mixer.stopAllAction();
        mixer.uncacheRoot(root);
        if (!result.ok) throw new Error(`${result.reason}: ${result.details ?? ''}`);
        catalog.models[hash] = { min: result.box.min.toArray(), max: result.box.max.toArray(),
            guard: result.measuredGuard, samples: result.sampleCount };
        console.log(`${name}: ${result.cpuTimeMs.toFixed(1)} ms moved off the display path`);
    } catch (error) {
        // Texture-bearing/unsupported assets keep the exact runtime fallback.
        skipped.push({ name, reason: error.message });
    }
}
await writeFile(target, JSON.stringify(catalog) + '\n');
console.log(JSON.stringify({ models: Object.keys(catalog.models).length, skipped }));
