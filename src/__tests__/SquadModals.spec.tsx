import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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
        vi.mocked(api.post).mockRejectedValueOnce(new Error('API Error'));
        
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        render(<CreateSquadModal isOpen={true} onClose={onClose} />);
        
        await user.type(screen.getByPlaceholderText(/Nom de la Squad/i), 'MySquad');
        await user.click(screen.getByRole('button', { name: /CRÉER LA SQUAD/i }));
        
        await waitFor(() => {
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[BeerCall] Erreur création Squad:'), expect.any(Error));
        });
        expect(onClose).not.toHaveBeenCalled();
        consoleSpy.mockRestore();
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
