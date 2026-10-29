import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { MemoryRouter } from 'react-router-dom';
import SquadWheel from '../components/UI/SquadWheel';
import { Timeline } from '../components/Dashboard/Timeline';
import Navbar from '../components/UI/Navbar';
import type { Squad } from '../types/api';
import type { SquadDetails } from '../types/dashboard';

vi.mock('framer-motion', async () => {
    const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
    return {
        ...actual,
        motion: {
            div: (props: ComponentProps<'div'> & { drag?: string }) => (
                <div
                    data-wheel-drag={props['data-wheel-drag']}
                    className={props.className}
                    style={props.style}
                    onPointerDownCapture={props.onPointerDownCapture}
                >
                    {props.children}
                </div>
            ),
        },
    };
});

vi.mock('../hooks/useSquads', () => ({
    useSquads: vi.fn().mockReturnValue({ data: [], isLoading: false }),
}));

vi.mock('../store/useUserStore', () => ({
    useUserStore: vi.fn((selector) => selector({ logout: vi.fn() })),
}));

describe('Flux commun et layout compact des overlays (UI-02 / UI-04 / T09)', () => {
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
            />
        );

        const timelineRoot = container.firstElementChild as HTMLElement;
        expect(timelineRoot).toHaveClass('relative', 'w-full', 'px-4', 'mb-1', 'pointer-events-none');
        expect(timelineRoot.className).not.toContain('bottom-');

        const scrollContainer = timelineRoot.firstElementChild as HTMLElement;
        expect(scrollContainer).toHaveClass('pb-0', 'pt-2', 'overflow-x-auto');
    });

    it('Navbar possède une position relative et conserve la barre inférieure de 80 px', () => {
        const { container } = render(
            <MemoryRouter>
                <Navbar onCreateClick={vi.fn()} onJoinClick={vi.fn()} />
            </MemoryRouter>
        );

        const navbarRoot = container.firstElementChild as HTMLElement;
        expect(navbarRoot).toHaveClass('relative', 'w-full', 'pointer-events-none');
        expect(navbarRoot.className).not.toContain('absolute');
        expect(navbarRoot.className).not.toContain('bottom-0');

        const bar = navbarRoot.querySelector('div.bg-white.border-t');
        expect(bar).toBeInTheDocument();
        expect(bar).toHaveClass('relative', 'z-50', 'pointer-events-auto');
    });

    it('SquadWheel est un <section> flex-col avec arc clippé à 118 px et disque top-28px compatible', () => {
        const { container } = render(
            <SquadWheel
                squads={[]}
                onSelect={vi.fn()}
                onCreate={vi.fn()}
                onJoin={vi.fn()}
            />
        );

        const region = screen.getByRole('region', { name: 'Navigation des squads' });
        expect(region.tagName).toBe('SECTION');
        expect(region).toHaveClass('flex', 'flex-col', 'w-full', 'select-none', 'pointer-events-none');

        // Sous-conteneur clippé à 118 px
        const clippedBand = container.querySelector('div.relative.h-\\[118px\\].w-full.overflow-hidden');
        expect(clippedBand).toBeInTheDocument();

        // Disque de drag avec data-wheel-drag, classe top-[36px] et style top: 28px
        const dragDisc = clippedBand?.querySelector('[data-wheel-drag]');
        expect(dragDisc).toBeInTheDocument();
        expect(dragDisc).toHaveClass('top-[36px]', 'w-[288px]', 'h-[288px]');
        expect(dragDisc).toHaveStyle({ top: '28px' });
    });

    it('place les libellés <=8 points de code sous les badges et les libellés >8 points de code en flux pleine largeur sans truncate', () => {
        const testSquads: Squad[] = [
            { id: 1, name: 'Courte', icon: 'beer', color: '#F59E0B', invite_code: 'C1' }, // 6 chars <= 8
            { id: 2, name: 'S'.repeat(120), icon: 'rocket', color: '#10B981', invite_code: 'L1' }, // 120 chars > 8
            { id: 3, name: 'Les Amis du Bar', icon: 'pizza', color: '#3B82F6', invite_code: 'M1' }, // LADB (4 chars) <= 8
        ];

        const { container } = render(
            <SquadWheel
                squads={testSquads}
                currentSquadId="1"
                onSelect={vi.fn()}
                onCreate={vi.fn()}
                onJoin={vi.fn()}
            />
        );

        // Libellé court <= 8 : placé sous le badge dans la bande de 118 px
        const shortLabel = screen.getByText('Courte', { selector: '[data-wheel-label]' });
        expect(shortLabel).toHaveClass('w-[48px]', 'text-xs', 'leading-[14px]', 'rounded', 'px-1');
        expect(shortLabel).not.toHaveClass('bg-white');
        expect(shortLabel).toHaveClass('text-gray-900');
        expect(shortLabel.className).not.toContain('truncate');

        const initialsLabel = screen.getByText('LADB', { selector: '[data-wheel-label]' });
        expect(initialsLabel).toHaveClass('w-[48px]', 'text-xs', 'leading-[14px]', 'rounded', 'px-1');
        expect(initialsLabel).not.toHaveClass('bg-white');

        // Libellé long > 8 (120 chars) : placé en flux sous la bande de 118 px
        const longWordText = 'S'.repeat(120);
        const longLabel = screen.getByText(longWordText);
        expect(longLabel).toBeInTheDocument();

        const longLabelContainer = container.querySelector(`span[data-squad-id="2"][data-wheel-label]`);
        expect(longLabelContainer).toBeInTheDocument();
        expect(longLabelContainer).toHaveClass('rounded', 'px-1', 'text-gray-900');
        expect(longLabelContainer).not.toHaveClass('bg-white');
        expect(longLabelContainer?.className).not.toContain('truncate');

        // La pastille de couleur est présente à côté du mot long
        const colorDot = longLabelContainer?.querySelector('span[aria-hidden="true"]');
        expect(colorDot).toBeInTheDocument();
        expect(colorDot).toHaveStyle({ backgroundColor: '#10B981' });

        // Le badge bouton de la squad 2 ne contient pas de doublon masqué
        const badgeButton = screen.getByRole('button', { name: longWordText });
        const badgeParent = badgeButton.parentElement;
        const subLabels = badgeParent?.querySelectorAll('[data-wheel-label]');
        expect(subLabels?.length ?? 0).toBe(0);
    });

    it('organise les rangées en flux avec gap-1, nom actif et contrôles sans marge après la dernière rangée', () => {
        const testSquads: Squad[] = [
            { id: 1, name: 'Supercalifragilistic', icon: 'beer', color: '#F59E0B', invite_code: 'LONG1' }, // >8
            { id: 2, name: 'Squad Deux', icon: 'pizza', color: '#3B82F6', invite_code: 'SQ2' },
            { id: 3, name: 'Squad Trois', icon: 'rocket', color: '#10B981', invite_code: 'SQ3' },
            { id: 4, name: 'Squad Quatre', icon: 'fire', color: '#EF4444', invite_code: 'SQ4' },
        ];

        const { container } = render(
            <SquadWheel
                squads={testSquads}
                currentSquadId="1"
                onSelect={vi.fn()}
                onCreate={vi.fn()}
                onJoin={vi.fn()}
            />
        );

        // Conteneur en flux
        const fluxContainer = container.querySelector('div.relative.z-20.flex.flex-col.gap-1');
        expect(fluxContainer).toBeInTheDocument();
        expect(fluxContainer).toHaveClass('items-center', 'w-full');

        // 1. Ligne longue
        const longRow = fluxContainer?.querySelector('span[data-squad-id="1"][data-wheel-label]');
        expect(longRow).toBeInTheDocument();

        // 2. Plus de doublon bas du nom actif (T25b) ; l identité vit désormais en haut.
        const activeName = fluxContainer?.querySelector('[data-wheel-active]');
        expect(activeName).toBeNull();

        // 3. Contrôles de pagination
        const controls = fluxContainer?.querySelector('[data-wheel-controls]');
        expect(controls).toBeInTheDocument();
        expect(controls).toHaveClass('h-7');
    });
});
