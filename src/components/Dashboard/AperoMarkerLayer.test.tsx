import React from 'react';
import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {BeerCall, SquadDetails} from '../../types/api';
import {AperoMarkerLayer} from './AperoMarkerLayer';
import {
    activeLabel,
    activeTotemAnimation,
    clockLabel,
    groupLive,
    groupTotemSpec,
    pastLabel,
    pastTotemSpec,
    scheduledTotemAnimation,
    totemPalette,
} from './aperoTotems';

const mapState = vi.hoisted(() => ({current: null as unknown}));

vi.mock('react-map-gl/maplibre', () => ({
    Marker: ({children}: {children?: React.ReactNode}) => (
        <div data-testid="mock-marker">{children}</div>
    ),
    useMap: () => ({current: mapState.current}),
}));

class FakeMap {
    zoom = 12;
    bearing = 65;
    getBearing = () => this.bearing;
    easeTo = vi.fn();
    cameraForBounds = vi.fn((): {center: [number, number]; zoom: number; bearing: number} | null => ({
        center: [2.35, 48.85],
        zoom: 15,
        bearing: 0,
    }));
    layers = new Set<string>();
    images = new Set<string>();
    queryResult: unknown[] = [];
    visibleTotems = true;
    features: Array<{properties?: Record<string, unknown>}> = [];
    updateImage = vi.fn();
    triggerRepaint = vi.fn();
    queryRenderedFeatures = vi.fn((point?: unknown, options?: {layers?: string[]}) => {
        void point;
        if (options?.layers?.includes('apero-totems')) return this.visibleTotems ? this.features : [];
        return this.queryResult;
    });
    private handlers = new Map<string, Set<(event?: unknown) => void>>();
    private sources = new Map<string, {setData: (data: unknown) => void}>();

    getZoom = () => this.zoom;
    isStyleLoaded = () => true;
    getCanvas = () => ({style: {cursor: ''}});
    getStyle = (): {layers: Array<{id: string}>} | undefined => ({layers: [...this.layers].map((id) => ({id}))});

    on = (event: string, arg1: unknown, arg2?: unknown) => {
        const handler = (typeof arg1 === 'function' ? arg1 : arg2) as (event?: unknown) => void;
        const handlers = this.handlers.get(event) ?? new Set<(event?: unknown) => void>();
        handlers.add(handler);
        this.handlers.set(event, handlers);
    };

    off = (event: string, arg1: unknown, arg2?: unknown) => {
        const handler = (typeof arg1 === 'function' ? arg1 : arg2) as (event?: unknown) => void;
        this.handlers.get(event)?.delete(handler);
    };

    emit(event: string, payload?: unknown) {
        for (const handler of [...(this.handlers.get(event) ?? [])]) handler(payload);
    }

    addSource = (id: string) => {
        this.sources.set(id, {setData: vi.fn((data: unknown) => {
            this.features = (data as {features: Array<{properties?: Record<string, unknown>}>}).features;
            this.emit('sourcedata', {sourceId: id});
            this.emit('render');
        })});
    };
    getSource = (id: string) => this.sources.get(id);
    removeSource = (id: string) => {
        this.sources.delete(id);
    };
    getLayer = (id: string) => this.layers.has(id) ? {id} : undefined;
    addLayer = vi.fn((layer: {id: string}, before?: string) => {
        const layers = [...this.layers];
        const index = before ? layers.indexOf(before) : -1;
        layers.splice(index < 0 ? layers.length : index, 0, layer.id);
        this.layers = new Set(layers);
    });
    moveLayer = vi.fn();
    removeLayer = (id: string) => {
        this.layers.delete(id);
    };
    addImage = (id: string) => {
        this.images.add(id);
    };
    hasImage = (id: string) => this.images.has(id);
    removeImage = (id: string) => {
        this.images.delete(id);
    };
}

let fake: FakeMap;

const future = () => new Date(Date.now() + 3_600_000).toISOString();

const call = (
    id: string,
    longitude: number,
    latitude: number,
    overrides: Partial<BeerCall> = {},
): BeerCall => ({
    id,
    creator_name: 'Test',
    creator_id: 1,
    location_name: `Lieu ${id}`,
    longitude,
    latitude,
    status: 'active',
    participants_count: 1,
    has_responded: false,
    can_start: false,
    ...overrides,
});

const squad = (overrides: Partial<SquadDetails> = {}): SquadDetails => ({
    id: '2',
    name: 'Test',
    color: '#F59E0B',
    icon: 'beer',
    invite_code: 'TEST',
    active_beer_call: [],
    scheduled_beer_calls: [],
    past_beer_calls: [],
    ...overrides,
});

function makeProps(
    overrides: Partial<Parameters<typeof AperoMarkerLayer>[0]> = {},
): Parameters<typeof AperoMarkerLayer>[0] {
    return {
        squadDetails: squad(),
        handleBeerCallClick: vi.fn(),
        openCamera: vi.fn(),
        setIsWorldsModalOpen: vi.fn(),
        cancelLongPress: vi.fn(),
        ...overrides,
    };
}

const groupOfThree = () => [
    call('bc_a', 2.35, 48.85),
    call('bc_b', 2.3505, 48.85),
    call('bc_c', 2.351, 48.85),
];

beforeEach(() => {
    fake = new FakeMap();
    mapState.current = {getMap: () => fake};
});

afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('AperoMarkerLayer', () => {
    function imageStub(failed = false) {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
            drawImage: vi.fn(),
            getImageData: () => ({width: 2, height: 2, data: new Uint8ClampedArray(16)}),
        }) as unknown as ReturnType<HTMLCanvasElement['getContext']>);
        vi.stubGlobal('Image', class {
            naturalWidth = 2;
            naturalHeight = 2;
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            set src(_value: string) { queueMicrotask(() => failed ? this.onerror?.() : this.onload?.()); }
        });
    }

    it('demande un nouveau rendu après changement de frame même sans geste de caméra', async () => {
        imageStub();
        vi.useFakeTimers();
        render(<AperoMarkerLayer {...makeProps({squadDetails: squad({active_beer_call: [call('bc_a', 2.35, 48.85)]})})} />);
        await act(async () => { await Promise.resolve(); });
        expect(fake.images.size).toBeGreaterThan(0);
        fake.triggerRepaint.mockClear();
        act(() => vi.advanceTimersByTime(1000));
        expect(fake.updateImage).toHaveBeenCalled();
        expect(fake.triggerRepaint).toHaveBeenCalled();
        expect(fake.triggerRepaint.mock.calls.length).toBeGreaterThanOrEqual(20);
        expect(fake.triggerRepaint.mock.calls.length).toBeLessThanOrEqual(25);
    });

    it('arrête le travail hors écran et reprend à la réapparition sans geste supplémentaire', async () => {
        imageStub();
        vi.useFakeTimers();
        fake.visibleTotems = false;
        render(<AperoMarkerLayer {...makeProps({squadDetails: squad({active_beer_call: [call('bc_a', 2.35, 48.85)]})})} />);
        await act(async () => { await Promise.resolve(); });
        fake.updateImage.mockClear(); fake.triggerRepaint.mockClear();
        act(() => vi.advanceTimersByTime(1000));
        expect(vi.getTimerCount()).toBe(0);
        expect(fake.updateImage).not.toHaveBeenCalled();
        expect(fake.triggerRepaint).not.toHaveBeenCalled();
        act(() => { fake.visibleTotems = true; fake.emit('moveend'); fake.emit('render'); });
        act(() => vi.advanceTimersByTime(1000));
        expect(fake.updateImage.mock.calls.length).toBeGreaterThanOrEqual(20);
        act(() => { fake.visibleTotems = false; fake.emit('moveend'); fake.emit('render'); });
        expect(vi.getTimerCount()).toBe(0);
    });

    it('démarre sans geste quand les totems sont placés après le montage', async () => {
        imageStub();
        vi.useFakeTimers();
        fake.visibleTotems = false;
        render(<AperoMarkerLayer {...makeProps({squadDetails: squad({active_beer_call: [call('bc_a', 2.35, 48.85)]})})} />);
        await act(async () => { await Promise.resolve(); });
        fake.updateImage.mockClear(); fake.triggerRepaint.mockClear();
        act(() => vi.advanceTimersByTime(600));
        expect(vi.getTimerCount()).toBe(0);
        expect(fake.updateImage).not.toHaveBeenCalled();
        // Le placement MapLibre n'aboutit qu'après les premières frames :
        // `idle` doit suffire à lancer l'animation, sans pan ni pinch.
        act(() => { fake.visibleTotems = true; fake.emit('idle'); });
        expect(vi.getTimerCount()).toBe(1);
        act(() => vi.advanceTimersByTime(500));
        expect(fake.updateImage).toHaveBeenCalled();
        expect(fake.triggerRepaint).toHaveBeenCalled();
    });

    it('partage une horloge et un repaint pour plusieurs icônes, sans rendu React par frame', async () => {
        imageStub();
        vi.useFakeTimers();
        const commit = vi.fn();
        render(<React.Profiler id="totems" onRender={commit}><AperoMarkerLayer {...makeProps({squadDetails: squad({
            active_beer_call: [call('bc_a', 2.35, 48.85)],
            scheduled_beer_calls: [call('bc_s', 3.5, 49.5, {status: 'scheduled'})],
        })})} /></React.Profiler>);
        await act(async () => { await Promise.resolve(); });
        fake.updateImage.mockClear(); fake.triggerRepaint.mockClear(); commit.mockClear();
        fake.queryRenderedFeatures.mockClear();
        act(() => vi.advanceTimersByTime(1000));
        expect(vi.getTimerCount()).toBe(1);
        expect(fake.updateImage.mock.calls.length).toBe(fake.triggerRepaint.mock.calls.length * 2);
        expect(fake.queryRenderedFeatures).not.toHaveBeenCalled();
        expect(commit).not.toHaveBeenCalled();
    });

    it('prépare assez de frames distinctes pour une animation fluide sans changer le dessin', () => {
        const active = activeTotemAnimation(totemPalette());
        const scheduled = scheduledTotemAnimation(totemPalette());
        expect(active.frames.length).toBeGreaterThanOrEqual(24);
        expect(new Set(active.frames.map((frame) => frame.svg)).size).toBeGreaterThan(6);
        expect(scheduled.frames.length).toBeGreaterThanOrEqual(24);
    });

    it('réinstalle les images mises en cache après un changement de style', async () => {
        imageStub();
        render(<AperoMarkerLayer {...makeProps({squadDetails: squad({active_beer_call: groupOfThree()})})} />);
        await waitFor(() => expect(fake.images.size).toBeGreaterThan(0));
        fake.images.clear();
        fake.removeLayer('apero-totems');
        fake.removeSource('apero-totems');
        act(() => fake.emit('styledata'));
        await waitFor(() => expect(fake.images.size).toBeGreaterThan(0));
    });

    it('ne nettoie pas les images après destruction du style par le parent MapLibre', async () => {
        imageStub();
        const {unmount} = render(<AperoMarkerLayer {...makeProps({squadDetails: squad({active_beer_call: groupOfThree()})})} />);
        await waitFor(() => expect(fake.images.size).toBeGreaterThan(0));
        fake.getStyle = () => undefined;
        fake.hasImage = () => { throw new Error('MapLibre style undefined: getImage'); };
        expect(() => unmount()).not.toThrow();
    });

    it('ne réordonne pas une couche déjà placée sous les avatars à chaque styledata', () => {
        fake.layers.add('snap-bases');
        render(<AperoMarkerLayer {...makeProps()} />);
        expect(fake.addLayer).toHaveBeenCalledWith(expect.objectContaining({id: 'apero-totems'}), 'snap-bases');
        act(() => fake.emit('styledata'));
        expect(fake.moveLayer).not.toHaveBeenCalled();
    });

    it('ne laisse ni animation ni action carte lorsque la couche est masquée', () => {
        vi.useFakeTimers();
        const props = makeProps({enabled: false, squadDetails: squad({active_beer_call: [call('bc_a', 2.35, 48.85)]})});
        render(<AperoMarkerLayer {...props} />);
        expect(vi.getTimerCount()).toBe(0);
        act(() => fake.emit('click', {point: {x: 10, y: 10}, features: [{properties: {entryId: 'bc_a'}}]}));
        expect(props.handleBeerCallClick).not.toHaveBeenCalled();
    });

    it('réagit au changement de préférence mouvement réduit sans remonter la carte', async () => {
        imageStub();
        vi.useFakeTimers();
        const media = Object.assign(new EventTarget(), {matches: false});
        vi.stubGlobal('matchMedia', vi.fn(() => media));
        render(<AperoMarkerLayer {...makeProps({squadDetails: squad({active_beer_call: [call('bc_a', 2.35, 48.85)]})})} />);
        await act(async () => { await Promise.resolve(); });
        expect(vi.getTimerCount()).toBe(1);
        act(() => { media.matches = true; media.dispatchEvent(new Event('change')); });
        expect(vi.getTimerCount()).toBe(0);
        act(() => { media.matches = false; media.dispatchEvent(new Event('change')); });
        expect(vi.getTimerCount()).toBe(1);
    });

    it('suspend les animations lorsque le document est masqué puis les reprend', async () => {
        imageStub();
        vi.useFakeTimers();
        const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
        render(<AperoMarkerLayer {...makeProps({squadDetails: squad({active_beer_call: [call('bc_a', 2.35, 48.85)]})})} />);
        await act(async () => { await Promise.resolve(); });
        expect(vi.getTimerCount()).toBe(1);
        act(() => { hidden.mockReturnValue(true); document.dispatchEvent(new Event('visibilitychange')); });
        expect(vi.getTimerCount()).toBe(0);
        act(() => { hidden.mockReturnValue(false); document.dispatchEvent(new Event('visibilitychange')); });
        expect(vi.getTimerCount()).toBe(1);
    });

    it('signale une image illisible et garde un bouton de secours sélectionnable', async () => {
        imageStub(true);
        const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const props = makeProps({squadDetails: squad({active_beer_call: groupOfThree()})});
        render(<AperoMarkerLayer {...props} />);
        const button = screen.getByRole('button', {name: /3 apéros regroupés/});
        await waitFor(() => expect(button.getAttribute('data-apero-fallback')).toBe('true'));
        expect(warning).toHaveBeenCalled();
        fireEvent.click(button);
        expect(fake.easeTo).toHaveBeenCalled();
        expect(props.handleBeerCallClick).not.toHaveBeenCalled();
    });

    it('ne bloque pas un totem pour une base d’avatar sans action de profil', () => {
        fake.layers.add('snap-bases');
        fake.queryRenderedFeatures.mockImplementation((_point, options) => options?.layers?.includes('snap-bases') ? [{}] : []);
        const props = makeProps({squadDetails: squad({active_beer_call: [call('bc_a', 2.35, 48.85)]})});
        render(<AperoMarkerLayer {...props} />);
        act(() => fake.emit('click', {point: {x: 10, y: 10}, features: [{properties: {entryId: 'bc_a'}}]}));
        expect(props.handleBeerCallClick).toHaveBeenCalledWith(expect.objectContaining({id: 'bc_a'}));
    });

    it('garde le style ambré pour FLUID50 et bascule en cyan pour FLUID40', () => {
        const amber = totemPalette('#FFCC00');
        const cyan = totemPalette('#06B6D4');
        const ended = totemPalette('#FFCC00', true);
        expect(amber.top).toBe('#FBBF24');
        expect(cyan.top).toBe('#38BDF8');
        expect(ended.top).toBe('#F1F5F9');
        expect(totemPalette('var(--foreign)').top).toBe('#FBBF24');
    });

    it('formate les libellés accessibles des totems', () => {
        expect(activeLabel(4)).toBe('EN COURS · +4');
        expect(activeLabel(0)).toBe('EN COURS');
        expect(clockLabel(future())).toMatch(/^\d{2}:\d{2}$/);
        expect(clockLabel(undefined)).toBe('PROGRAMMÉ');
        expect(pastLabel(new Date(Date.now() - 3 * 86_400_000).toISOString())).toContain('3 J');
        expect(groupLive(['active', 'ended'])).toBe(true);
        expect(groupLive(['ended', 'cancelled'])).toBe(false);
    });

    it('dessine les totems animés, sans libellé sous l’objet', () => {
        const animation = activeTotemAnimation(totemPalette('#FFCC00'));
        const spec = animation.frames[0];
        expect(spec.svg).toContain('drop-shadow');
        expect(spec.svg).toContain('#FBBF24');
        expect(spec.svg).not.toContain('EN COURS');
        expect(animation.frames.length).toBeGreaterThan(1);
        expect(animation.frames[1].svg).not.toBe(spec.svg);
        const scheduled = scheduledTotemAnimation(totemPalette('#FFCC00'));
        expect(scheduled.frames.length).toBeGreaterThan(1);
        expect(scheduled.frames[2].svg).not.toBe(scheduled.frames[0].svg);
        const group = groupTotemSpec(5, totemPalette('#FFCC00'));
        expect(group.svg).toContain('>5<');
        expect(group.svg).not.toContain('GIRAFE');
        const past = pastTotemSpec();
        expect(past.svg).toContain('rotate(-16');
        expect(past.svg).not.toContain('VIDE');
    });

    it('utilise la provenance du doublon valide retenu après filtrage des coordonnées', () => {
        const invalid = call('bc_same', Number.NaN, 48.85);
        const scheduled = call('bc_same', 2.35, 48.85, {status: 'scheduled', scheduled_for: future()});
        const props = makeProps({squadDetails: squad({active_beer_call: [invalid], scheduled_beer_calls: [scheduled]})});
        render(<AperoMarkerLayer {...props} />);
        fireEvent.click(screen.getByRole('button', {name: /Participer à l'apéro Lieu bc_same/}));
        expect(props.openCamera).toHaveBeenCalledWith({lng: 2.35, lat: 48.85}, scheduled);
        expect(props.handleBeerCallClick).not.toHaveBeenCalled();
    });

    it('ferme définitivement la feuille quand la carte est masquée', () => {
        const props = makeProps({squadDetails: squad({active_beer_call: [call('bc_a', 2.35, 48.85), call('bc_b', 2.35, 48.85)]})});
        const {rerender} = render(<AperoMarkerLayer {...props} />);
        fireEvent.click(screen.getByRole('button', {name: /2 apéros regroupés/}));
        rerender(<AperoMarkerLayer {...props} enabled={false} />);
        expect(screen.queryByRole('dialog')).toBeNull();
        rerender(<AperoMarkerLayer {...props} enabled />);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('ne ressuscite pas une sélection après retrait puis retour des données', () => {
        const props = makeProps({squadDetails: squad({active_beer_call: [call('bc_a', 2.35, 48.85), call('bc_b', 2.35, 48.85)]})});
        const {rerender} = render(<AperoMarkerLayer {...props} />);
        fireEvent.click(screen.getByRole('button', {name: /2 apéros regroupés/}));
        rerender(<AperoMarkerLayer {...props} squadDetails={squad()} />);
        expect(screen.queryByRole('dialog')).toBeNull();
        rerender(<AperoMarkerLayer {...props} />);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('ramène Tab dans la feuille si une actualisation a retiré la ligne focalisée', () => {
        const a = call('bc_a', 2.35, 48.85);
        const b = call('bc_b', 2.35, 48.85);
        const props = makeProps({squadDetails: squad({active_beer_call: [a, b]})});
        const {rerender} = render(<AperoMarkerLayer {...props} />);
        fireEvent.click(screen.getByRole('button', {name: /2 apéros regroupés/}));
        const dialog = screen.getByRole('dialog', {name: /Apéros au même endroit/});
        within(dialog).getByRole('button', {name: /Lieu bc_b/}).focus();
        rerender(<AperoMarkerLayer {...props} squadDetails={squad({active_beer_call: [a]})} />);
        fireEvent.keyDown(document, {key: 'Tab'});
        expect(document.activeElement).toBe(screen.getByRole('button', {name: 'Fermer'}));
    });

    it('actualise la feuille ouverte et retire les apéros devenus invisibles', () => {
        const a = call('bc_a', 2.35, 48.85, {location_name: 'Ancien lieu'});
        const b = call('bc_b', 2.35, 48.85, {location_name: 'Lieu retiré'});
        const props = makeProps({squadDetails: squad({active_beer_call: [a, b]})});
        const {rerender} = render(<AperoMarkerLayer {...props} />);
        fireEvent.click(screen.getByRole('button', {name: /2 apéros regroupés/}));
        const updated = {...a, status: 'ended' as const, location_name: 'Lieu actuel'};
        rerender(<AperoMarkerLayer {...props} squadDetails={squad({past_beer_calls: [updated]})} />);
        expect(screen.queryByText('Ancien lieu')).toBeNull();
        expect(screen.queryByText('Lieu retiré')).toBeNull();
        const dialog = screen.getByRole('dialog', {name: /Apéros au même endroit/});
        fireEvent.click(within(dialog).getByRole('button', {name: /Lieu actuel/}));
        expect(props.handleBeerCallClick).not.toHaveBeenCalled();
        expect(props.setIsWorldsModalOpen).toHaveBeenCalledWith(updated.id);
    });

    it('ferme la feuille au changement de squad même avec les mêmes ids', () => {
        const calls = [call('bc_a', 2.35, 48.85), call('bc_b', 2.35, 48.85)];
        const props = makeProps({squadDetails: squad({active_beer_call: calls})});
        const {rerender} = render(<AperoMarkerLayer {...props} />);
        fireEvent.click(screen.getByRole('button', {name: /2 apéros regroupés/}));
        rerender(<AperoMarkerLayer {...props} squadDetails={squad({id: 'other', active_beer_call: calls})} />);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('ne laisse aucun dialogue lorsque toutes les données disparaissent', () => {
        const props = makeProps({squadDetails: squad({active_beer_call: [call('bc_a', 2.35, 48.85), call('bc_b', 2.35, 48.85)]})});
        const {rerender} = render(<AperoMarkerLayer {...props} />);
        fireEvent.click(screen.getByRole('button', {name: /2 apéros regroupés/}));
        rerender(<AperoMarkerLayer {...props} squadDetails={null} />);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('fusionne ended et cancelled en un seul statut visuel passé', () => {
        const props = makeProps({squadDetails: squad({past_beer_calls: [
            call('bc_a', 2.35, 48.85, {status: 'ended'}),
            call('bc_b', 2.35, 48.85, {status: 'cancelled'}),
        ]})});
        render(<AperoMarkerLayer {...props} />);
        const group = screen.getByRole('button', {name: /2 apéros regroupés/});
        expect(group.getAttribute('aria-label')).not.toMatch(/passé et passé/);
        expect(group.getAttribute('aria-label')).toContain('Dont passé.');
    });

    it('cadre au bearing courant et respecte la réduction des animations', () => {
        vi.stubGlobal('matchMedia', vi.fn(() => ({matches: true})));
        const props = makeProps({squadDetails: squad({active_beer_call: groupOfThree()})});
        render(<AperoMarkerLayer {...props} />);
        fireEvent.click(screen.getByRole('button', {name: /3 apéros regroupés/}));
        expect(fake.cameraForBounds).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({bearing: 65, maxZoom: 20}));
        expect(fake.easeTo).toHaveBeenCalledWith(expect.objectContaining({duration: 0}));
    });

    it('ne rend aucun marqueur sans apéro', () => {
        render(<AperoMarkerLayer {...makeProps({squadDetails: null})} />);
        expect(screen.queryAllByTestId('mock-marker')).toHaveLength(0);
    });

    it('conserve les trois actions individuelles', () => {
        const active = call('bc_a', 2.35, 48.85);
        const scheduled = call('bc_s', 2.45, 48.85, {
            status: 'scheduled',
            scheduled_for: future(),
        });
        const past = call('bc_p', 2.55, 48.85, {status: 'ended'});
        const props = makeProps({
            squadDetails: squad({
                active_beer_call: [active],
                scheduled_beer_calls: [scheduled],
                past_beer_calls: [past],
            }),
        });

        render(<AperoMarkerLayer {...props} />);
        expect(screen.getAllByTestId('mock-marker')).toHaveLength(3);

        fireEvent.click(screen.getByRole('button', {name: /Voir l'apéro Lieu bc_a/}));
        expect(props.handleBeerCallClick).toHaveBeenCalledWith(active);

        fireEvent.click(screen.getByRole('button', {name: /Participer à l'apéro Lieu bc_s/}));
        expect(props.openCamera).toHaveBeenCalledWith({lat: 48.85, lng: 2.45}, scheduled);

        fireEvent.click(screen.getByRole('button', {name: /Voir le monde de Lieu bc_p/}));
        expect(props.setIsWorldsModalOpen).toHaveBeenCalledWith('bc_p');
        expect(props.handleBeerCallClick).toHaveBeenCalledTimes(1);
    });

    it('regroupe au dézoom et rapproche la carte sans action métier', () => {
        const calls = groupOfThree();
        const props = makeProps({squadDetails: squad({active_beer_call: calls})});
        fake.cameraForBounds.mockReturnValue({center: [2.3505, 48.85], zoom: 15, bearing: 0});

        render(<AperoMarkerLayer {...props} />);
        const group = screen.getByRole('button', {name: /3 apéros regroupés/});

        fireEvent.click(group);
        expect(fake.easeTo).toHaveBeenCalledWith(expect.objectContaining({
            center: [2.3505, 48.85],
            zoom: 15,
            essential: false,
        }));
        expect(props.handleBeerCallClick).not.toHaveBeenCalled();
        expect(props.openCamera).not.toHaveBeenCalled();
        expect(props.setIsWorldsModalOpen).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('sépare le groupe quand le zoom atteint le niveau suivant', () => {
        const calls = groupOfThree();
        render(<AperoMarkerLayer {...makeProps({squadDetails: squad({active_beer_call: calls})})} />);
        expect(screen.getByRole('button', {name: /3 apéros regroupés/})).not.toBeNull();

        fake.zoom = 20;
        act(() => fake.emit('zoom'));

        expect(screen.queryByRole('button', {name: /regroupés/})).toBeNull();
        expect(screen.getAllByTestId('mock-marker')).toHaveLength(3);
    });

    it('affiche un totem distinct par apéro au zoom de détail, même au même point', () => {
        const active = call('bc_a', 2.35, 48.85, {location_name: 'Bar Alpha'});
        const scheduled = call('bc_s', 2.35, 48.85, {
            status: 'scheduled',
            location_name: 'Bar Bravo',
            scheduled_for: future(),
        });
        const past = call('bc_e', 2.35, 48.85, {status: 'ended', location_name: 'Bar Charlie'});
        fake.zoom = 20;

        render(<AperoMarkerLayer {...makeProps({
            squadDetails: squad({
                active_beer_call: [active],
                scheduled_beer_calls: [scheduled],
                past_beer_calls: [past],
            }),
        })} />);

        expect(screen.queryByRole('button', {name: /apéros regroupés/})).toBeNull();
        expect(screen.getAllByTestId('mock-marker')).toHaveLength(3);
        expect(screen.getByRole('button', {name: /Bar Alpha/})).not.toBeNull();
        expect(screen.getByRole('button', {name: /Bar Bravo/})).not.toBeNull();
        expect(screen.getByRole('button', {name: /Bar Charlie/})).not.toBeNull();
    });

    it('ouvre la feuille pour des coordonnées identiques et déclenche chaque action', () => {
        const active = call('bc_a', 2.35, 48.85, {location_name: 'Bar Alpha'});
        const scheduled = call('bc_s', 2.35, 48.85, {
            status: 'scheduled',
            location_name: 'Bar Bravo',
            scheduled_for: future(),
        });
        const past = call('bc_e', 2.35, 48.85, {status: 'ended', location_name: 'Bar Charlie'});
        const props = makeProps({
            squadDetails: squad({
                active_beer_call: [active],
                scheduled_beer_calls: [scheduled],
                past_beer_calls: [past],
            }),
        });
        fake.zoom = 18;

        render(<AperoMarkerLayer {...props} />);
        const open = () => {
            const group = screen.getByRole('button', {name: /3 apéros regroupés/});
            fireEvent.click(group);
            return group;
        };

        open();
        expect(screen.getByRole('dialog', {name: 'Apéros au même endroit'})).not.toBeNull();
        expect(fake.easeTo).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', {name: /Bar Alpha/}));
        expect(props.handleBeerCallClick).toHaveBeenCalledWith(active);
        expect(screen.queryByRole('dialog')).toBeNull();

        open();
        fireEvent.click(screen.getByRole('button', {name: /Bar Bravo/}));
        expect(props.openCamera).toHaveBeenCalledWith({lat: 48.85, lng: 2.35}, scheduled);

        open();
        fireEvent.click(screen.getByRole('button', {name: /Bar Charlie/}));
        expect(props.setIsWorldsModalOpen).toHaveBeenCalledWith('bc_e');

        open();
        const closeButton = screen.getByRole('button', {name: 'Fermer'});
        const lastRow = screen.getByRole('button', {name: /Bar Charlie/});
        expect(document.activeElement).toBe(closeButton);
        lastRow.focus();
        fireEvent.keyDown(document, {key: 'Tab'});
        expect(document.activeElement).toBe(closeButton);
        fireEvent.keyDown(document, {key: 'Tab', shiftKey: true});
        expect(document.activeElement).toBe(lastRow);
        fireEvent.keyDown(document, {key: 'Escape'});
        expect(screen.queryByRole('dialog')).toBeNull();

        open();
        fireEvent.click(screen.getByTestId('apero-member-sheet-backdrop'));
        expect(screen.queryByRole('dialog')).toBeNull();

        const group = open();
        fireEvent.click(screen.getByRole('button', {name: 'Fermer'}));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(document.activeElement).toBe(group);
    });

    it('ouvre la feuille quand le cadrage ne peut pas avancer', () => {
        const calls = groupOfThree();
        const props = makeProps({squadDetails: squad({active_beer_call: calls})});
        fake.cameraForBounds.mockReturnValue(null);

        render(<AperoMarkerLayer {...props} />);
        fireEvent.click(screen.getByRole('button', {name: /3 apéros regroupés/}));

        expect(screen.getByRole('dialog', {name: 'Apéros au même endroit'})).not.toBeNull();
        expect(fake.easeTo).not.toHaveBeenCalled();
    });

    it('ouvre la feuille quand le cadrage gagne moins d’un quart de zoom', () => {
        const calls = groupOfThree();
        const props = makeProps({squadDetails: squad({active_beer_call: calls})});
        fake.cameraForBounds.mockReturnValue({center: [2.3505, 48.85], zoom: 12.1, bearing: 0});

        render(<AperoMarkerLayer {...props} />);
        fireEvent.click(screen.getByRole('button', {name: /3 apéros regroupés/}));

        expect(screen.getByRole('dialog', {name: 'Apéros au même endroit'})).not.toBeNull();
        expect(fake.easeTo).not.toHaveBeenCalled();
    });

    it('n’ajoute aucun intervalle pour un programmé regroupé', () => {
        vi.useFakeTimers();
        const scheduled = call('bc_s', 2.3505, 48.85, {
            status: 'scheduled',
            scheduled_for: future(),
        });
        render(<AperoMarkerLayer {...makeProps({
            squadDetails: squad({
                active_beer_call: [call('bc_a', 2.35, 48.85)],
                scheduled_beer_calls: [scheduled],
            }),
        })} />);

        expect(screen.getByRole('button', {name: /2 apéros regroupés/})).not.toBeNull();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('anime un programmé individuel puis nettoie l’intervalle', async () => {
        imageStub();
        vi.useFakeTimers();
        const scheduled = call('bc_s', 2.45, 48.85, {
            status: 'scheduled',
            scheduled_for: future(),
        });
        const {unmount} = render(<AperoMarkerLayer {...makeProps({
            squadDetails: squad({scheduled_beer_calls: [scheduled]}),
        })} />);

        await act(async () => { await Promise.resolve(); });

        expect(screen.getByRole('button', {name: /Participer à l'apéro Lieu bc_s/})).not.toBeNull();
        expect(vi.getTimerCount()).toBeGreaterThan(0);
        unmount();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('coupe l’animation en mouvement réduit', () => {
        vi.useFakeTimers();
        vi.stubGlobal('matchMedia', vi.fn(() => ({matches: true})));
        const scheduled = call('bc_s', 2.45, 48.85, {
            status: 'scheduled',
            scheduled_for: future(),
        });
        render(<AperoMarkerLayer {...makeProps({
            squadDetails: squad({scheduled_beer_calls: [scheduled]}),
        })} />);

        expect(vi.getTimerCount()).toBe(0);
    });

    it('déclenche l’action par la carte', () => {
        const props = makeProps({squadDetails: squad({active_beer_call: [call('bc_a', 2.35, 48.85)]})});
        render(<AperoMarkerLayer {...props} />);

        fake.queryResult = [];
        act(() => fake.emit('click', {
            point: {x: 10, y: 10},
            features: [{properties: {entryId: 'bc_a'}}],
        }));
        expect(props.handleBeerCallClick).toHaveBeenCalledWith(
            expect.objectContaining({id: 'bc_a'}),
        );
    });

    it('laisse un avatar au-dessus du totem gagner le clic', () => {
        const props = makeProps({squadDetails: squad({active_beer_call: [call('bc_a', 2.35, 48.85)]})});
        render(<AperoMarkerLayer {...props} />);

        fake.layers.add('snap-avatars');
        fake.queryResult = [{layer: {id: 'snap-avatars'}}];
        act(() => fake.emit('click', {
            point: {x: 10, y: 10},
            features: [{properties: {entryId: 'bc_a'}}],
        }));
        expect(props.handleBeerCallClick).not.toHaveBeenCalled();
    });
});
