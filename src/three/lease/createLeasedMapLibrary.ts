/**
 * B10c — Adaptateur de bibliothèque MapLibre sous contrôle de lease (CHAL-02).
 *
 * Fournit une bibliothèque `mapLib` pour react-map-gl synchronisée avec le token de lease :
 * - Vérifie synchroniquement le token AVANT `super(options)`.
 * - Track le canvas et attache le disposer immédiatement après construction (avant onLoad).
 * - Surcharge `remove()` de façon idempotente et détruit le contexte via `destroyCanvasContext`.
 * - Mémorise l'objet mapLib par token pour éviter toute réinstanciation au re-render.
 */

import type maplibregl from 'maplibre-gl';

import { globalLeaseController, type LeaseController } from './leaseController';
import { type LeaseToken } from './leaseStore';
import { type GlContext, destroyCanvasContext, trackCanvasContext } from './webgl';

export function assertCurrentLeaseToken(
    token: LeaseToken,
    controller: LeaseController = globalLeaseController,
): void {
    if (!controller.isCurrent(token)) {
        throw new Error(
            `Token de lease MapLibre invalide ou périmé pour ${token.surface}#${token.generation}`,
        );
    }
}

const mapLibCache = new WeakMap<LeaseToken, typeof maplibregl>();

export function createLeasedMapLibrary(
    token: LeaseToken,
    baseLib: typeof maplibregl,
    controller: LeaseController = globalLeaseController,
): typeof maplibregl {
    const cached = mapLibCache.get(token);
    if (cached) return cached;

    // La vraie bibliothèque MapLibre est obligatoire : aucun repli factice ne
    // doit masquer un import manquant (la carte resterait blanche sans erreur).
    if (!baseLib || typeof baseLib.Map !== 'function') {
        throw new Error(
            'createLeasedMapLibrary: baseLib est obligatoire et doit exposer la classe Map de maplibre-gl',
        );
    }

    const BaseClass = baseLib.Map;

    class LeasedMap extends BaseClass {
        private _isRemoved = false;
        private _destroyPromise: Promise<void> | null = null;
        private _attachedCanvas: HTMLCanvasElement | null = null;
        private _attachedContext: GlContext | null = null;

        constructor(options: maplibregl.MapOptions) {
            // 1. Contrôle synchrone avant l'allocation native
            assertCurrentLeaseToken(token, controller);
            super(options);

            // 2. Immédiatement après construction (avant tout événement de style ou load)
            const canvas = this.getCanvas();
            this._attachedCanvas = canvas;
            this._attachedContext = trackCanvasContext(canvas);

            // 3. Enregistrement synchrone du disposer sur le token
            controller.attach(token, async () => {
                this.remove();
                if (this._destroyPromise) {
                    await this._destroyPromise;
                }
            });
        }

        override remove(): this {
            if (this._isRemoved) return this;
            this._isRemoved = true;

            const canvas = this._attachedCanvas || this.getCanvas();
            const context =
                this._attachedContext ||
                ((canvas?.getContext('webgl2') ?? canvas?.getContext('webgl')) as GlContext | null);

            try {
                super.remove();
            } catch (error) {
                console.error('[lease] Échec de MapLibre Map.remove()', { token, error });
            }

            if (canvas && context) {
                this._destroyPromise = destroyCanvasContext(context, canvas).catch((error) => {
                    console.error('[lease] Destruction du contexte MapLibre échouée', {
                        token,
                        error,
                    });
                });
            }

            return this;
        }
    }

    const leasedLib = Object.assign(Object.create(baseLib), {
        Map: LeasedMap as unknown as typeof maplibregl.Map,
    });

    mapLibCache.set(token, leasedLib);
    return leasedLib;
}
