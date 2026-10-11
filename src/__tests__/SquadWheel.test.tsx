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

describe('Roue paginée et confirmation de squad', () => {
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

    it('présente le nom intégral au tap et ne navigue qu’après confirmation', async () => {
        const { user, onSelect } = mountWheel();
        const trigger = screen.getByRole('button', { name: squads(1)[0].name });
        expect(trigger).toHaveAttribute('aria-current', 'page');
        await user.click(trigger);
        expect(onSelect).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog', { name: 'Ouvrir cette squad ?' })).toHaveTextContent(squads(1)[0].name);
        expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus();
        await user.click(screen.getByRole('button', { name: 'Ouvrir la squad' }));
        expect(onSelect).toHaveBeenCalledExactlyOnceWith(1);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('annule via bouton, Escape et backdrop puis restitue le focus', async () => {
        const { user, onSelect } = mountWheel();
        const trigger = screen.getByRole('button', { name: squads(1)[0].name });
        await user.click(trigger);
        await user.click(screen.getByRole('button', { name: 'Annuler' }));
        expect(trigger).toHaveFocus();
        await user.click(trigger);
        await user.keyboard('{Escape}');
        expect(trigger).toHaveFocus();
        await user.click(trigger);
        fireEvent.click(screen.getByRole('dialog').previousElementSibling!);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('confine la tabulation entre Annuler et Ouvrir', async () => {
        const { user } = mountWheel();
        await user.click(screen.getByRole('button', { name: squads(1)[0].name }));
        await user.tab({ shift: true });
        expect(screen.getByRole('button', { name: 'Ouvrir la squad' })).toHaveFocus();
        await user.tab();
        expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus();
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

    it('recale la page et ferme une confirmation lors de la réduction de liste', async () => {
        const { user, rerender, props, onSelect } = mountWheel(squads(12), '12');
        await user.click(screen.getByRole('button', { name: squads(12)[11].name }));
        rerender(<SquadWheel {...props} squads={squads(4)} />);
        expect(screen.getByText('Page 2/2')).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(onSelect).not.toHaveBeenCalled();
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

    it('offre les flèches clavier et ferme le dialogue au changement de page', async () => {
        const { user } = mountWheel();
        fireEvent.keyDown(screen.getByRole('region'), { key: 'ArrowRight' });
        expect(screen.getByText('Page 2/4')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: squads(6)[3].name }));
        fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('garde le chargement Navbar et nomme le bouton Profil', () => {
        render(<MemoryRouter><Navbar onCreateClick={vi.fn()} onJoinClick={vi.fn()} /></MemoryRouter>);
        expect(screen.getByRole('status')).toHaveTextContent('Chargement des squads');
        expect(screen.getByRole('button', { name: 'Profil' })).toBeInTheDocument();
    });
});
