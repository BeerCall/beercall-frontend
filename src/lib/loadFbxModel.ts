import { FBXLoader } from 'three-stdlib';
import { FileLoader, LoaderUtils, type Group, type LoadingManager } from 'three';
import { recordModelDecode } from './modelTelemetry';

export async function sha256Hex(bytes: BufferSource): Promise<string | null> {
    if (!globalThis.crypto?.subtle) return null;
    try {
        const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    } catch {
        // Hashing is optional: a model must still load on restricted origins.
        return null;
    }
}

export function loadFbxModel(url: string, manager: LoadingManager, resourcePath: string,
                             onProgress?: (event: ProgressEvent) => void): Promise<Group> {
    return new Promise((resolve, reject) => {
        const loader = new FBXLoader(manager).setResourcePath(resourcePath);
        const parse = loader.parse.bind(loader);
        loader.parse = (data, path) => {
            const started = performance.now();
            const group = parse(data, path);
            recordModelDecode({ format: 'fbx', bytes: typeof data === 'string' ? new TextEncoder().encode(data).byteLength : data.byteLength,
                durationMs: performance.now() - started });
            return group;
        };
        const path = loader.path === '' ? LoaderUtils.extractUrlBase(url) : loader.path;
        const request = new FileLoader(manager).setPath(loader.path).setResponseType('arraybuffer')
            .setRequestHeader(loader.requestHeader).setWithCredentials(loader.withCredentials);
        request.load(url, async buffer => {
            try {
                const bytes = buffer as ArrayBuffer;
                const sha256 = await sha256Hex(bytes);
                const group = loader.parse(bytes, path);
                if (sha256 !== null) group.userData.beercallSourceSha256 = sha256;
                resolve(group);
            } catch (error) {
                reject(error);
                manager.itemError(url);
            }
        }, onProgress, reject);
    });
}
