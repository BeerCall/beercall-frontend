import {describe, expect, it, vi, beforeEach, afterEach} from 'vitest';
import {act, renderHook} from '@testing-library/react';
import {StrictMode, createElement, type ReactNode} from 'react';
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

describe('useChatViewport (T27/T38)', () => {
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

    it('sans visualViewport, retombe sur la hauteur du parent disponible et ne la dépasse pas', async () => {
        installVisualViewport(null);
        parent.getBoundingClientRect = () => ({
            top: 50, left: 0, width: 320, height: 450, bottom: 500, right: 320, x: 0, y: 50, toJSON: () => ({}),
        } as DOMRect);

        const ref = {current: child};
        const {result} = renderHook(() => useChatViewport(ref));
        await flushFrame();

        expect(result.current).toMatchObject({top: 0, left: 0, scale: 1});
        expect(result.current.height).toBe(450);
        expect(result.current.width).toBe(320);
        expect(result.current.height).toBeLessThanOrEqual(window.innerHeight);
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

    it('gère un parent à origine non nulle (top et left non nuls) avec offsets X/Y du visualViewport', async () => {
        // Visual viewport avec offsets X/Y
        installVisualViewport({offsetTop: 80, offsetLeft: 30, height: 400, width: 320, scale: 1});
        parent.getBoundingClientRect = () => ({
            top: 50, left: 10, width: 360, height: 600, bottom: 650, right: 370, x: 10, y: 50, toJSON: () => ({}),
        } as DOMRect);

        const ref = {current: child};
        const {result} = renderHook(() => useChatViewport(ref));
        await flushFrame();

        // Top doc = max(80, 50) = 80; top local = 80 - 50 = 30
        expect(result.current.top).toBe(30);
        // Left doc = max(30, 10) = 30; left local = 30 - 10 = 20
        expect(result.current.left).toBe(20);
        // Bottom doc = min(80+400, 50+600) = min(480, 650) = 480; height = 480 - 80 = 400
        expect(result.current.height).toBe(400);
        // Right doc = min(30+320, 10+360) = min(350, 370) = 350; width = 350 - 30 = 320
        expect(result.current.width).toBe(320);
    });

    it('remet la fenêtre à zéro au focus hors pinch et replanifie la mesure sans boucle', async () => {
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

        expect(scrollTo).toHaveBeenCalledWith({left: 0, top: 0, behavior: 'instant'});
        expect(result.current.scale).toBe(1);

        // Simulation : après scrollTo, scrollX et scrollY deviennent 0
        Object.defineProperty(window, 'scrollY', {configurable: true, value: 0});
        await flushFrame();
        // scrollTo ne doit pas boucler à l'infini
        expect(scrollTo).toHaveBeenCalledTimes(1);
    });

    it('gère la réduction à 320px puis la restauration alors que le focus reste', async () => {
        const installed = installVisualViewport({offsetTop: 0, offsetLeft: 0, height: 568, width: 320, scale: 1});
        parent.getBoundingClientRect = () => ({
            top: 0, left: 0, width: 320, height: 568, bottom: 568, right: 320, x: 0, y: 0, toJSON: () => ({}),
        } as DOMRect);

        const field = document.createElement('input');
        child.appendChild(field);
        field.focus();

        const ref = {current: child};
        const {result} = renderHook(() => useChatViewport(ref));
        await flushFrame();
        expect(result.current.height).toBe(568);

        // Clavier virtuel s'ouvre : réduction de la hauteur à 300px
        installed!.vv.height = 300;
        const resizeListeners = installed!.listeners.get('resize');
        resizeListeners?.forEach(fn => fn());
        await flushFrame();
        expect(result.current.height).toBe(300);

        // Clavier se ferme : restauration de la hauteur à 568px avec focus conservé
        installed!.vv.height = 568;
        resizeListeners?.forEach(fn => fn());
        await flushFrame();
        expect(result.current.height).toBe(568);
    });

    it('déclenche une mesure sur focusin et focusout du conteneur', async () => {
        const installed = installVisualViewport({height: 600, scale: 1});
        const ref = {current: child};
        const {result} = renderHook(() => useChatViewport(ref));
        await flushFrame();

        const input = document.createElement('input');
        child.appendChild(input);

        // focusin
        installed!.vv.height = 350;
        child.dispatchEvent(new FocusEvent('focusin', {bubbles: true}));
        await flushFrame();
        expect(result.current.height).toBe(350);

        // focusout (blur)
        installed!.vv.height = 600;
        child.dispatchEvent(new FocusEvent('focusout', {bubbles: true}));
        await flushFrame();
        expect(result.current.height).toBe(600);
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

    it('nettoie ses listeners et frame en StrictMode (double montage)', async () => {
        const installed = installVisualViewport({});
        const removeSpy = vi.spyOn(installed!.vv, 'removeEventListener');
        const ref = {current: child};

        const wrapper = ({children}: {children: ReactNode}) =>
            createElement(StrictMode, null, children);

        const {unmount} = renderHook(() => useChatViewport(ref), {wrapper});
        await flushFrame();
        unmount();

        const removedTypes = removeSpy.mock.calls.map(([type]) => type);
        expect(removedTypes).toContain('resize');
        expect(removedTypes).toContain('scroll');
    });
});
