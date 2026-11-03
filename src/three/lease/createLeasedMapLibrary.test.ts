import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type maplibregl from 'maplibre-gl';

import {
    createLeasedMapLibrary,
} from './createLeasedMapLibrary';
import { LeaseController } from './leaseController';
import { resetLeaseStore } from './leaseStore';
import { type GlContext, resetWebglStats, webglStats } from './webgl';

function createMockBaseMapLib() {
    const nativeConstructorSpy = vi.fn();
    const nativeRemoveSpy = vi.fn();

    class FakeNativeMap {
        private canvas: HTMLCanvasElement;
        private context: GlContext;

        constructor(public options: maplibregl.MapOptions) {
            nativeConstructorSpy(options);
            this.canvas = document.createElement('canvas');
            let lost = false;
            this.context = {
                getExtension: vi.fn((ext: string) => {
                    if (ext === 'WEBGL_lose_context') {
                        return { loseContext: () => { lost = true; } };
                    }
                    return null;
                }),
                isContextLost: vi.fn(() => lost),
            } as unknown as GlContext;

            this.canvas.getContext = ((type: string) => {
                if (type === 'webgl2' || type === 'webgl') return this.context;
                return null;
            }) as unknown as typeof this.canvas.getContext;
        }

        getCanvas() {
            return this.canvas;
        }

        remove() {
            nativeRemoveSpy();
            return this;
        }
    }

    const fakeLib = {
        Map: FakeNativeMap as unknown as typeof maplibregl.Map,
    } as unknown as typeof maplibregl;

    return { fakeLib, nativeConstructorSpy, nativeRemoveSpy };
}

const dummyOptions = { container: document.createElement('div') } as unknown as maplibregl.MapOptions;

describe('B10c — createLeasedMapLibrary (MapLibre sous contrôle de lease)', () => {
    let controller: LeaseController;

    beforeEach(() => {
        controller = new LeaseController(500);
        controller.reset();
        resetLeaseStore();
        resetWebglStats();
    });

    afterEach(() => {
        controller.reset();
    });

    it('interdit l’appel au constructeur natif si le token est invalide ou périmé', async () => {
        const token = await controller.request('map', 'm1');
        const { fakeLib, nativeConstructorSpy } = createMockBaseMapLib();
        const leasedLib = createLeasedMapLibrary(token, fakeLib, controller);

        // Annuler ou périmer le token
        controller.reset();

        expect(() => {
            new leasedLib.Map(dummyOptions);
        }).toThrow(/Token de lease MapLibre invalide ou périmé/);

        expect(nativeConstructorSpy).not.toHaveBeenCalled();
    });

    it('tracke le canvas et attache le disposer immédiatement dans le constructeur avant tout load', async () => {
        const token = await controller.request('map', 'm1');
        const { fakeLib, nativeConstructorSpy } = createMockBaseMapLib();
        const leasedLib = createLeasedMapLibrary(token, fakeLib, controller);

        const map = new leasedLib.Map(dummyOptions);

        expect(nativeConstructorSpy).toHaveBeenCalledOnce();
        // Vérification immédiate du tracking WebGL
        expect(webglStats().created).toBe(1);
        expect(webglStats().active).toBe(1);

        // La ressource est liée au contrôleur immédiatement
        expect(controller.status()).toBe('bound');

        // Nettoyage
        map.remove();
        await controller.release(token);
    });

    it('garantit un remove idempotent sans double destruction', async () => {
        const token = await controller.request('map', 'm1');
        const { fakeLib, nativeRemoveSpy } = createMockBaseMapLib();
        const leasedLib = createLeasedMapLibrary(token, fakeLib, controller);

        const map = new leasedLib.Map(dummyOptions);

        map.remove();
        map.remove(); // 2ème appel idempotent

        expect(nativeRemoveSpy).toHaveBeenCalledOnce();
        await controller.release(token);
        expect(webglStats().released).toBe(1);
        expect(webglStats().active).toBe(0);
    });

    it('mémorise l’objet mapLib pour un même token de lease', async () => {
        const token = await controller.request('map', 'm1');
        const { fakeLib } = createMockBaseMapLib();

        const lib1 = createLeasedMapLibrary(token, fakeLib, controller);
        const lib2 = createLeasedMapLibrary(token, fakeLib, controller);

        expect(lib1).toBe(lib2);
        await controller.release(token);
    });

    it('détruit le contexte via le contrôleur lors de la libération du token', async () => {
        const token = await controller.request('map', 'm1');
        const { fakeLib, nativeRemoveSpy } = createMockBaseMapLib();
        const leasedLib = createLeasedMapLibrary(token, fakeLib, controller);

        new leasedLib.Map(dummyOptions);
        expect(webglStats().active).toBe(1);

        // Libération directe depuis le contrôleur de lease
        await controller.release(token);

        expect(nativeRemoveSpy).toHaveBeenCalledOnce();
        expect(webglStats().released).toBe(1);
        expect(webglStats().active).toBe(0);
        expect(controller.status()).toBe('idle');
    });
});
