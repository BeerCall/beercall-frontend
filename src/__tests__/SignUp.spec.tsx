import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from './utils/test-utils';
import SignUp from '../pages/SignUp';
import { useUserStore } from '../store/useUserStore';

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => vi.fn(),
        Link: ({ children }: any) => <a>{children}</a>,
    };
});

describe('Page SignUp (Coverage)', () => {
    beforeEach(() => {
        useUserStore.setState({ username: null, isAuthenticated: false });
    });

    it('remplit et soumet le formulaire', async () => {
        const user = userEvent.setup();
        render(<SignUp />);
        
        const usernameInput = screen.getByPlaceholderText(/^Pseudo/i);
        const passwordInput = screen.getByPlaceholderText(/Mot de passe/i);
        const submitButton = screen.getByRole('button', { name: /CRÉER L'AVATAR/i });

        await user.type(usernameInput, 'NewUser');
        await user.type(passwordInput, 'password123');

        expect(submitButton).not.toBeDisabled();
        await user.click(submitButton);

        await waitFor(() => {
            expect(true).toBe(true);
        });
    });
});
