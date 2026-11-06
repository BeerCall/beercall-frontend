import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SquadWheel from '../components/UI/SquadWheel';
import Navbar from '../components/UI/Navbar';
import type { Squad } from '../types/api';

const motionState = vi.hoisted(() => ({
    onDragEnd: undefined as undefined | ((event: unknown, info: { offset: { x: number } }) => void),
}));

vi.mock('framer-motion', async () => {
    const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
    return {
        ...actual,
        motion: {
            div: (props: {
                drag?: string;
                children?: ReactNode;
                className?: string;
                style?: unknown;
                'data-squad-drag'?: string;
                onDragEnd?: (event: unknown, info: { offset: { x: number } }) => void;
                onPointerDownCapture?: () => void;
            }) => {
                if (props.drag) motionState.onDragEnd = props.onDragEnd;
                return <div data-squad-drag={props['data-squad-drag']}
                            className={props.className}
                            onPointerDownCapture={props.onPointerDownCapture}>{props.children}</div>;
            },
        },
    };
});

vi.mock('../hooks/useSquads', () => ({
    useSquads: () => ({ data: undefined, isLoading: true }),
}));

const squad = (id: number, name: string): Squad => ({
    id,
    name,
    icon: 'beer',
    color: '#F59E0B',
    invite_code: `S${id}`,
});

const eight = (): Squad[] => [
    squad(1, 'Fluidite50'),
    squad(2, 'Fluidite40'),
    squad(4, 'Montagnards'),
    squad(5, 'Les Gros Buveurs'),
    squad(6, 'Potes'),
    squad(7, 'Squad de la Plage'),
    squad(8, "Buveurs d'Élite"),
    squad(9, 'Team Après-Midi'),
];

function mount(list = eight(), currentSquadId = '4', isNightMode = false) {
    const onSelect = vi.fn();
    const onCreate = vi.fn();
    const onJoin = vi.fn();
    const view = render(<SquadWheel squads={list} currentSquadId={currentSquadId}
                                     isNightMode={isNightMode} onSelect={onSelect}
                                     onCreate={onCreate} onJoin={onJoin}/>);
    return { ...view, onSelect, onCreate, onJoin };
}

function visibleIds(): number[] {
    return Array.from(document.querySelectorAll('[data-squad-drag] button[data-squad-id]'))
        .map(element => Number(element.getAttribute('data-squad-id')));
}

function drag(distance: number) {
    act(() => motionState.onDragEnd?.({}, { offset: { x: distance } }));
}

describe('arc des squads (8b-2)', () => {
    it('affiche 6 squads maximum, les plus récentes d’abord, sans pagination', () => {
        mount();
        expect(visibleIds()).toEqual([9, 8, 7, 6, 5, 4]);
        expect(screen.queryByText(/Page \d/)).not.toBeInTheDocument();
        expect(document.querySelector('[data-wheel-controls]')).toBeNull();
    });

    it('place Créer/Rejoindre aux deux bouts, hors de la zone de drag', () => {
        mount();
        const dragSurface = document.querySelector('[data-squad-drag]');
        const actions = document.querySelector('[data-squad-actions]');
        expect(dragSurface).toBeInTheDocument();
        expect(actions).toBeInTheDocument();
        expect(dragSurface).not.toContainElement(actions);
        expect(actions).toContainElement(screen.getByRole('button', {name: 'Créer'}));
        expect(actions).toContainElement(screen.getByRole('button', {name: 'Rejoindre'}));
    });

    it('trace un arc : les extrémités sont plus basses que le centre', () => {
        const { container } = mount();
        const slots = Array.from(container.querySelectorAll('[data-squad-slot]')) as HTMLElement[];
        expect(slots).toHaveLength(6);
        const tops = slots.map(slot => Number.parseFloat(slot.style.top));
        expect(tops[0]).toBeGreaterThan(tops[3]);
        expect(tops[5]).toBeGreaterThan(tops[3]);
        expect(Number.parseFloat(slots[0]!.style.left)).toBeLessThan(Number.parseFloat(slots[5]!.style.left));
    });

    it('fait défiler d’un cran au glissement, sans changer les actions', () => {
        const { onSelect } = mount();
        drag(-60);
        expect(visibleIds()).toEqual([8, 7, 6, 5, 4, 2]);
        expect(screen.getByRole('button', {name: 'Créer'})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Rejoindre'})).toBeInTheDocument();
        drag(-60);
        expect(visibleIds()).toEqual([7, 6, 5, 4, 2, 1]);
        expect(screen.getByText('FLUID40')).toBeInTheDocument();
        expect(screen.getByText('FLUID50')).toBeInTheDocument();
        // Le clic suivant un drag est neutralisé ; un tap normal sélectionne.
        fireEvent.click(screen.getByRole('button', {name: 'Potes'}), {detail: 1});
        expect(onSelect).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', {name: 'Potes'}), {detail: 0});
        expect(onSelect).toHaveBeenCalledWith(6);
    });

    it('ne bouge pas sous un petit geste et borne le défilement', () => {
        mount();
        drag(-10);
        expect(visibleIds()).toEqual([9, 8, 7, 6, 5, 4]);
        drag(200);
        expect(visibleIds()).toEqual([9, 8, 7, 6, 5, 4]);
        drag(-200);
        expect(visibleIds()).toEqual([7, 6, 5, 4, 2, 1]);
        drag(-200);
        expect(visibleIds()).toEqual([7, 6, 5, 4, 2, 1]);
    });

    it('sélectionne une squad au tap et garde son nom complet en aria-label', () => {
        const { onSelect } = mount();
        const trigger = screen.getByRole('button', {name: 'Montagnards'});
        expect(trigger).toHaveAttribute('aria-current', 'page');
        fireEvent.click(trigger, {detail: 0});
        expect(onSelect).toHaveBeenCalledExactlyOnceWith(4);
    });

    it('garde les actions pendant le chargement', () => {
        render(<SquadWheel squads={[]} isLoading onSelect={vi.fn()} onCreate={vi.fn()} onJoin={vi.fn()}/>);
        expect(screen.getByRole('status')).toHaveTextContent('Chargement des squads');
        expect(screen.getByRole('button', {name: 'Créer'})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Rejoindre'})).toBeInTheDocument();
    });

    it('applique la palette de nuit', () => {
        mount(eight(), '4', true);
        const labels = document.querySelectorAll('[data-squad-label]');
        expect(labels.length).toBeGreaterThan(0);
        labels.forEach(label => {
            expect(label).toHaveClass('text-beer-light');
            expect(label).not.toHaveClass('bg-white');
        });
    });

    it('garde la barre du bas après l’arc', () => {
        const { container } = render(
            <MemoryRouter><Navbar onCreateClick={vi.fn()} onJoinClick={vi.fn()}/></MemoryRouter>,
        );
        expect(screen.getByRole('status')).toHaveTextContent('Chargement des squads');
        expect(screen.getByRole('button', {name: 'Profil'})).toBeInTheDocument();
        const dock = container.querySelector('[data-squad-dock]');
        const bar = container.querySelector('[data-bottom-nav]');
        expect(dock?.nextElementSibling).toBe(bar);
    });
});
