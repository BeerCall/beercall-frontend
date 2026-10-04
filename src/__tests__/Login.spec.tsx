import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from './utils/test-utils';
import Login from '../pages/Login';
import { useUserStore } from '../store/useUserStore';

// Mock du module firebase pour isoler
vi.mock('../lib/firebase', () => ({
  messaging: {},
  getToken: vi.fn(),
  onMessage: vi.fn(),
}));

// Mock de useNavigate
const mockedNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockedNavigate,
    };
});

describe('Page Authentification (Login)', () => {
    beforeEach(() => {
        // Reset state & mocks avant chaque test
        useUserStore.setState({ user: null, isAuthenticated: false });
        mockedNavigate.mockReset();
    });

    it('Scenario: Soumission invalide - doit empêcher la soumission avec des champs vides', () => {
        render(<Login />);
        const submitButton = screen.getByRole('button', { name: /se connecter/i });
        
        // GIVEN empty fields
        // THEN Button is disabled
        expect(submitButton).toBeDisabled();
    });

    it('Scenario: Erreur 401 - affiche un message d\'erreur approprié', async () => {
        const user = userEvent.setup();
        render(<Login />);

        const usernameInput = screen.getByPlaceholderText(/ton pseudo/i);
        const passwordInput = screen.getByPlaceholderText(/mot de passe/i);
        const submitButton = screen.getByRole('button', { name: /se connecter/i });

        // GIVEN wrong credentials
        await user.type(usernameInput, 'wrongUser');
        await user.type(passwordInput, 'wrongPass');
        
        expect(submitButton).not.toBeDisabled();

        // WHEN submitted
        await user.click(submitButton);
        
        await waitFor(() => {
            expect(screen.getByText(/Identifiants incorrects ou serveur éméché/i)).toBeInTheDocument();
        });
        expect(mockedNavigate).not.toHaveBeenCalled();
    });

    it('Scenario: Authentification réussie - stocke le token et redirige', async () => {
        const user = userEvent.setup();
        render(<Login />);

        const usernameInput = screen.getByPlaceholderText(/ton pseudo/i);
        const passwordInput = screen.getByPlaceholderText(/mot de passe/i);
        const submitButton = screen.getByRole('button', { name: /se connecter/i });

        // GIVEN valid credentials
        await user.type(usernameInput, 'validUser');
        await user.type(passwordInput, 'validPass');
        
        // WHEN submitted
        await user.click(submitButton);

        // THEN Redirects to dashboard and state is updated
        await waitFor(() => {
            expect(mockedNavigate).toHaveBeenCalledWith('/dashboard');
        });
        
        expect(localStorage.getItem('token')).toBe('fake-jwt-token');
        expect(useUserStore.getState().isAuthenticated).toBe(true);
    });
});
