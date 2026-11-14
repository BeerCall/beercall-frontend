import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScrollingLabel } from '../components/Dashboard/ScrollingLabel';

let resizeTriggers: Array<() => void> = [];
let intersectionTriggers: Array<(visible: boolean, ratio: number) => void> = [];
let reducedMotion = false;
let motionListeners = new Set<() => void>();

class ResizeObserverMock {
    constructor(callback: ResizeObserverCallback) {
        resizeTriggers.push(() => callback([], this as unknown as ResizeObserver));
    }
    observe() {}
    unobserve() {}
    disconnect() {}
}

class IntersectionObserverMock {
    constructor(callback: IntersectionObserverCallback) {
        intersectionTriggers.push((visible: boolean, ratio: number) => callback(
            [{ isIntersecting: visible, intersectionRatio: ratio } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
        ));
    }
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
    root = null;
    rootMargin = '';
    thresholds = [];
}

function measure(textWidth: number, available: number): void {
    const host = screen.getByTestId('scrolling-label-host');
    const text = screen.getByTestId('scrolling-label-measure');
    Object.defineProperty(host, 'clientWidth', { configurable: true, value: available });
    Object.defineProperty(text, 'scrollWidth', { configurable: true, value: textWidth });
    act(() => {
        for (const trigger of resizeTriggers) trigger();
    });
}

function setVisible(visible: boolean, ratio = visible ? 1 : 0): void {
    act(() => {
        for (const trigger of intersectionTriggers) trigger(visible, ratio);
    });
}

beforeEach(() => {
    resizeTriggers = [];
    intersectionTriggers = [];
    reducedMotion = false;
    motionListeners = new Set();
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
    vi.stubGlobal('matchMedia', (query: string) => ({
            get matches() { return reducedMotion && query.includes('prefers-reduced-motion'); },
            media: query,
            onchange: null,
            addEventListener: vi.fn((_type: string, listener: () => void) => motionListeners.add(listener)),
            removeEventListener: vi.fn((_type: string, listener: () => void) => motionListeners.delete(listener)),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('ScrollingLabel', () => {
    it('garde un libellé court immobile et non dupliqué', () => {
        render(<ScrollingLabel text="AFTER"/>);
        measure(60, 160);

        const host = screen.getByTestId('scrolling-label-host');
        expect(host).toHaveAttribute('data-overflow', 'false');
        expect(screen.queryByTestId('scrolling-label-track')).not.toBeInTheDocument();
        expect(screen.queryByTestId('scrolling-label-scroll')).not.toBeInTheDocument();
        expect(screen.getByTestId('scrolling-label-static')).toHaveTextContent('AFTER');
        expect(screen.getByRole('heading', { name: 'AFTER' })).toBe(host);
    });

    it('fait défiler un libellé qui déborde, avec une copie aria-hidden', () => {
        const long = 'BON EUX ILS GAGNENT ? POUR MACRON';
        render(<ScrollingLabel text={long}/>);
        measure(420, 170);

        const track = screen.getByTestId('scrolling-label-track');
        expect(track.style.animationName).toBe('beercall-card-scroll');
        expect(parseFloat(track.style.animationDuration)).toBeGreaterThanOrEqual(8);
        expect(track.style.animationPlayState).toBe('running');
        expect(track.textContent).toBe(`${long}${long}`);
        expect(track.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
        expect(screen.getByRole('heading', { name: long })).toBe(screen.getByTestId('scrolling-label-host'));
    });

    it('met le défilement en pause hors visibilité et le reprend à l’écran', () => {
        render(<ScrollingLabel text="UN LIEU ASSEZ LONG POUR DEFILER"/>);
        measure(420, 170);
        const track = screen.getByTestId('scrolling-label-track');
        expect(track.style.animationPlayState).toBe('running');

        setVisible(false);
        expect(track.style.animationPlayState).toBe('paused');

        setVisible(true);
        expect(track.style.animationPlayState).toBe('running');
    });

    it('respecte la réduction des animations par un balayage manuel sans animation', () => {
        reducedMotion = true;
        const long = 'BON EUX ILS GAGNENT ? POUR MACRON';
        render(<ScrollingLabel text={long}/>);
        measure(420, 170);

        const host = screen.getByTestId('scrolling-label-host');
        expect(host).toHaveAttribute('data-reduced', 'true');
        expect(host.style.touchAction).toBe('auto');
        expect(host.className).toContain('overflow-x-auto');
        expect(host.className).toContain('hide-scrollbar');
        expect(screen.queryByTestId('scrolling-label-track')).not.toBeInTheDocument();

        const scroll = screen.getByTestId('scrolling-label-scroll');
        expect(scroll).toHaveTextContent(long);
        expect(screen.getByTestId('scrolling-label-measure')).toHaveTextContent(long);
        expect(screen.getByRole('heading', { name: long })).toBe(host);
    });

    it('attend au moins dix pour cent de visibilité pour reprendre le défilement', () => {
        render(<ScrollingLabel text="LIEU LONG PARTIELLEMENT VISIBLE"/>);
        measure(420, 170);

        setVisible(true, 0.05);
        expect(screen.getByTestId('scrolling-label-track').style.animationPlayState).toBe('paused');
        setVisible(true, 0.1);
        expect(screen.getByTestId('scrolling-label-track').style.animationPlayState).toBe('running');
    });

    it('permet la lecture au clavier en mode réduit sans restreindre les gestes natifs', () => {
        reducedMotion = true;
        render(<ScrollingLabel text="UNE TERRASSE TRES LONGUE AVEC UNE BELLE VUE"/>);
        measure(420, 170);

        const host = screen.getByTestId('scrolling-label-host');
        expect(host).toHaveAttribute('tabindex', '0');
        expect(host.style.touchAction).toBe('auto');
        expect(host.style.overscrollBehaviorX).toBe('contain');
        host.focus();
        expect(host).toHaveFocus();
        expect(screen.getByRole('heading')).toBe(host);
    });

    it('réagit à un changement de préférence sans rechargement et nettoie les abonnements', () => {
        const resizeDisconnect = vi.spyOn(ResizeObserverMock.prototype, 'disconnect');
        const intersectionDisconnect = vi.spyOn(IntersectionObserverMock.prototype, 'disconnect');
        const {unmount} = render(<ScrollingLabel text="UN LIEU LONG AVEC DES ACCENTS ÉTÉ ET UN EMOJI 🍻"/>);
        measure(420, 170);
        expect(screen.getByTestId('scrolling-label-track')).toBeInTheDocument();

        act(() => {
            reducedMotion = true;
            for (const listener of motionListeners) listener();
        });
        expect(screen.queryByTestId('scrolling-label-track')).not.toBeInTheDocument();
        expect(screen.getByTestId('scrolling-label-host')).toHaveAttribute('tabindex', '0');
        act(() => {
            reducedMotion = false;
            for (const listener of motionListeners) listener();
        });
        expect(screen.getByTestId('scrolling-label-track')).toBeInTheDocument();
        expect(screen.getByTestId('scrolling-label-host')).not.toHaveAttribute('tabindex');

        unmount();
        expect(motionListeners.size).toBe(0);
        expect(resizeDisconnect).toHaveBeenCalledOnce();
        expect(intersectionDisconnect).toHaveBeenCalledOnce();
        resizeDisconnect.mockRestore();
        intersectionDisconnect.mockRestore();
    });

    it('retire le défilement si la place redevient suffisante', () => {
        render(<ScrollingLabel text="LIEU LONG QUI DEBORDE"/>);
        measure(360, 170);
        expect(screen.getByTestId('scrolling-label-track')).toBeInTheDocument();

        measure(360, 420);
        expect(screen.queryByTestId('scrolling-label-track')).not.toBeInTheDocument();
        expect(screen.getByTestId('scrolling-label-static')).toBeInTheDocument();
    });

    it('ne duplique pas le nom accessible quand la copie animée existe', () => {
        render(<ScrollingLabel text="UN AUTRE LIEU TRES LONG"/>);
        measure(360, 170);
        const headings = screen.getAllByRole('heading');
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveAccessibleName('UN AUTRE LIEU TRES LONG');
    });
});
