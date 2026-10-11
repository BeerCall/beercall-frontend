import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from './utils/test-utils';
import CreateSquadModal from '../components/Modals/CreateSquadModal';
import JoinSquadModal from '../components/Modals/JoinSquadModal';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
    api: {
        post: vi.fn(),
    }
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

describe('Squad Modals', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    it('CreateSquadModal: success', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const onClose = vi.fn();
        vi.mocked(api.post).mockResolvedValueOnce({ data: { id: 'squad-1' } });
        
        render(<CreateSquadModal isOpen={true} onClose={onClose} />);
        
        const nameInput = screen.getByPlaceholderText(/Nom de la Squad/i);
        const submitBtn = screen.getByRole('button', { name: /CRÉER LA SQUAD/i });
        
        expect(submitBtn).toBeDisabled();
        
        await user.type(nameInput, 'MySquad');
        expect(submitBtn).not.toBeDisabled();
        
        await user.click(submitBtn);
        
        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/squads/', expect.objectContaining({ name: 'MySquad' }));
        });
        expect(onClose).toHaveBeenCalled();
    });

    it('CreateSquadModal: error', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const onClose = vi.fn();
        vi.mocked(api.post).mockRejectedValueOnce(Object.assign(new Error('API Error'), { response: { status: 500, data: { detail: 'Panne de création' } } }))
            .mockResolvedValueOnce({ data: { id: 'squad-1' } });
        
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        render(<CreateSquadModal isOpen={true} onClose={onClose} />);
        
        await user.type(screen.getByPlaceholderText(/Nom de la Squad/i), 'MySquad');
        const choices = screen.getAllByRole('button', { name: '' });
        await user.click(choices[4]);
        await user.click(choices[9]);
        await user.click(screen.getByRole('button', { name: /CRÉER LA SQUAD/i }));
        
        await waitFor(() => {
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Erreur création Squad:'), expect.any(Error));
        });
        expect(onClose).not.toHaveBeenCalled();
        expect(await screen.findByRole('alert')).toHaveTextContent('Panne de création');
        expect(screen.getByPlaceholderText(/Nom de la Squad/i)).toHaveValue('MySquad');
        expect(screen.getByRole('button', { name: /CRÉER LA SQUAD/i })).toBeEnabled();
        expect(api.post).toHaveBeenLastCalledWith('/squads/', { name: 'MySquad', icon: 'rocket', color: '#10B981' });
        await user.click(screen.getByRole('button', { name: /CRÉER LA SQUAD/i }));
        await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
        expect(api.post).toHaveBeenCalledTimes(2);
        expect(api.post).toHaveBeenLastCalledWith('/squads/', { name: 'MySquad', icon: 'rocket', color: '#10B981' });
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        consoleSpy.mockRestore();
    });

    it('CreateSquadModal: remplace un detail non textuel par le message sûr', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        vi.mocked(api.post).mockRejectedValueOnce({ response: { data: { detail: { invalid: true } } } });
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        render(<CreateSquadModal isOpen onClose={vi.fn()} />);
        await user.type(screen.getByPlaceholderText(/Nom de la Squad/i), 'MySquad');
        await user.click(screen.getByRole('button', { name: /CRÉER LA SQUAD/i }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Création impossible, réessaie dans un instant');
        consoleSpy.mockRestore();
    });

    it('CreateSquadModal: ne soumet qu’une fois pendant le POST', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        let finish: (response: { data: { id: string } }) => void = () => {};
        const pending = new Promise<{ data: { id: string } }>(resolve => { finish = resolve; });
        vi.mocked(api.post).mockReturnValueOnce(pending);
        const onClose = vi.fn();
        render(<CreateSquadModal isOpen onClose={onClose} />);
        await user.type(screen.getByPlaceholderText(/Nom de la Squad/i), 'MySquad');
        await user.dblClick(screen.getByRole('button', { name: /CRÉER LA SQUAD/i }));
        expect(api.post).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: /CRÉATION/i })).toBeDisabled();
        await act(async () => { finish({ data: { id: 'squad-1' } }); await pending; });
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('JoinSquadModal: success', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const onClose = vi.fn();
        vi.mocked(api.post).mockResolvedValueOnce({ data: { id: 'squad-1' } });
        
        render(<JoinSquadModal isOpen={true} onClose={onClose} />);
        
        const codeInput = screen.getByPlaceholderText(/CODE\.\.\./i);
        const submitBtn = screen.getByRole('button', { name: /VALIDER LE CODE/i });
        
        expect(submitBtn).toBeDisabled();
        
        await user.type(codeInput, 'ABCDEF');
        expect(submitBtn).not.toBeDisabled();
        
        await user.click(submitBtn);
        
        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/squads/join', { invite_code: 'ABCDEF' });
        });
        expect(onClose).toHaveBeenCalled();
        expect(mockNavigate).toHaveBeenCalledWith('/squad/squad-1');
    });

    it('JoinSquadModal: error', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const onClose = vi.fn();
        vi.mocked(api.post).mockRejectedValueOnce({ response: { data: { detail: 'Code invalide' } } });
        
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        render(<JoinSquadModal isOpen={true} onClose={onClose} />);
        
        await user.type(screen.getByPlaceholderText(/CODE\.\.\./i), 'WRONG');
        await user.click(screen.getByRole('button', { name: /VALIDER LE CODE/i }));
        
        expect(await screen.findByText(/Code invalide/i)).toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
        expect(mockNavigate).not.toHaveBeenCalled();
        consoleSpy.mockRestore();
    });
});
