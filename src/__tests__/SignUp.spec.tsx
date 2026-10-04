import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { render } from './utils/test-utils';
import SignUp from '../pages/SignUp';
import { useUserStore } from '../store/useUserStore';
import { server } from './mocks/server';
import { http, HttpResponse } from 'msw';

const mockedNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockedNavigate,
        Link: ({ children }: React.PropsWithChildren<unknown>) => <a>{children}</a>,
    };
});

describe('Page SignUp (Coverage)', () => {
    beforeEach(() => {
        useUserStore.setState({ username: null, isAuthenticated: false });
        vi.clearAllMocks();
    });

    it('remplit et soumet le formulaire, obtient un token et navigue', async () => {
        server.use(
            http.get('*/auth/profile/', () => {
                return HttpResponse.json({
                    shop_items: [
                        { id: 'cap', category: 'head', gender: 'Men', name: 'Cap', price: 0, is_owned: true },
                        { id: 'cap2', category: 'head', gender: 'Men', name: 'Cool Cap', price: 0, is_owned: true }
                    ]
                });
            }),
            http.post('*/auth/signup/', () => {
                return HttpResponse.json({
                    access_token: 'fake-token',
                    token_type: 'bearer',
                    username: 'NewUser',
                    user: { id: '123', username: 'NewUser' }
                });
            })
        );

        const user = userEvent.setup();
        render(<SignUp />);
        
        const usernameInput = screen.getByPlaceholderText(/^Pseudo/i);
        const passwordInput = screen.getByPlaceholderText(/Mot de passe/i);
        const nextButton = screen.getByRole('button', { name: /CRÉER L'AVATAR/i });

        await user.type(usernameInput, 'NewUser');
        await user.type(passwordInput, 'password123');

        expect(nextButton).not.toBeDisabled();
        await user.click(nextButton);

        // Click the second item which is not equipped by default
        const itemBtn = await screen.findByText('Cool Cap');
        await user.click(itemBtn);

        const submitButton = await screen.findByRole('button', { name: /SAUVEGARDER LE STYLE/i });
        await user.click(submitButton);

        await waitFor(() => {
            expect(mockedNavigate).toHaveBeenCalledWith('/dashboard');
        });
        
        const token = localStorage.getItem('token');
        expect(token).toBe('fake-token');
    });
});