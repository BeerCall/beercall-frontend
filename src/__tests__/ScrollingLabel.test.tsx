import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScrollingLabel } from '../components/Dashboard/ScrollingLabel';

let resizeTriggers: Array<() => void> = [];
let intersectionTriggers: Array<(visible: boolean) => void> = [];
let reducedMotion = false;

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
        intersectionTriggers.push((visible: boolean) => callback(
            [{ isIntersecting: visible } as IntersectionObserverEntry],
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

function setVisible(visible: boolean): void {
    act(() => {
        for (const trigger of intersectionTriggers) trigger(visible);
    });
}

beforeEach(() => {
    resizeTriggers = [];
    intersectionTriggers = [];
    reducedMotion = false;
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: (query: string) => ({
            matches: reducedMotion && query.includes('prefers-reduced-motion'),
            media: query,
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }),
    });
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
        expect(host.style.touchAction).toBe('pan-x');
        expect(host.className).toContain('overflow-x-auto');
        expect(host.className).toContain('hide-scrollbar');
        expect(screen.queryByTestId('scrolling-label-track')).not.toBeInTheDocument();

        const scroll = screen.getByTestId('scrolling-label-scroll');
        expect(scroll).toHaveTextContent(long);
        expect(screen.getByTestId('scrolling-label-measure')).toHaveTextContent(long);
        expect(screen.getByRole('heading', { name: long })).toBe(host);
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
