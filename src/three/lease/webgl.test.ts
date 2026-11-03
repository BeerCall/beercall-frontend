import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    type GlContext,
    destroyCanvasContext,
    destroyContext,
    resetWebglStats,
    trackContext,
    webglStats,
} from './webgl';

function createMockContext(initiallyLost = false) {
    let lost = initiallyLost;
    const loseContext = vi.fn(() => {
        lost = true;
    });

    const context = {
        getExtension: vi.fn((ext: string) => {
            if (ext === 'WEBGL_lose_context') return { loseContext };
            return null;
        }),
        isContextLost: vi.fn(() => lost),
    } as unknown as GlContext;

    return { context, loseContext, isLost: () => lost, setLost: (v: boolean) => { lost = v; } };
}

describe('B10 — webgl.ts (suivi et destruction des contextes)', () => {
    beforeEach(() => {
        resetWebglStats();
    });

    it('suit la création et l’activité d’un contexte WebGL', () => {
        const { context } = createMockContext();
        const canvas = document.createElement('canvas');

        trackContext(context, canvas);
        const stats = webglStats();

        expect(stats.created).toBe(1);
        expect(stats.active).toBe(1);
        expect(stats.maxActive).toBe(1);
        expect(canvas.dataset.webglTracked).toBe('1');
    });

    it('détruit un contexte via WEBGL_lose_context et valide la perte', async () => {
        const { context, loseContext } = createMockContext();
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 150;

        trackContext(context, canvas);
        await destroyContext(context, canvas);

        expect(loseContext).toHaveBeenCalledOnce();
        const stats = webglStats();
        expect(stats.released).toBe(1);
        expect(stats.active).toBe(0);
        expect(stats.forcedLoss).toBe(1);
        expect(canvas.width).toBe(0);
        expect(canvas.height).toBe(0);
    });

    it('garantit un double cleanup idempotent réutilisant la même promesse', async () => {
        const { context } = createMockContext();
        const canvas = document.createElement('canvas');

        trackContext(context, canvas);
        const p1 = destroyContext(context, canvas);
        const p2 = destroyContext(context, canvas);

        expect(p1).toBe(p2);
        await Promise.all([p1, p2]);

        const stats = webglStats();
        expect(stats.released).toBe(1);
        expect(stats.active).toBe(0);
    });

    it('échoue si le contexte refuse de confirmer sa perte après 20 essais', async () => {
        const { context, setLost } = createMockContext(false);
        // Empêche la perte de passer à true
        context.getExtension = vi.fn(() => ({
            loseContext: () => {
                setLost(false);
            },
        })) as unknown as typeof context.getExtension;
        context.isContextLost = () => false;

        const canvas = document.createElement('canvas');
        trackContext(context, canvas);

        await expect(destroyCanvasContext(context, canvas)).rejects.toThrow(/Libération WebGL non confirmée/);

        const stats = webglStats();
        expect(stats.failures.length).toBeGreaterThan(0);
        expect(stats.active).toBe(1); // Non libéré
    });

    it('capture une perte inattendue et notifie via événement', () => {
        const { context } = createMockContext();
        const canvas = document.createElement('canvas');
        trackContext(context, canvas);

        const listener = vi.fn();
        window.addEventListener('beercall:webgl-lost', listener);

        // Simulation d'une perte inattendue sur le canvas
        canvas.dispatchEvent(new Event('webglcontextlost'));

        expect(listener).toHaveBeenCalledOnce();
        const stats = webglStats();
        expect(stats.unexpectedLoss).toBe(1);
        expect(stats.active).toBe(0);

        window.removeEventListener('beercall:webgl-lost', listener);
    });
});
