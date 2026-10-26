import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from './utils/test-utils';
import userEvent from '@testing-library/user-event';
import CreateSquadModal from '../components/Modals/CreateSquadModal';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
    api: {
        post: vi.fn(),
    },
}));

function scrollRegion() {
    const panel = screen.getByRole('dialog');
    const region = panel.lastElementChild as HTMLElement;
    return { panel, region };
}

describe('CreateSquadModal viewport (T28)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('borne la hauteur du panneau et rend le formulaire défilable sans cacher le submit', () => {
        render(<CreateSquadModal isOpen onClose={vi.fn()} />);

        const { panel, region } = scrollRegion();
        expect(panel).toHaveClass('flex', 'flex-col');
        // Fallback 90vh puis 90dvh quand le navigateur le supporte.
        expect(panel).toHaveClass('max-h-[90vh]');
        expect(panel).toHaveClass('supports-[max-height:90dvh]:max-h-[90dvh]');
        expect(panel).toHaveClass('pb-[calc(1.5rem+env(safe-area-inset-bottom))]');

        const header = panel.firstElementChild as HTMLElement;
        expect(header).toHaveClass('shrink-0');

        expect(region).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto', 'overflow-x-hidden', 'overscroll-contain');

        const submit = screen.getByRole('button', { name: /CRÉER LA SQUAD/i });
        expect(region.contains(submit)).toBe(true);

        const close = screen.getByRole('button', { name: 'Fermer' });
        expect(header.contains(close)).toBe(true);
        expect(close).toHaveClass('shrink-0', 'w-11', 'h-11');
    });

    it('ferme par un clic normal sur la croix nommée Fermer', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        render(<CreateSquadModal isOpen onClose={onClose} />);

        await user.click(screen.getByRole('button', { name: 'Fermer' }));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('nomme les emblèmes et les couleurs, avec des cibles de 44 px', async () => {
        const user = userEvent.setup();
        vi.mocked(api.post).mockResolvedValueOnce({ data: { id: 'squad-1' } });
        render(<CreateSquadModal isOpen onClose={vi.fn()} />);

        const emblem = screen.getByRole('button', { name: 'Emblème ghost' });
        expect(emblem).toHaveClass('p-3');
        expect(emblem).toHaveAttribute('aria-pressed', 'false');
        await user.click(emblem);
        expect(emblem).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Emblème beer' })).toHaveAttribute('aria-pressed', 'false');

        const color = screen.getByRole('button', { name: 'Couleur #3B82F6' });
        expect(color).toHaveClass('w-11', 'h-11');
        await user.click(color);
        expect(color).toHaveAttribute('aria-pressed', 'true');

        await user.type(screen.getByPlaceholderText(/Nom de la Squad/i), 'Ma Squad');
        await user.click(screen.getByRole('button', { name: /CRÉER LA SQUAD/i }));
        expect(api.post).toHaveBeenCalledWith('/squads/', { name: 'Ma Squad', icon: 'ghost', color: '#3B82F6' });
    });

    it('garde l erreur, le nom saisi et le submit utilisable dans la zone défilable', async () => {
        const user = userEvent.setup();
        vi.mocked(api.post).mockRejectedValueOnce({ response: { data: { detail: 'Panne de création' } } });
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        render(<CreateSquadModal isOpen onClose={vi.fn()} />);

        await user.type(screen.getByPlaceholderText(/Nom de la Squad/i), 'Ma Squad');
        await user.click(screen.getByRole('button', { name: /CRÉER LA SQUAD/i }));

        const { region } = scrollRegion();
        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('Panne de création');
        expect(region.contains(alert)).toBe(true);
        expect(screen.getByPlaceholderText(/Nom de la Squad/i)).toHaveValue('Ma Squad');
        expect(screen.getByRole('button', { name: /CRÉER LA SQUAD/i })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Fermer' })).toBeEnabled();
        consoleSpy.mockRestore();
    });

    it('accepte un nom de 120 caractères sans sortir du panneau', async () => {
        const user = userEvent.setup();
        render(<CreateSquadModal isOpen onClose={vi.fn()} />);

        const longName = 'S'.repeat(120);
        const input = screen.getByPlaceholderText(/Nom de la Squad/i);
        await user.type(input, longName);

        const { panel } = scrollRegion();
        expect(input).toHaveValue(longName);
        expect(input).toHaveClass('w-full');
        expect(panel.contains(input)).toBe(true);
        expect(screen.getByRole('button', { name: /CRÉER LA SQUAD/i })).toBeEnabled();
    });

    it('ne rend rien quand la modale est fermée', () => {
        render(<CreateSquadModal isOpen={false} onClose={vi.fn()} />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(within(document.body).queryByRole('button', { name: 'Fermer' })).not.toBeInTheDocument();
    });
});
