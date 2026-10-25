import { FileLoader, Loader, REVISION, type Group, type LoadingManager } from 'three';
import { parsePreparedModel } from './preparedModel';
import { recordModelDecode } from './modelTelemetry';

interface PreparedEntry { file: string; sha256: string; bytes: number }
interface PreparedManifest { version: number; threeRevision: string; models: Record<string, PreparedEntry> }
const manifests = new Map<string, Promise<PreparedManifest | null>>();
let legacyLoader: Promise<typeof import('./loadFbxModel')> | undefined;

function manifestFor(base: string, manager: LoadingManager): Promise<PreparedManifest | null> {
    let pending = manifests.get(base);
    if (!pending) {
        pending = new Promise<PreparedManifest | null>(resolve => {
            new FileLoader(manager).setResponseType('json').load(`${base}/prepared/manifest.json`, value => {
                const manifest = value as unknown as PreparedManifest | null;
                resolve(manifest?.version === 1 && manifest.threeRevision === REVISION &&
                    manifest.models && typeof manifest.models === 'object' ? manifest : null);
            }, undefined, () => resolve(null));
        });
        manifests.set(base, pending);
    }
    return pending;
}

/** Shared by warm-up and Canvas through Fiber's loader cache. FBX fallback is lazy. */
export class PreparedModelLoader extends Loader<Group> {
    load(url: string, onLoad: (group: Group) => void, onProgress?: (event: ProgressEvent) => void,
         onError?: (error: unknown) => void): void {
        const fullUrl = this.path + url;
        const split = fullUrl.lastIndexOf('/');
        const base = fullUrl.slice(0, split);
        const name = fullUrl.slice(split + 1);
        this.manager.itemStart(fullUrl);

        const fallback = async () => {
            const { loadFbxModel } = await (legacyLoader ??= import('./loadFbxModel'));
            return loadFbxModel(fullUrl, this.manager, this.resourcePath, onProgress);
        };
        const loadPrepared = async (): Promise<Group> => {
            const entry = (await manifestFor(base, this.manager))?.models[name];
            if (!entry || !/^[a-zA-Z0-9_-]+\.[a-f0-9]{64}\.bc3d$/.test(entry.file) ||
                !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0) {
                return fallback();
            }
            try {
                const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
                    new FileLoader(this.manager).setResponseType('arraybuffer')
                        .load(`${base}/prepared/${entry.file}`, data => resolve(data as ArrayBuffer), onProgress, reject);
                });
                if (buffer.byteLength !== entry.bytes) throw new Error('Truncated prepared model');
                const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
                const hash = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
                if (hash !== entry.sha256) throw new Error('Prepared model checksum mismatch');
                const started = performance.now();
                const group = parsePreparedModel(buffer);
                recordModelDecode({ format: 'prepared', bytes: buffer.byteLength, durationMs: performance.now() - started });
                return group;
            } catch {
                return fallback();
            }
        };
        void loadPrepared().then(onLoad).catch(error => {
            this.manager.itemError(fullUrl);
            onError?.(error);
        }).finally(() => this.manager.itemEnd(fullUrl));
    }
}
