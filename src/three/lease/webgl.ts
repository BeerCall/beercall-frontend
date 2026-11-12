/**
 * B10 — Suivi et destruction prouvée des contextes WebGL (Three.js et MapLibre).
 *
 * Dérivé du POC avec conservation du double-cleanup sécurisé (WeakMap de promesses),
 * destruction forcée via `WEBGL_lose_context` et preuve de perte via `isContextLost`.
 */

import type { WebGLRenderer } from 'three';

export interface WebglStats {
    created: number;
    released: number;
    active: number;
    maxActive: number;
    forcedLoss: number;
    unexpectedLoss: number;
    failures: string[];
}

export type GlContext = WebGLRenderingContext | WebGL2RenderingContext;

const stats: WebglStats = {
    created: 0,
    released: 0,
    active: 0,
    maxActive: 0,
    forcedLoss: 0,
    unexpectedLoss: 0,
    failures: [],
};

const releases = new WeakMap<object, Promise<void>>();
const intentional = new WeakSet<object>();
const tracked = new WeakSet<object>();

const wait = (milliseconds: number) =>
    new Promise<void>((resolve) => {
        if (typeof window !== 'undefined') {
            window.setTimeout(resolve, milliseconds);
        } else {
            setTimeout(resolve, milliseconds);
        }
    });

export function webglStats(): WebglStats {
    return { ...stats, failures: [...stats.failures] };
}

export function resetWebglStats(): void {
    stats.created = 0;
    stats.released = 0;
    stats.active = 0;
    stats.maxActive = 0;
    stats.forcedLoss = 0;
    stats.unexpectedLoss = 0;
    stats.failures.length = 0;
}

declare global {
    interface Window {
        __webglStats?: typeof webglStats;
    }
}

if (typeof window !== 'undefined') {
    window.__webglStats = webglStats;
}

export function trackRenderer(renderer: WebGLRenderer): void {
    const context = renderer.getContext() as GlContext | null;
    const canvas = renderer.domElement as HTMLCanvasElement;
    if (context && canvas) {
        trackContext(context, canvas);
    }
}

export function trackCanvasContext(canvas: HTMLCanvasElement): GlContext | null {
    const context = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as GlContext | null;
    if (context) {
        trackContext(context, canvas);
    } else {
        stats.failures.push('Contexte WebGL introuvable sur le canvas');
    }
    return context;
}

export function trackContext(context: GlContext, canvas: HTMLCanvasElement): void {
    if (tracked.has(context)) return;
    tracked.add(context);
    stats.created += 1;
    stats.active += 1;
    stats.maxActive = Math.max(stats.maxActive, stats.active);

    if (canvas && typeof canvas.addEventListener === 'function') {
        canvas.dataset.webglTracked = '1';
        canvas.addEventListener(
            'webglcontextlost',
            () => {
                if (intentional.has(context)) return;
                stats.unexpectedLoss += 1;
                stats.active = Math.max(0, stats.active - 1);
                const message = `Perte WebGL inattendue (${stats.created} créés, ${stats.active} actifs)`;
                stats.failures.push(message);
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('beercall:webgl-lost', { detail: { message } }));
                }
            },
            { once: true },
        );
    }
}

export async function destroyRenderer(renderer: WebGLRenderer): Promise<void> {
    const canvas = renderer.domElement as HTMLCanvasElement;
    const context = renderer.getContext() as GlContext | null;
    try {
        renderer.renderLists?.dispose?.();
    } catch (error) {
        console.error('[webgl] Échec de dispose des renderLists', { error });
    }
    if (context && canvas) {
        await destroyContext(context, canvas);
    }
}

export async function destroyCanvasContext(context: GlContext | null, canvas: HTMLCanvasElement): Promise<void> {
    if (!context) {
        console.error('[webgl] Libération impossible : aucun contexte WebGL sur le canvas', {
            canvasWidth: canvas?.width,
            canvasHeight: canvas?.height,
        });
        throw new Error('Libération WebGL non confirmable sans contexte');
    }
    await destroyContext(context, canvas);
}

export function destroyContext(context: GlContext, canvas: HTMLCanvasElement): Promise<void> {
    const prior = releases.get(context);
    if (prior) return prior;

    const release = (async () => {
        intentional.add(context);

        // 1. Déclenchement de la perte forcée
        let extension: (WEBGL_lose_context & { loseContext?: () => void }) | null = null;
        try {
            extension = (context.getExtension?.('WEBGL_lose_context') ?? null) as (WEBGL_lose_context & { loseContext?: () => void }) | null;
            extension?.loseContext?.();
        } catch (error) {
            console.error('[webgl] Échec de WEBGL_lose_context', { error });
        }
        if (extension) {
            stats.forcedLoss += 1;
        } else {
            // MapLibre appelle déjà loseContext() dans son propre remove() : dans ce
            // cas l'extension n'est plus disponible et le contexte est déjà perdu.
            console.error(
                '[webgl] WEBGL_lose_context indisponible : vérification de la perte réelle du contexte',
                { isContextLost: typeof context.isContextLost === 'function' ? context.isContextLost() : 'inconnu' },
            );
        }

        // 2. Polling de confirmation (20 x 50ms = 1s)
        for (let attempt = 0; attempt < 20; attempt += 1) {
            let isLost = false;
            try {
                isLost = typeof context.isContextLost === 'function' ? context.isContextLost() : true;
            } catch (error) {
                // Un contexte déjà détruit peut faire échouer isContextLost() :
                // on le considère perdu, mais l'erreur reste tracée.
                console.error('[webgl] isContextLost() a échoué, contexte considéré perdu', { error });
                isLost = true;
            }

            if (isLost) {
                stats.active = Math.max(0, stats.active - 1);
                stats.released += 1;
                if (canvas) {
                    canvas.width = 0;
                    canvas.height = 0;
                }
                return;
            }
            await wait(50);
        }

        const message = `Contexte non libéré après 1 s (${stats.created} créés, ${stats.active} actifs)`;
        stats.failures.push(message);
        console.error('[webgl] Libération WebGL non confirmée', {
            canvasWidth: canvas?.width,
            canvasHeight: canvas?.height,
            hadExtension: Boolean(extension),
            created: stats.created,
            active: stats.active,
        });
        throw new Error('Libération WebGL non confirmée');
    })();

    releases.set(context, release);
    return release;
}
