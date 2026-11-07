import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
    GLTFLoader: class {
        setMeshoptDecoder() { /* décodage non exercé ici */ }
        parseAsync() { return Promise.resolve({scene: {name: 'fixture'}}); }
    },
}));
vi.mock('three/addons/libs/meshopt_decoder.module.js', () => ({MeshoptDecoder: {}}));
vi.mock('three/addons/utils/SkeletonUtils.js', () => ({clone: (value: unknown) => value}));

import { clearGlbCache, loadGlb } from '../avatar/glb/loadGlb';

describe('cache GLB partagé (8h-3)', () => {
    beforeEach(() => {
        clearGlbCache();
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
            ok: true,
            status: 200,
            arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        })));
    });
    afterEach(() => {
        clearGlbCache();
        vi.unstubAllGlobals();
    });

    it('ne télécharge qu’une fois un GLB demandé en parallèle par le préchargement et le monde', async () => {
        const [preloaded, opened] = await Promise.all([
            loadGlb('/models/glb/v1/decors/_/Bar.93485c6c.glb'),
            loadGlb('/models/glb/v1/decors/_/Bar.93485c6c.glb'),
        ]);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(preloaded).toBe(opened);
    });

    it('retire un échec du cache pour autoriser le rejeu visible', async () => {
        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce({ok: false, status: 503, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0))})
            .mockResolvedValueOnce({ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8))}));
        await expect(loadGlb('/models/glb/v1/men/head/Men_head_Casual_0.glb')).rejects.toThrow(/HTTP 503/);
        await expect(loadGlb('/models/glb/v1/men/head/Men_head_Casual_0.glb')).resolves.toBeTruthy();
        expect(fetch).toHaveBeenCalledTimes(2);
    });
});
