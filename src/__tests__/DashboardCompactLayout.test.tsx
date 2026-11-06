import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SquadWheel from '../components/UI/SquadWheel';
import { Timeline } from '../components/Dashboard/Timeline';
import Navbar from '../components/UI/Navbar';
import type { Squad } from '../types/api';
import type { SquadDetails } from '../types/dashboard';

vi.mock('../hooks/useSquads', () => ({
    useSquads: vi.fn().mockReturnValue({ data: [], isLoading: false }),
}));

const six: Squad[] = [
    { id: 4, name: 'Montagnards', icon: 'ghost', color: '#3B82F6', invite_code: 'M1' },
    { id: 5, name: 'Les Gros Buveurs', icon: 'rocket', color: '#10B981', invite_code: 'M2' },
    { id: 6, name: 'Potes', icon: 'ghost', color: '#F59E0B', invite_code: 'M3' },
    { id: 7, name: 'Squad de la Plage', icon: 'rocket', color: '#EF4444', invite_code: 'M4' },
    { id: 8, name: "Buveurs d'Élite", icon: 'ghost', color: '#8B5CF6', invite_code: 'M5' },
    { id: 9, name: 'Team Après-Midi', icon: 'rocket', color: '#14B8A6', invite_code: 'M6' },
];

describe('Layout compact du dock des squads (8b)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('Timeline possède une position relative, mb-1 (4 px) et pb-0 dans le scroll', () => {
        const dummySquadDetails: SquadDetails = {
            id: 1,
            name: 'Squad Test',
            icon: 'beer',
            color: '#F59E0B',
            invite_code: 'TEST',
            members: [],
            active_beer_call: [],
            past_beer_calls: [],
            scheduled_beer_calls: [],
        };

        const { container } = render(
            <Timeline
                squadDetails={dummySquadDetails}
                squadId="1"
                navigate={vi.fn()}
                focusOnLocation={vi.fn()}
                openCamera={vi.fn()}
                setSelectedBeerCall={vi.fn()}
                setIsWorldsModalOpen={vi.fn()}
            />,
        );

        const timelineRoot = container.firstElementChild as HTMLElement;
        expect(timelineRoot).toHaveClass('relative', 'w-full', 'px-4', 'mb-1', 'pointer-events-none');
        expect(timelineRoot.className).not.toContain('bottom-');

        const scrollContainer = timelineRoot.firstElementChild as HTMLElement;
        expect(scrollContainer).toHaveClass('pb-0', 'pt-2', 'overflow-x-auto');
    });

    it('Navbar garde une position relative et la barre inférieure', () => {
        const { container } = render(
            <MemoryRouter>
                <Navbar onCreateClick={vi.fn()} onJoinClick={vi.fn()}/>
            </MemoryRouter>,
        );

        const navbarRoot = container.firstElementChild as HTMLElement;
        expect(navbarRoot).toHaveClass('relative', 'w-full', 'pointer-events-none');
        expect(navbarRoot.className).not.toContain('absolute');
        expect(navbarRoot.className).not.toContain('bottom-0');

        const bar = navbarRoot.querySelector('div.bg-white.border-t');
        expect(bar).toBeInTheDocument();
        expect(bar).toHaveClass('relative', 'z-50', 'pointer-events-auto');
    });

    it('affiche les 6 squads + les actions sans pagination, sur un seul écran', () => {
        const { container } = render(
            <SquadWheel squads={six} currentSquadId="4" onSelect={vi.fn()} onCreate={vi.fn()} onJoin={vi.fn()}/>,
        );

        const region = screen.getByRole('region', { name: 'Barre des squads' });
        expect(region.tagName).toBe('SECTION');
        expect(region).toHaveClass('flex', 'flex-col', 'w-full', 'select-none', 'pointer-events-none');

        const row = container.querySelector('[data-squad-row]');
        expect(row).toHaveClass('flex', 'flex-wrap', 'justify-center', 'gap-x-1', 'gap-y-1', 'px-3');
        for (const item of six) {
            expect(screen.getByRole('button', { name: item.name })).toBeInTheDocument();
        }
        expect(container.querySelectorAll('[data-squad-row] > div')).toHaveLength(6);
        expect(container.querySelector('[data-squad-actions]')).toBeInTheDocument();
        expect(container.querySelector('[data-wheel-controls]')).toBeNull();
        expect(screen.queryByText(/Page \d/)).not.toBeInTheDocument();
    });

    it('coupe les libellés à 8 caractères sans points de suspension', () => {
        render(<SquadWheel squads={six} onSelect={vi.fn()} onCreate={vi.fn()} onJoin={vi.fn()}/>);

        expect(screen.getByText('MONTAGNA')).toBeInTheDocument();
        expect(screen.getByText('MONTAGNA')).not.toHaveTextContent('…');
        expect(screen.getByText('LGB')).toBeInTheDocument();
        expect(screen.getByText('POTES')).toBeInTheDocument();
        expect(screen.getByText('SDLP')).toBeInTheDocument();
        expect(screen.getByText('BDÉ')).toBeInTheDocument();
        expect(screen.getByText('TAM')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Montagnards' })).toBeInTheDocument();
    });

    it('place Créer/Rejoindre en dernière rangée, juste avant la barre du bas', () => {
        const { container } = render(
            <SquadWheel squads={six} onSelect={vi.fn()} onCreate={vi.fn()} onJoin={vi.fn()}/>,
        );
        const dock = container.querySelector('[data-squad-dock]');
        const actions = container.querySelector('[data-squad-actions]');
        expect(dock?.lastElementChild).toBe(actions);
        expect(actions).toHaveClass('pb-0.5');
        expect(actions?.querySelectorAll('button')).toHaveLength(2);
    });
});
