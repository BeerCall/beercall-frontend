import React from 'react';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {BeerCall, SquadDetails} from '../../types/api';
import {AperoMarkerLayer} from './AperoMarkerLayer';

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
    private handlers = new Map<string, Set<() => void>>();

    getZoom = () => this.zoom;

    on = (event: string, handler: () => void) => {
        const handlers = this.handlers.get(event) ?? new Set<() => void>();
        handlers.add(handler);
        this.handlers.set(event, handlers);
    };

    off = (event: string, handler: () => void) => {
        this.handlers.get(event)?.delete(handler);
    };

    emit(event: string) {
        for (const handler of [...(this.handlers.get(event) ?? [])]) handler();
    }
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
});

describe('AperoMarkerLayer', () => {
    it('utilise la provenance du doublon valide retenu après filtrage des coordonnées', () => {
        const invalid = call('bc_same', Number.NaN, 48.85);
        const scheduled = call('bc_same', 2.35, 48.85, {status: 'scheduled', scheduled_for: future()});
        const props = makeProps({squadDetails: squad({active_beer_call: [invalid], scheduled_beer_calls: [scheduled]})});
        render(<AperoMarkerLayer {...props} />);
        fireEvent.click(screen.getByText('⏳'));
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
        screen.getByRole('button', {name: /Lieu bc_b/}).focus();
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
        fireEvent.click(screen.getByRole('button', {name: /Lieu actuel/}));
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
        // La bande de statuts contient un seul dot pour les deux statuts métier passés.
        expect(group.lastElementChild?.children).toHaveLength(1);
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

        fireEvent.click(screen.getByText('🍻'));
        expect(props.handleBeerCallClick).toHaveBeenCalledWith(active);

        fireEvent.click(screen.getByText('⏳'));
        expect(props.openCamera).toHaveBeenCalledWith({lat: 48.85, lng: 2.45}, scheduled);

        fireEvent.click(screen.getByText('👻'));
        expect(props.setIsWorldsModalOpen).toHaveBeenCalledWith('bc_p');
        expect(props.handleBeerCallClick).toHaveBeenCalledTimes(1);
    });

    it('regroupe au dézoom et rapproche la carte sans action métier', () => {
        const calls = groupOfThree();
        const props = makeProps({squadDetails: squad({active_beer_call: calls})});
        fake.cameraForBounds.mockReturnValue({center: [2.3505, 48.85], zoom: 15, bearing: 0});

        render(<AperoMarkerLayer {...props} />);
        const group = screen.getByRole('button', {name: /3 apéros regroupés/});

        fireEvent.pointerDown(group);
        expect(props.cancelLongPress).toHaveBeenCalledTimes(1);

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
        fake.zoom = 20;

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

    it('laisse le compte à rebours du marqueur programmé individuel', () => {
        vi.useFakeTimers();
        const scheduled = call('bc_s', 2.45, 48.85, {
            status: 'scheduled',
            scheduled_for: future(),
        });
        const {unmount} = render(<AperoMarkerLayer {...makeProps({
            squadDetails: squad({scheduled_beer_calls: [scheduled]}),
        })} />);

        expect(vi.getTimerCount()).toBeGreaterThan(0);
        unmount();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('capte le geste du groupe sans le laisser remonter à la carte', () => {
        const parentClick = vi.fn();
        const parentPointerDown = vi.fn();
        const calls = groupOfThree();
        const props = makeProps({squadDetails: squad({active_beer_call: calls})});

        render(
            <div onClick={parentClick} onPointerDown={parentPointerDown}>
                <AperoMarkerLayer {...props} />
            </div>,
        );

        const group = screen.getByRole('button', {name: /3 apéros regroupés/});
        fireEvent.pointerDown(group);
        expect(props.cancelLongPress).toHaveBeenCalledTimes(1);
        expect(parentPointerDown).not.toHaveBeenCalled();

        fireEvent.click(group);
        expect(parentClick).not.toHaveBeenCalled();
        expect(props.handleBeerCallClick).not.toHaveBeenCalled();
    });
});
