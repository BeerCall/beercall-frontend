/**
 * C03 — Tracker natif des contextes WebGL dans le navigateur.
 *
 * Instrumente HTMLCanvasElement.getContext et OffscreenCanvas.getContext avant tout montage React :
 * - Déduplication par canvas via WeakMap.
 * - Suivi strict des événements 'webglcontextlost' et 'webglcontextrestored'.
 * - Contrôle du budget de contextes : 1 pour la carte ou le profil, 2 pour carte + monde.
 * - Helpers d'authentification API et injection de session déterministe.
 */

import type { APIRequestContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export interface ContextRecord {
    id: number;
    kind: string;
    isOffscreen: boolean;
    lost: boolean;
    active: boolean;
    createdAt: number;
}

export interface ContextTrackerSnapshot {
    active: number;
    maxActive: number;
    totalCreated: number;
    totalLost: number;
    totalRestored: number;
    contexts: ContextRecord[];
}

export interface FluiditeGlobalTracker {
    snapshot: () => ContextTrackerSnapshot;
    reset: () => void;
}

declare global {
    interface Window {
        __fluiditeContextTracker?: FluiditeGlobalTracker;
        __beercallMap?: {
            getCenter?: () => { lng: number; lat: number };
            getZoom?: () => number;
            fitBounds?: (bounds: [[number, number], [number, number]], options?: Record<string, unknown>) => void;
            getSource?: (id: string) => { _data?: unknown; setData?: (d: unknown) => void } | undefined;
            querySourceFeatures?: (sourceId: string, filter?: Record<string, unknown>) => Array<{ properties?: Record<string, unknown> }>;
            getCanvas?: () => HTMLCanvasElement;
        };
    }
}

/**
 * Fonction sérialisée exécutée dans le contexte du navigateur AVANT tout script d'application.
 */
export function contextTrackerInitScript(): void {
    if ((window as unknown as { __fluiditeTrackerInstalled?: boolean }).__fluiditeTrackerInstalled) {
        return;
    }
    (window as unknown as { __fluiditeTrackerInstalled?: boolean }).__fluiditeTrackerInstalled = true;

    type AnyGLContext = WebGLRenderingContext | WebGL2RenderingContext;
    type InternalRecord = {
        id: number;
        canvas: HTMLCanvasElement | OffscreenCanvas;
        context: AnyGLContext;
        kind: string;
        isOffscreen: boolean;
        lost: boolean;
        createdAt: number;
    };

    const records: InternalRecord[] = [];
    const canvasMap = new WeakMap<object, InternalRecord>();

    let nextId = 1;
    let maxActiveCount = 0;
    let totalLostCount = 0;
    let totalRestoredCount = 0;

    const isRecordActive = (rec: InternalRecord): boolean => {
        try {
            if (rec.context.isContextLost && rec.context.isContextLost()) {
                rec.lost = true;
                return false;
            }
        } catch {
            // Tolérance
        }
        return !rec.lost;
    };

    const countActive = (): number => {
        let count = 0;
        for (const rec of records) {
            if (isRecordActive(rec)) count++;
        }
        return count;
    };

    const updateMaxActive = (): void => {
        const currentActive = countActive();
        if (currentActive > maxActiveCount) {
            maxActiveCount = currentActive;
        }
    };

    const registerGLContext = (
        canvas: HTMLCanvasElement | OffscreenCanvas,
        kind: string,
        context: AnyGLContext,
        isOffscreen: boolean
    ): void => {
        if (!context) return;
        const existing = canvasMap.get(canvas);
        if (existing) {
            existing.context = context;
            existing.lost = false;
            updateMaxActive();
            return;
        }

        const rec: InternalRecord = {
            id: nextId++,
            canvas,
            context,
            kind,
            isOffscreen,
            lost: false,
            createdAt: performance.now(),
        };

        canvasMap.set(canvas, rec);
        records.push(rec);

        const onLost = (): void => {
            rec.lost = true;
            totalLostCount++;
        };
        const onRestored = (): void => {
            rec.lost = false;
            totalRestoredCount++;
            updateMaxActive();
        };

        if ('addEventListener' in canvas && typeof canvas.addEventListener === 'function') {
            canvas.addEventListener('webglcontextlost', onLost as EventListener);
            canvas.addEventListener('webglcontextrestored', onRestored as EventListener);
        }

        updateMaxActive();
    };

    // 1. Instrumentation de HTMLCanvasElement.prototype.getContext
    const originalHTMLGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        type: string,
        ...args: unknown[]
    ): RenderingContext | null {
        const context = originalHTMLGetContext.apply(this, [type, ...args] as never);
        if (context && (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl')) {
            registerGLContext(this, type, context as AnyGLContext, false);
        }
        return context;
    } as typeof HTMLCanvasElement.prototype.getContext;

    // 2. Instrumentation de OffscreenCanvas.prototype.getContext si disponible
    if (typeof OffscreenCanvas !== 'undefined' && OffscreenCanvas.prototype.getContext) {
        const originalOffscreenGetContext = OffscreenCanvas.prototype.getContext;
        OffscreenCanvas.prototype.getContext = function (
            this: OffscreenCanvas,
            type: string,
            ...args: unknown[]
        ): OffscreenRenderingContext | null {
            const context = originalOffscreenGetContext.apply(this, [type, ...args] as never);
            if (context && (type === 'webgl' || type === 'webgl2')) {
                registerGLContext(this, type, context as unknown as AnyGLContext, true);
            }
            return context;
        } as typeof OffscreenCanvas.prototype.getContext;
    }

    // 3. API globale accessible pour les assertions
    window.__fluiditeContextTracker = {
        snapshot: (): ContextTrackerSnapshot => {
            const activeNow = countActive();
            return {
                active: activeNow,
                maxActive: maxActiveCount,
                totalCreated: records.length,
                totalLost: totalLostCount,
                totalRestored: totalRestoredCount,
                contexts: records.map((r) => ({
                    id: r.id,
                    kind: r.kind,
                    isOffscreen: r.isOffscreen,
                    lost: !isRecordActive(r),
                    active: isRecordActive(r),
                    createdAt: r.createdAt,
                })),
            };
        },
        reset: (): void => {
            maxActiveCount = countActive();
            totalLostCount = 0;
            totalRestoredCount = 0;
        },
    };
}

/**
 * Installe le tracker de contexte dans la page avant toute navigation.
 */
export async function installContextTracker(page: Page): Promise<void> {
    await page.addInitScript(contextTrackerInitScript);
}

/**
 * Lit l'état courant du tracker dans la page.
 */
export async function readContextTracker(page: Page): Promise<ContextTrackerSnapshot> {
    return page.evaluate(() => {
        if (!window.__fluiditeContextTracker) {
            return {
                active: 0,
                maxActive: 0,
                totalCreated: 0,
                totalLost: 0,
                totalRestored: 0,
                contexts: [],
            };
        }
        return window.__fluiditeContextTracker.snapshot();
    });
}

/**
 * Vérifie rigoureusement que maxActive <= 1 et active <= 1.
 */
export async function expectMaxOneActiveContext(
    page: Page,
    label: string = 'Vérification contexte WebGL unique'
): Promise<ContextTrackerSnapshot> {
    const stats = await readContextTracker(page);
    expect(
        stats.active,
        `[${label}] Plus d'un contexte WebGL actif simultanément (active=${stats.active})`
    ).toBeLessThanOrEqual(1);
    expect(
        stats.maxActive,
        `[${label}] Le pic de contextes WebGL actifs a dépassé 1 (maxActive=${stats.maxActive})`
    ).toBeLessThanOrEqual(1);
    return stats;
}

/**
 * Budget carte + monde : deux contextes actifs au maximum, jamais plus.
 */
export async function expectAtMostTwoActiveContexts(
    page: Page,
    label: string = 'Vérification carte + monde'
): Promise<ContextTrackerSnapshot> {
    const stats = await readContextTracker(page);
    expect(
        stats.active,
        `[${label}] Plus de deux contextes WebGL actifs simultanément (active=${stats.active})`
    ).toBeLessThanOrEqual(2);
    expect(
        stats.maxActive,
        `[${label}] Le pic de contextes WebGL actifs a dépassé 2 (maxActive=${stats.maxActive})`
    ).toBeLessThanOrEqual(2);
    return stats;
}

/**
 * Après fermeture du monde : seul le contexte carte doit rester actif, avec un
 * pic à 2 autorisé pendant la transition carte + monde.
 */
export async function expectNoContextLeak(
    page: Page,
    label: string = 'Vérification retour carte'
): Promise<ContextTrackerSnapshot> {
    const stats = await readContextTracker(page);
    expect(
        stats.active,
        `[${label}] Contexte monde toujours actif après fermeture (active=${stats.active})`
    ).toBeLessThanOrEqual(1);
    expect(
        stats.maxActive,
        `[${label}] Le pic de contextes WebGL actifs a dépassé 2 (maxActive=${stats.maxActive})`
    ).toBeLessThanOrEqual(2);
    return stats;
}

/**
 * Vérifie qu'une action n'a créé aucun nouveau contexte WebGL et que le budget
 * reste borné à 2 (carte + monde préparé au repos).
 */
export async function expectNoNewContext(
    page: Page,
    previous: ContextTrackerSnapshot,
    label: string = 'Vérification stabilité des contextes'
): Promise<ContextTrackerSnapshot> {
    const stats = await readContextTracker(page);
    expect(
        stats.totalCreated,
        `[${label}] Nouveau contexte WebGL créé (${previous.totalCreated} -> ${stats.totalCreated})`
    ).toBe(previous.totalCreated);
    expect(
        stats.active,
        `[${label}] Plus de deux contextes WebGL actifs (active=${stats.active})`
    ).toBeLessThanOrEqual(2);
    expect(
        stats.maxActive,
        `[${label}] Le pic de contextes WebGL actifs a dépassé 2 (maxActive=${stats.maxActive})`
    ).toBeLessThanOrEqual(2);
    return stats;
}

/**
 * Effectue un login authentifié via l'API REST (/api/auth/token/) et injecte
 * la session dans le localStorage de la page avant tout chargement.
 */
export async function loginAs(
    page: Page,
    request: APIRequestContext,
    username: string,
    password: string = 'FluiditeTest2026!'
): Promise<{ accessToken: string; refreshToken: string; username: string }> {
    // 1. Appel HTTP direct au contrat FastAPI OAuth2 Password
    const response = await request.post('/api/auth/token/', {
        form: { username, password },
    });

    if (!response.ok()) {
        const body = await response.text();
        throw new Error(`[loginAs] Échec d'authentification pour ${username} (HTTP ${response.status()}) : ${body}`);
    }

    const data = await response.json() as { access_token: string; refresh_token: string };
    const accessToken = data.access_token;
    const refreshToken = data.refresh_token;

    // 2. Injection dans localStorage via addInitScript (s'applique à toute navigation)
    await page.addInitScript(
        ({ token, refresh, user }) => {
            try {
                localStorage.setItem('token', token);
                localStorage.setItem('refresh_token', refresh);
                localStorage.setItem(
                    'user-storage',
                    JSON.stringify({
                        state: { isAuthenticated: true, username: user },
                        version: 0,
                    })
                );
            } catch {
                // Tolérance about:blank
            }
        },
        { token: accessToken, refresh: refreshToken, user: username }
    );

    return { accessToken, refreshToken, username };
}
