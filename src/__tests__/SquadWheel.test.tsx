import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SquadWheel from '../components/UI/SquadWheel';
import Navbar from '../components/UI/Navbar';
import type { Squad } from '../types/api';

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

const six = (): Squad[] => [
    squad(4, 'Montagnards'),
    squad(5, 'Les Gros Buveurs'),
    squad(6, 'Potes'),
    squad(7, 'Squad de la Plage'),
    squad(8, "Buveurs d'Élite"),
    squad(9, 'Team Après-Midi'),
];

function mount(list = six(), currentSquadId = '4', isNightMode = false) {
    const onSelect = vi.fn();
    const onCreate = vi.fn();
    const onJoin = vi.fn();
    const view = render(<SquadWheel squads={list} currentSquadId={currentSquadId}
                                     isNightMode={isNightMode} onSelect={onSelect}
                                     onCreate={onCreate} onJoin={onJoin}/>);
    return { ...view, onSelect, onCreate, onJoin };
}

describe('barre des squads (8b)', () => {
    it('affiche toutes les squads en une fois, sans pagination', () => {
        const list = [...six(), squad(1, 'Fluidite50'), squad(2, 'Fluidite40')];
        mount(list);
        for (const item of list) {
            expect(screen.getByRole('button', {name: item.name})).toBeInTheDocument();
        }
        expect(screen.getAllByText(/./, {selector: '[data-squad-label]'}).length).toBe(list.length + 2);
        expect(screen.queryByText(/Page \d/)).not.toBeInTheDocument();
        expect(screen.queryByText('Page suivante')).not.toBeInTheDocument();
        expect(document.querySelector('[data-wheel-controls]')).toBeNull();
    });

    it('sélectionne une squad directement, sans dialogue', () => {
        const { onSelect } = mount();
        fireEvent.click(screen.getByRole('button', {name: 'Potes'}));
        expect(onSelect).toHaveBeenCalledExactlyOnceWith(6);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('garde Créer et Rejoindre dans la dernière rangée, collée à la barre', () => {
        const { container, onCreate, onJoin } = mount();
        const dock = screen.getByRole('region', {name: 'Barre des squads'});
        const actions = container.querySelector('[data-squad-actions]');
        expect(actions).toBeInTheDocument();
        expect(dock.lastElementChild).toBe(actions);
        expect(actions).toHaveClass('pb-0.5');
        expect(actions).toContainElement(screen.getByRole('button', {name: 'Créer'}));
        expect(actions).toContainElement(screen.getByRole('button', {name: 'Rejoindre'}));
        fireEvent.click(screen.getByRole('button', {name: 'Créer'}));
        fireEvent.click(screen.getByRole('button', {name: 'Rejoindre'}));
        expect(onCreate).toHaveBeenCalledOnce();
        expect(onJoin).toHaveBeenCalledOnce();
    });

    it('affiche le libellé coupé sous chaque bulle et garde le nom complet en aria-label', () => {
        mount();
        expect(screen.getByText('MONTAGNA')).toBeInTheDocument();
        expect(screen.getByText('LGB')).toBeInTheDocument();
        expect(screen.getByText('POTES')).toBeInTheDocument();
        expect(screen.getByText('SDLP')).toBeInTheDocument();
        expect(screen.getByText('BDÉ')).toBeInTheDocument();
        expect(screen.getByText('TAM')).toBeInTheDocument();
        expect(screen.getByText('MONTAGNA')).not.toHaveTextContent('…');
        expect(screen.getByRole('button', {name: 'Montagnards'})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: "Buveurs d'Élite"})).toBeInTheDocument();
    });

    it('garde les actions pendant le chargement', () => {
        render(<SquadWheel squads={[]} isLoading onSelect={vi.fn()} onCreate={vi.fn()} onJoin={vi.fn()}/>);
        expect(screen.getByRole('status')).toHaveTextContent('Chargement des squads');
        expect(screen.getByRole('button', {name: 'Créer'})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Rejoindre'})).toBeInTheDocument();
    });

    it('marque la squad active et applique la palette de nuit', () => {
        mount(six(), '4', true);
        expect(screen.getByRole('button', {name: 'Montagnards'})).toHaveAttribute('aria-current', 'page');
        const labels = document.querySelectorAll('[data-squad-label]');
        expect(labels.length).toBeGreaterThan(0);
        labels.forEach(label => {
            expect(label).toHaveClass('text-beer-light');
            expect(label).not.toHaveClass('bg-white');
        });
    });

    it('garde la barre du bas après la rangée d’actions', () => {
        const { container } = render(
            <MemoryRouter><Navbar onCreateClick={vi.fn()} onJoinClick={vi.fn()}/></MemoryRouter>,
        );
        expect(screen.getByRole('status')).toHaveTextContent('Chargement des squads');
        expect(screen.getByRole('button', {name: 'Profil'})).toBeInTheDocument();
        const dock = container.querySelector('[data-squad-dock]');
        const bar = container.querySelector('[data-bottom-nav]');
        expect(dock).toBeInTheDocument();
        expect(bar).toBeInTheDocument();
        expect(dock?.nextElementSibling).toBe(bar);
    });
});
