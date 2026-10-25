import { FBXLoader } from 'three-stdlib';
import type { Group, LoadingManager } from 'three';
import { recordModelDecode } from './modelTelemetry';

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
        loader.load(url, resolve, onProgress, reject);
    });
}
