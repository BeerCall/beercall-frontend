import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { cpus, release } from 'node:os';
import { AnimationMixer, Box3, Group } from 'three';
import { parsePreparedModel } from '../src/lib/preparedModel.ts';
import { computeThumbnailIdleEnvelope } from '../src/lib/thumbnailIdleEnvelope.ts';
import { preparedThumbnailEnvelope } from '../src/lib/thumbnailEnvelopeCatalog.ts';
import { createAnimationPackManager } from '../src/lib/animationPack.ts';

const directory = resolve(process.argv[2] ?? '../beercall-backend/static/models');
const manifest = JSON.parse(await readFile(join(directory, 'prepared/manifest.json'), 'utf8'));
const animations = JSON.parse(await readFile(new URL('../public/animations/manifest.json', import.meta.url), 'utf8'));
const manager = await createAnimationPackManager(animations,
    new Uint8Array(await readFile(new URL(`../public/animations/${animations.critical.file}`, import.meta.url))));
const clip = await manager.getClip('Idle');
const parts = [];
for (const partKey of ['head', 'body', 'legs', 'feet']) {
    const entry = manifest.models[`Men_${partKey}_Worker_0.fbx`];
    const bytes = await readFile(join(directory, 'prepared', entry.file));
    const model = parsePreparedModel(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const root = new Group();
    root.add(model);
    const mixer = new AnimationMixer(root);
    mixer.clipAction(clip).reset().play();
    mixer.update(0);
    root.updateMatrixWorld(true);
    parts.push({ partKey, root });
}
const input = { parts, clip };
const samples = { runtime: [], prepared: [] };
// Same real models/clip, no network/GPU, one discarded warm-up for each path.
computeThumbnailIdleEnvelope(input);
preparedThumbnailEnvelope(input);
for (let run = 0; run < 10; run++) {
    let reference, prepared;
    for (const mode of run % 2 ? ['prepared', 'runtime'] : ['runtime', 'prepared']) {
        const started = performance.now();
        const result = mode === 'runtime' ? computeThumbnailIdleEnvelope(input) : preparedThumbnailEnvelope(input);
        if (!result?.ok) throw new Error(`Unavailable ${mode} envelope`);
        samples[mode].push(performance.now() - started);
        if (mode === 'runtime') reference = result;
        else prepared = result;
    }
    // Independent per-piece guards may be wider than the combined runtime guard.
    // They must still contain the actual Idle pose and remain validated at 240Hz.
    const poseBox = new Box3();
    for (const part of parts) poseBox.union(new Box3().setFromObject(part.root));
    if (!prepared.box.containsBox(poseBox)) {
        throw new Error('Prepared envelope excludes the initial Idle pose');
    }
    console.log(JSON.stringify({ run, runtimeMs: samples.runtime.at(-1), preparedMs: samples.prepared.at(-1),
        referenceBounds: [reference.box.min.toArray(), reference.box.max.toArray()],
        preparedBounds: [prepared.box.min.toArray(), prepared.box.max.toArray()] }));
}
const stats = values => {
    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const stddev = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
    return { n: values.length, median: (sorted[4] + sorted[5]) / 2, p95: sorted[9], p99: sorted[9], min: sorted[0], max: sorted[9], stddev };
};
const report = { date: new Date().toISOString(), platform: process.platform, node: process.version,
    os: release(), cpu: cpus()[0]?.model,
    scope: 'CPU framing only, hot decoded real Worker models; not iPhone end-to-end latency', samples,
    stats: { runtime: stats(samples.runtime), prepared: stats(samples.prepared) } };
if (process.argv[3]) await writeFile(resolve(process.argv[3]), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.stats));
