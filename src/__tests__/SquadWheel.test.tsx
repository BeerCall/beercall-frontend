import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ComponentProps } from 'react';
import SquadWheel from '../components/UI/SquadWheel';
import Navbar from '../components/UI/Navbar';
import type { Squad } from '../types/api';

const motionState = vi.hoisted(() => ({ onDragEnd: undefined as undefined | ((event: unknown, info: { offset: { x: number } }) => void) }));
vi.mock('framer-motion', async () => {
    const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
    return { ...actual, motion: { div: (props: ComponentProps<'div'> & { drag?: string; onDragEnd?: (event: unknown, info: { offset: { x: number } }) => void }) => {
        if (props.drag) motionState.onDragEnd = props.onDragEnd;
        return <div className={props.className} onPointerDownCapture={props.onPointerDownCapture}>{props.children}</div>;
    } } };
});
vi.mock('../hooks/useSquads', () => ({ useSquads: () => ({ data: undefined, isLoading: true }) }));
const squads = (count: number): Squad[] => Array.from({ length: count }, (_, i) => ({
    id: i + 1, name: `Les amis du quartier — équipe ${i + 1}`, icon: 'beer', color: '#F59E0B', invite_code: 'TEST',
}));

function mountWheel(list = squads(12), currentSquadId = '1') {
    const onSelect = vi.fn(), onCreate = vi.fn(), onJoin = vi.fn();
    const props = { squads: list, currentSquadId, onSelect, onCreate, onJoin };
    const view = render(<SquadWheel {...props} />);
    return { ...view, props, onSelect, onCreate, onJoin, user: userEvent.setup() };
}

describe('Roue paginée sans popup de confirmation', () => {
    it('garde Créer/Rejoindre directs et accessibles sur chaque page', async () => {
        const { user, onCreate, onJoin } = mountWheel();
        for (let i = 0; i < 4; i++) {
            await user.click(screen.getByRole('button', { name: 'Créer', exact: true }));
            await user.click(screen.getByRole('button', { name: 'Rejoindre', exact: true }));
            if (i < 3) await user.click(screen.getByRole('button', { name: 'Page suivante' }));
        }
        expect(onCreate).toHaveBeenCalledTimes(4);
        expect(onJoin).toHaveBeenCalledTimes(4);
        expect(screen.getByRole('button', { name: 'Page suivante' })).toBeDisabled();
    });

    it('présente le libellé accessible au tap et navigue directement sans dialogue', async () => {
        const { user, onSelect } = mountWheel();
        const trigger = screen.getByRole('button', { name: squads(1)[0].name });
        expect(trigger).toHaveAttribute('aria-current', 'page');
        await user.click(trigger);
        expect(onSelect).toHaveBeenCalledExactlyOnceWith(1);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('déclenche la navigation directe au clavier via Entrée et Espace sans dialogue', () => {
        const { onSelect } = mountWheel();
        const trigger = screen.getByRole('button', { name: squads(1)[0].name });
        fireEvent.keyDown(trigger, { key: 'Enter', code: 'Enter' });
        fireEvent.click(trigger, { detail: 0 }); // Keyboard activation
        expect(onSelect).toHaveBeenCalledWith(1);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        onSelect.mockClear();
        fireEvent.keyDown(trigger, { key: ' ', code: 'Space' });
        fireEvent.click(trigger, { detail: 0 });
        expect(onSelect).toHaveBeenCalledWith(1);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('ouvre la page 4 pour l’ID actif et préserve une page lors d’un refetch identique', async () => {
        const { user, rerender, props } = mountWheel(squads(12), '12');
        expect(screen.getByText('Page 4/4')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: squads(12)[11].name })).toHaveAttribute('aria-current', 'page');
        await user.click(screen.getByRole('button', { name: 'Page précédente' }));
        rerender(<SquadWheel {...props} squads={[...props.squads]} />);
        expect(screen.getByText('Page 3/4')).toBeInTheDocument();
        rerender(<SquadWheel {...props} currentSquadId="2" />);
        expect(screen.getByText('Page 1/4')).toBeInTheDocument();
    });

    it('recale la page lors de la réduction de liste et n’affiche aucun dialogue', () => {
        const { rerender, props } = mountWheel(squads(12), '12');
        rerender(<SquadWheel {...props} squads={squads(4)} />);
        expect(screen.getByText('Page 2/2')).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('neutralise le click suivant un drag et pagine dans les deux sens', () => {
        const { onSelect } = mountWheel();
        act(() => motionState.onDragEnd?.({}, { offset: { x: -80 } }));
        expect(screen.getByText('Page 2/4')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: squads(6)[3].name }), { detail: 1 });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(onSelect).not.toHaveBeenCalled();
        act(() => motionState.onDragEnd?.({}, { offset: { x: 80 } }));
        expect(screen.getByText('Page 1/4')).toBeInTheDocument();
        act(() => motionState.onDragEnd?.({}, { offset: { x: -30 } }));
        expect(screen.getByText('Page 1/4')).toBeInTheDocument();
    });

    it('offre les flèches clavier pour paginer sans dialogue', () => {
        mountWheel();
        fireEvent.keyDown(screen.getByRole('region'), { key: 'ArrowRight' });
        expect(screen.getByText('Page 2/4')).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('garde le chargement Navbar et nomme le bouton Profil', () => {
        render(<MemoryRouter><Navbar onCreateClick={vi.fn()} onJoinClick={vi.fn()} /></MemoryRouter>);
        expect(screen.getByRole('status')).toHaveTextContent('Chargement des squads');
        expect(screen.getByRole('button', { name: 'Profil' })).toBeInTheDocument();
    });

    it('applique squadLabel sous les badges tout en préservant le aria-label complet et le nom actif complet', () => {
        const testSquads: Squad[] = [
            { id: 1, name: 'Les Amis du Bar', icon: 'beer', color: '#F59E0B', invite_code: 'BAR' },
            { id: 2, name: 'BeerCall', icon: 'rocket', color: '#10B981', invite_code: 'BEER' },
            { id: 3, name: 'Équipe du jeudi', icon: 'fire', color: '#EF4444', invite_code: 'JEU' },
        ];
        render(<SquadWheel squads={testSquads} currentSquadId="1" onSelect={vi.fn()} onCreate={vi.fn()} onJoin={vi.fn()} />);

        // Les labels sous les badges utilisent squadLabel
        expect(screen.getByText('LADB')).toBeInTheDocument();
        expect(screen.getByText('BeerCall')).toBeInTheDocument();
        expect(screen.getByText('ÉDJ')).toBeInTheDocument();

        // Les aria-label sur les boutons restent complets
        expect(screen.getByRole('button', { name: 'Les Amis du Bar' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'BeerCall' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Équipe du jeudi' })).toBeInTheDocument();

        // Le nom actif reste complet
        const activeLabel = screen.getByText('Les Amis du Bar', { selector: '[data-wheel-active]' });
        expect(activeLabel).toBeInTheDocument();
        expect(activeLabel).toHaveClass('bg-white', 'rounded', 'px-1', 'text-gray-900');
    });

    it('applique le fond blanc opaque, arrondi et px-1 sur tous les textes de la roue pour le contraste', () => {
        const testSquads: Squad[] = [
            { id: 1, name: 'Squad Un', icon: 'beer', color: '#F59E0B', invite_code: 'SQ1' },
            { id: 2, name: 'Squad Deux', icon: 'pizza', color: '#3B82F6', invite_code: 'SQ2' },
        ];
        const { rerender } = render(<SquadWheel squads={testSquads} currentSquadId="1" onSelect={vi.fn()} onCreate={vi.fn()} onJoin={vi.fn()} />);

        const labels = document.querySelectorAll('[data-wheel-label]');
        expect(labels.length).toBeGreaterThan(0);
        labels.forEach(label => {
            expect(label).toHaveClass('bg-white', 'rounded', 'px-1', 'text-gray-900');
        });

        // Cas de chargement
        rerender(<SquadWheel squads={[]} isLoading onSelect={vi.fn()} onCreate={vi.fn()} onJoin={vi.fn()} />);
        const loadingText = screen.getByRole('status');
        expect(loadingText).toHaveClass('bg-white', 'rounded', 'px-1', 'text-gray-900');
    });
});
