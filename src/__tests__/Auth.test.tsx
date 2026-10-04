import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from './utils/test-utils';
import Login from '../pages/Login';
import React from 'react';

const mockNavigate = vi.fn();
const mockLoginAction = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        Link: ({ children }: React.PropsWithChildren) => <a>{children}</a>,
    };
});

vi.mock('../store/useUserStore', () => ({
    useUserStore: (selector: (state: unknown) => unknown) => selector({
        login: mockLoginAction,
        isAuthenticated: false,
    })
}));

describe('US-1.1 : Inscription et Connexion', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should show error on invalid credentials', async () => {
        const user = userEvent.setup();
        render(<Login />);
        
        await user.type(screen.getByPlaceholderText(/Ton Pseudo/i), 'wrongUser');
        await user.type(screen.getByPlaceholderText(/Mot de passe/i), 'wrongPass');
        await user.click(screen.getByRole('button', { name: /SE CONNECTER/i }));
        
        expect(await screen.findByText(/Identifiants incorrects ou serveur éméché 🥴/i)).toBeInTheDocument();
        expect(mockNavigate).not.toHaveBeenCalled();
        expect(mockLoginAction).not.toHaveBeenCalled();
    });

    it('should authenticate user and redirect on valid credentials', async () => {
        const user = userEvent.setup();
        render(<Login />);
        
        await user.type(screen.getByPlaceholderText(/Ton Pseudo/i), 'validUser');
        await user.type(screen.getByPlaceholderText(/Mot de passe/i), 'validPass');
        await user.click(screen.getByRole('button', { name: /SE CONNECTER/i }));
        
        await waitFor(() => {
            expect(mockLoginAction).toHaveBeenCalledWith('validUser');
        });
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
});
