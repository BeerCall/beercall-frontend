import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileLoader, Group, REVISION } from 'three';
import { PreparedModelLoader } from '../lib/PreparedModelLoader';

const mock = vi.hoisted(() => ({ fallback: vi.fn() }));
vi.mock('../lib/loadFbxModel', () => ({
    loadFbxModel: (url: string) => new Promise((resolve, reject) => mock.fallback(url, resolve, reject)),
}));
let caseId = 0;
afterEach(() => { vi.restoreAllMocks(); mock.fallback.mockReset(); });

function validBuffer() {
    const json = new TextEncoder().encode(JSON.stringify({ version: 1, threeRevision: REVISION,
        sourceSha256: 'b'.repeat(64), model: new Group().toJSON() }));
    const bytes = new Uint8Array(Math.ceil((12 + json.length) / 8) * 8);
    bytes.set(new TextEncoder().encode('BCMODEL1'));
    new DataView(bytes.buffer).setUint32(8, json.length, true);
    bytes.set(json, 12);
    return bytes.buffer;
}
function load(url: string) {
    return new Promise<Group>((resolve, reject) => new PreparedModelLoader().load(url, resolve, undefined, reject));
}

describe('prepared models with safe FBX fallback', () => {
    it('uses a checked prepared asset and does not fetch the original FBX', async () => {
        const buffer = validBuffer();
        const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), b => b.toString(16).padStart(2, '0')).join('');
        const base = `/models/test-${caseId++}`;
        const file = `head.${sha256}.bc3d`;
        const requested: string[] = [];
        vi.spyOn(FileLoader.prototype, 'load').mockImplementation(function (url, onLoad) {
            requested.push(String(url));
            queueMicrotask(() => onLoad?.(String(url).endsWith('manifest.json') ? {
                version: 1, threeRevision: REVISION, models: { 'head.fbx': { file, sha256, bytes: buffer.byteLength } },
            } : buffer));
            return undefined;
        });
        expect((await load(`${base}/head.fbx`)).type).toBe('Group');
        expect(requested).toEqual([`${base}/prepared/manifest.json`, `${base}/prepared/${file}`]);
        expect(mock.fallback).not.toHaveBeenCalled();
    });
    it('shares the manifest request between concurrent parts', async () => {
        const base = `/models/test-${caseId++}`;
        const spy = vi.spyOn(FileLoader.prototype, 'load').mockImplementation(function (_url, onLoad) {
            queueMicrotask(() => onLoad?.({ version: 1, threeRevision: REVISION, models: {} }));
            return undefined;
        });
        mock.fallback.mockImplementation((_url, resolve) => resolve(new Group()));
        await Promise.all([load(`${base}/head.fbx`), load(`${base}/body.fbx`)]);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(mock.fallback).toHaveBeenCalledTimes(2);
    });
    it('falls back to the unchanged FBX when preparation is unavailable', async () => {
        const base = `/models/test-${caseId++}`;
        vi.spyOn(FileLoader.prototype, 'load').mockImplementation(function (_url, _load, _progress, error) {
            queueMicrotask(() => error?.(new Error('404'))); return undefined;
        });
        mock.fallback.mockImplementation((_url, resolve) => resolve(new Group()));
        expect((await load(`${base}/head.fbx`)).type).toBe('Group');
        expect(mock.fallback.mock.calls[0][0]).toBe(`${base}/head.fbx`);
    });
    it('rejects corrupted prepared bytes and never parses them as a valid scene', async () => {
        const base = `/models/test-${caseId++}`;
        const buffer = validBuffer();
        vi.spyOn(FileLoader.prototype, 'load').mockImplementation(function (url, onLoad) {
            queueMicrotask(() => onLoad?.(String(url).endsWith('manifest.json') ? {
                version: 1, threeRevision: REVISION, models: { 'head.fbx': {
                    file: `head.${'a'.repeat(64)}.bc3d`, sha256: 'a'.repeat(64), bytes: buffer.byteLength,
                } },
            } : buffer));
            return undefined;
        });
        const fallback = new Group(); fallback.name = 'original';
        mock.fallback.mockImplementation((_url, resolve) => resolve(fallback));
        expect(await load(`${base}/head.fbx`)).toBe(fallback);
        expect(mock.fallback).toHaveBeenCalledTimes(1);
    });
    it('does not swallow a failure of both prepared and original assets', async () => {
        vi.spyOn(FileLoader.prototype, 'load').mockImplementation(function (_url, _load, _progress, error) {
            queueMicrotask(() => error?.(new Error('404'))); return undefined;
        });
        mock.fallback.mockImplementation((_url, _resolve, reject) => reject(new Error('original missing')));
        await expect(load(`/models/test-${caseId++}/head.fbx`)).rejects.toThrow('original missing');
    });
});
