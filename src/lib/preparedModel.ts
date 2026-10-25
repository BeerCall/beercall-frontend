import { ObjectLoader, REVISION, type Group } from 'three';

// Three's own object format, with geometry arrays stored as aligned binary data.
// Unlike a material/mesh conversion, this preserves FBX names, bones, bind poses,
// Phong materials and the existing animation contract. Textured models stay FBX.
const MAGIC = 'BCMODEL1';
const arrays = {
    Float32Array, Float64Array, Uint32Array, Int32Array,
    Uint16Array, Int16Array, Uint8Array, Int8Array,
};
type ArrayName = keyof typeof arrays;
type JsonObject = Record<string, unknown>;

function object(value: unknown): value is JsonObject {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parsePreparedModel(buffer: ArrayBuffer): Group {
    if (buffer.byteLength < 16 || new TextDecoder().decode(new Uint8Array(buffer, 0, 8)) !== MAGIC) {
        throw new Error('Invalid prepared model header');
    }
    const jsonLength = new DataView(buffer).getUint32(8, true);
    const binaryStart = Math.ceil((12 + jsonLength) / 8) * 8;
    if (jsonLength === 0 || binaryStart > buffer.byteLength) throw new Error('Invalid prepared model size');
    const envelope: unknown = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 12, jsonLength)),
        (_key, value: unknown) => object(value) && value.$negativeZero === true && Object.keys(value).length === 1 ? -0 : value);
    if (!object(envelope) || envelope.version !== 1 || envelope.threeRevision !== REVISION ||
        typeof envelope.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(envelope.sourceSha256) ||
        !object(envelope.model)) throw new Error('Unsupported prepared model');
    const model = envelope.model;
    if (!object(model.object) || model.object.type !== 'Group' || model.images || model.textures) {
        throw new Error('Prepared model must be a texture-free Group');
    }

    function restore(value: unknown): void {
        if (Array.isArray(value)) { value.forEach(restore); return; }
        if (!object(value)) return;
        if (object(value.array) && '$offset' in value.array) {
            const type = typeof value.type === 'string' && Object.hasOwn(arrays, value.type)
                ? value.type as ArrayName : undefined;
            if (!type) throw new Error('Invalid prepared attribute type');
            const Constructor = arrays[type];
            const { $offset: offset, length } = value.array;
            if (typeof offset !== 'number' || typeof length !== 'number' ||
                !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 0 ||
                offset % Constructor.BYTES_PER_ELEMENT !== 0 ||
                binaryStart + offset + length * Constructor.BYTES_PER_ELEMENT > buffer.byteLength) {
                throw new Error('Invalid prepared attribute bounds');
            }
            value.array = new Constructor(buffer, binaryStart + offset, length);
            return;
        }
        Object.values(value).forEach(restore);
    }
    restore(model.geometries);
    const result = new ObjectLoader().parse(model);
    if (result.type !== 'Group') throw new Error('Invalid prepared model root');
    return result as Group;
}
