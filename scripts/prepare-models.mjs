import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { REVISION } from 'three';
import { FBXLoader } from 'three-stdlib';

const constructors = { Float32Array, Float64Array, Uint32Array, Int32Array, Uint16Array, Int16Array, Uint8Array, Int8Array };
const sha256 = value => createHash('sha256').update(value).digest('hex');
const align = n => Math.ceil(n / 8) * 8;

export function prepareModel(group, sourceSha256) {
    const model = group.toJSON();
    // Embedded/world textures need the FBX texture loader. Never silently drop them.
    if (model.images || model.textures) throw new Error('Textured model: keep original FBX');
    // ObjectLoader otherwise decomposes matrices back into TRS, introducing
    // rounding at every bone. Keep the original TRS components bit-for-bit.
    const transforms = new Map();
    group.traverse(node => {
        if (node.matrixAutoUpdate) transforms.set(node.uuid, {
            position: node.position.toArray(), quaternion: node.quaternion.toArray(), scale: node.scale.toArray(),
        });
    });
    function preserveTransforms(node) {
        const transform = transforms.get(node.uuid);
        if (transform) { delete node.matrix; Object.assign(node, transform); }
        node.children?.forEach(preserveTransforms);
    }
    preserveTransforms(model.object);
    const ids = new Map();
    function stableIds(value) {
        if (typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)) {
            if (!ids.has(value)) {
                const hash = sha256(`${sourceSha256}:${ids.size}`);
                ids.set(value, `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`);
            }
            return ids.get(value);
        }
        if (Array.isArray(value)) return value.map(stableIds);
        if (value && typeof value === 'object') {
            for (const key of Object.keys(value)) value[key] = stableIds(value[key]);
        }
        return value;
    }
    stableIds(model);
    const chunks = [];
    let size = 0;
    function extract(value) {
        if (Array.isArray(value)) { value.forEach(extract); return; }
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value.array) && Object.hasOwn(constructors, value.type)) {
            const data = new constructors[value.type](value.array);
            const offset = align(size);
            chunks.push({ offset, data: Buffer.from(data.buffer) });
            value.array = { $offset: offset, length: data.length };
            size = offset + data.byteLength;
            return;
        }
        Object.values(value).forEach(extract);
    }
    extract(model.geometries);
    const json = Buffer.from(JSON.stringify({ version: 1, threeRevision: REVISION, sourceSha256, model },
        (_key, value) => Object.is(value, -0) ? { $negativeZero: true } : value));
    const start = align(12 + json.length);
    const output = Buffer.alloc(start + size);
    output.write('BCMODEL1', 0, 'ascii');
    output.writeUInt32LE(json.length, 8);
    json.copy(output, 12);
    for (const chunk of chunks) chunk.data.copy(output, start + chunk.offset);
    return output;
}

export async function prepareDirectory(directory) {
    const target = join(directory, 'prepared');
    await mkdir(target, { recursive: true });
    const manifest = { version: 1, threeRevision: REVISION, models: {} };
    const skipped = [];
    let sourceBytes = 0, preparedBytes = 0, wireBytes = 0;
    for (const name of (await readdir(directory)).sort()) {
        if (!name.endsWith('.fbx') || name === 'Animations.fbx') continue;
        const source = await readFile(join(directory, name));
        // gzip originals as well, including textured worlds. Source bytes are untouched.
        await writeFile(join(directory, `${name}.gz`), gzipSync(source, { level: 9 }));
        const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
        Object.defineProperty(globalThis, 'window', { value: { innerWidth: 800, innerHeight: 600 }, configurable: true });
        try {
            const group = new FBXLoader().parse(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength), '');
            const bytes = prepareModel(group, sha256(source));
            const hash = sha256(bytes);
            const file = `${name.slice(0, -4)}.${hash}.bc3d`;
            const compressed = gzipSync(bytes, { level: 9 });
            await writeFile(join(target, file), bytes);
            await writeFile(join(target, `${file}.gz`), compressed);
            manifest.models[name] = { file, sha256: hash, bytes: bytes.length, sourceSha256: sha256(source) };
            sourceBytes += source.length; preparedBytes += bytes.length; wireBytes += compressed.length;
        } catch (error) {
            skipped.push({ name, reason: error.message });
        } finally {
            if (previous) Object.defineProperty(globalThis, 'window', previous);
            else delete globalThis.window;
        }
    }
    const text = JSON.stringify(manifest, null, 2) + '\n';
    // Manifest is written last; never publish a reference to a missing file.
    await writeFile(join(target, 'manifest.json'), text);
    await writeFile(join(target, 'manifest.json.gz'), gzipSync(text, { level: 9 }));
    const summary = { prepared: Object.keys(manifest.models).length, sourceBytes, preparedBytes, wireBytes, skipped };
    console.log(JSON.stringify(summary, null, 2));
    return { manifest, summary };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    await prepareDirectory(resolve(process.argv[2] ?? '../beercall-backend/static/models'));
}
