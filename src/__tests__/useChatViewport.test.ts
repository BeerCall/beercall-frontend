import {describe, expect, it, vi, beforeEach, afterEach} from 'vitest';
import {act, renderHook} from '@testing-library/react';
import {useChatViewport} from '../hooks/useChatViewport';

interface FakeVisualViewport {
    height: number;
    width: number;
    offsetTop: number;
    offsetLeft: number;
    scale: number;
    addEventListener: (type: string, listener: () => void) => void;
    removeEventListener: (type: string, listener: () => void) => void;
}

function installVisualViewport(initial: Partial<FakeVisualViewport> | null) {
    if (initial === null) {
        Object.defineProperty(window, 'visualViewport', {configurable: true, value: undefined});
        return null;
    }
    const listeners = new Map<string, Set<() => void>>();
    const vv: FakeVisualViewport = {
        height: 800,
        width: 390,
        offsetTop: 0,
        offsetLeft: 0,
        scale: 1,
        ...initial,
        addEventListener: (type, listener) => {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type)?.add(listener);
        },
        removeEventListener: (type, listener) => {
            listeners.get(type)?.delete(listener);
        },
    };
    Object.defineProperty(window, 'visualViewport', {configurable: true, value: vv});
    return {vv, listeners};
}

const flushFrame = async () => {
    await act(async () => {
        await new Promise<void>(resolve => setTimeout(resolve, 32));
    });
};

describe('useChatViewport (T27)', () => {
    let parent: HTMLDivElement;
    let child: HTMLDivElement;

    beforeEach(() => {
        parent = document.createElement('div');
        child = document.createElement('div');
        parent.appendChild(child);
        document.body.appendChild(parent);
        parent.getBoundingClientRect = () => ({
            top: 0, left: 0, width: 390, height: 800, bottom: 800, right: 390, x: 0, y: 0, toJSON: () => ({}),
        } as DOMRect);
    });

    afterEach(() => {
        parent.remove();
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('sans visualViewport, retombe sur la fenêtre et zéro offset', async () => {
        installVisualViewport(null);
        const ref = {current: child};
        const {result} = renderHook(() => useChatViewport(ref));
        await flushFrame();

        expect(result.current).toMatchObject({top: 0, left: 0, scale: 1});
        expect(result.current.height).toBe(window.innerHeight);
    });

    it('intersecte le viewport visuel décalé avec le cadre parent, en coordonnées locales', async () => {
        installVisualViewport({offsetTop: 60, offsetLeft: 20, height: 500, width: 300, scale: 1});
        parent.getBoundingClientRect = () => ({
            top: 100, left: 0, width: 390, height: 500, bottom: 600, right: 390, x: 0, y: 100, toJSON: () => ({}),
        } as DOMRect);

        const ref = {current: child};
        const {result} = renderHook(() => useChatViewport(ref));
        await flushFrame();

        // 60..560 ∩ 100..600 => 100..560, soit top 0 et 460px dans le parent.
        expect(result.current.top).toBe(0);
        expect(result.current.height).toBe(460);
        expect(result.current.left).toBe(20);
        expect(result.current.width).toBe(300);
    });

    it('remet la fenêtre à zéro une fois au focus hors pinch, sans boucle', async () => {
        const scrollTo = vi.fn();
        vi.stubGlobal('scrollTo', scrollTo);
        Object.defineProperty(window, 'scrollY', {configurable: true, value: 140});
        Object.defineProperty(window, 'scrollX', {configurable: true, value: 0});
        installVisualViewport({offsetTop: 140, height: 600, scale: 1});

        const field = document.createElement('input');
        child.appendChild(field);
        field.focus();

        const ref = {current: child};
        const {result} = renderHook(() => useChatViewport(ref));
        await flushFrame();

        expect(scrollTo).toHaveBeenCalledTimes(1);
        expect(scrollTo).toHaveBeenCalledWith({left: 0, top: 0, behavior: 'instant'});
        expect(result.current.scale).toBe(1);
    });

    it('ne force aucun scroll pendant un pinch utilisateur (scale 1,5)', async () => {
        const scrollTo = vi.fn();
        vi.stubGlobal('scrollTo', scrollTo);
        Object.defineProperty(window, 'scrollY', {configurable: true, value: 140});
        Object.defineProperty(window, 'scrollX', {configurable: true, value: 0});
        installVisualViewport({offsetTop: 90, height: 320, width: 260, scale: 1.5});

        const field = document.createElement('input');
        child.appendChild(field);
        field.focus();

        const ref = {current: child};
        const {result} = renderHook(() => useChatViewport(ref));
        await flushFrame();

        expect(scrollTo).not.toHaveBeenCalled();
        expect(result.current.scale).toBe(1.5);
        expect(result.current.height).toBeGreaterThan(0);
    });

    it('nettoie ses listeners au démontage', async () => {
        const installed = installVisualViewport({});
        const removeSpy = vi.spyOn(installed!.vv, 'removeEventListener');
        const ref = {current: child};
        const {unmount} = renderHook(() => useChatViewport(ref));
        await flushFrame();
        unmount();

        const removedTypes = removeSpy.mock.calls.map(([type]) => type);
        expect(removedTypes).toContain('resize');
        expect(removedTypes).toContain('scroll');
    });
});
