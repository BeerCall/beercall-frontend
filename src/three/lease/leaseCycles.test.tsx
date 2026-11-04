/**
 * Étape 3 — cycles de navigation réels autour de la carte.
 *
 * Le Dashboard est retenu (PersistentDashboard) : quand on ouvre Profil,
 * Connexions ou un monde, `active` passe à false et `useLease` appelle
 * `cancel()`. React exécute le cleanup de l'effet précédent PUIS le corps du
 * nouvel effet, ce qui appelle `cancel()` deux fois pour la même instance.
 *
 * Ces tests reproduisent cette double annulation avec une libération
 * volontairement asynchrone (comme la perte de contexte WebGL réelle) et
 * vérifient qu'aucun cycle ne laisse la lease bloquée avec 0 contexte actif.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type maplibregl from 'maplibre-gl';

import { createLeasedMapLibrary } from './createLeasedMapLibrary';
import { LeaseController } from './leaseController';
import { resetLeaseStore } from './leaseStore';
import { type GlContext, resetWebglStats, webglStats } from './webgl';

const delay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/** Libération asynchrone : la perte de contexte n'est visible qu'après un délai. */
function createAsyncMockBaseMapLib() {
    class FakeNativeMap {
        private canvas: HTMLCanvasElement;
        private context: GlContext;
        readonly options: maplibregl.MapOptions;

        constructor(options: maplibregl.MapOptions) {
            this.options = options;
            this.canvas = document.createElement('canvas');
            let lost = false;
            this.context = {
                getExtension: (ext: string) => {
                    if (ext === 'WEBGL_lose_context') {
                        return {
                            loseContext: () => {
                                setTimeout(() => {
                                    lost = true;
                                }, 10);
                            },
                        };
                    }
                    return null;
                },
                isContextLost: () => lost,
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
            return this;
        }
    }

    return { Map: FakeNativeMap as unknown as typeof maplibregl.Map } as unknown as typeof maplibregl;
}

const dummyOptions = { container: document.createElement('div') } as unknown as maplibregl.MapOptions;

describe('Étape 3 — la lease survit aux cycles de navigation', () => {
    let controller: LeaseController;
    let counter = 0;

    beforeEach(() => {
        controller = new LeaseController(1_000);
        controller.reset();
        resetLeaseStore();
        resetWebglStats();
        counter = 0;
    });

    afterEach(() => {
        controller.reset();
    });

    async function openMap() {
        counter += 1;
        const token = await controller.request('map', `map-${counter}`);
        const lib = createLeasedMapLibrary(token, createAsyncMockBaseMapLib(), controller);
        // La carte est construite : le disposer est attaché immédiatement.
        new lib.Map(dummyOptions);
        return token;
    }

    /** Reproduit exactement ce que fait useLease lors d'un passage inactif. */
    function deactivate(surface: string, instanceId: string) {
        controller.cancel(surface, instanceId);
        controller.cancel(surface, instanceId);
    }

    async function openSecondary(surface: 'profile' | 'world') {
        counter += 1;
        const instanceId = `${surface}-${counter}`;
        const token = await controller.request(surface, instanceId);
        controller.attach(token, () => delay(10));
        return instanceId;
    }

    it('carte → Profil → carte, 5 cycles, jamais bloquée', async () => {
        for (let cycle = 1; cycle <= 5; cycle += 1) {
            const mapToken = await openMap();
            expect(controller.status()).not.toBe('blocked');

            deactivate('map', mapToken.instanceId);
            const profileInstance = await openSecondary('profile');
            expect(controller.status()).not.toBe('blocked');

            deactivate('profile', profileInstance);
            const backToken = await controller.request('map', `back-${cycle}`);
            expect(controller.status()).not.toBe('blocked');

            await controller.release(backToken);
            expect(controller.status()).toBe('idle');
            expect(webglStats().active).toBe(0);
        }
    }, 15_000);

    it('carte → Connexions → carte, 5 cycles, jamais bloquée', async () => {
        for (let cycle = 1; cycle <= 5; cycle += 1) {
            const mapToken = await openMap();
            deactivate('map', mapToken.instanceId);

            // Connexions ne réserve aucune surface WebGL : on revient direct.
            const backToken = await controller.request('map', `back-${cycle}`);
            expect(controller.status()).not.toBe('blocked');

            await controller.release(backToken);
            expect(controller.status()).toBe('idle');
            expect(webglStats().active).toBe(0);
        }
    }, 15_000);

    it('carte → Bar → fermeture → carte, 5 cycles, jamais bloquée', async () => {
        for (let cycle = 1; cycle <= 5; cycle += 1) {
            const mapToken = await openMap();
            deactivate('map', mapToken.instanceId);

            const worldInstance = await openSecondary('world');
            expect(controller.status()).not.toBe('blocked');

            deactivate('world', worldInstance);
            const backToken = await controller.request('map', `back-${cycle}`);
            expect(controller.status()).not.toBe('blocked');

            await controller.release(backToken);
            expect(controller.status()).toBe('idle');
            expect(webglStats().active).toBe(0);
        }
    }, 15_000);

    it('une double annulation ne bloque pas la lease (régression)', async () => {
        counter += 1;
        const token = await controller.request('map', `map-${counter}`);
        let releaseCalls = 0;
        controller.attach(token, async () => {
            releaseCalls += 1;
            await delay(20);
        });

        controller.cancel('map', token.instanceId);
        controller.cancel('map', token.instanceId);

        await delay(120);
        expect(controller.status()).toBe('idle');
        expect(releaseCalls).toBe(1);
        expect(webglStats().active).toBe(0);
    });
});
