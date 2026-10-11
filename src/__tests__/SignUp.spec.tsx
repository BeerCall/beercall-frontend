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

        const submitButton = await screen.findByRole('button', { name: /Créer mon compte/i });
        await user.click(submitButton);

        await waitFor(() => {
            expect(mockedNavigate).toHaveBeenCalledWith('/dashboard');
        });
        
        const token = localStorage.getItem('token');
        expect(token).toBe('fake-token');
    });

    async function enterAvatar() {
        const user = userEvent.setup();
        await user.type(screen.getByPlaceholderText(/^Pseudo/i), 'NewUser');
        await user.type(screen.getByPlaceholderText(/Mot de passe/i), 'password123');
        await user.click(screen.getByRole('button', { name: /CRÉER L'AVATAR/i }));
        return user;
    }

    it('crée avec la tenue par défaut et un catalogue prêt avant l’étape 2', async () => {
        let profileLoaded = false;
        let payload: unknown;
        server.use(
            http.get('*/auth/profile/', () => { profileLoaded = true; return HttpResponse.json({ shop_items: [] }); }),
            http.post('*/auth/signup/', async ({ request }) => {
                payload = await request.json();
                return HttpResponse.json({ access_token: 'default-token', username: 'NewUser' });
            }),
        );
        render(<SignUp />);
        await waitFor(() => expect(profileLoaded).toBe(true));
        const user = await enterAvatar();
        const button = await screen.findByRole('button', { name: 'Créer mon compte' });
        await waitFor(() => expect(button).toBeEnabled());
        await user.click(button);
        await waitFor(() => expect(mockedNavigate).toHaveBeenCalledWith('/dashboard'));
        expect(payload).toEqual({ username: 'NewUser', password: 'password123', avatar: {
            head: 'none', body: 'none', legs: 'none', feet: 'none', accessory: 'none', animation: 'Idle', gender: 'Men',
        } });
        expect(localStorage.getItem('token')).toBe('default-token');
    });

    it('garde le bouton présent mais désactivé tant que le catalogue est retardé', async () => {
        let release: () => void = () => {};
        const pending = new Promise<void>(resolve => { release = resolve; });
        server.use(http.get('*/auth/profile/', async () => {
            await pending;
            return HttpResponse.json({ shop_items: [] });
        }));
        render(<SignUp />);
        await enterAvatar();
        const button = screen.getByRole('button', { name: 'Créer mon compte' });
        expect(button).toBeDisabled();
        expect(screen.getByRole('status')).toHaveTextContent('Chargement du catalogue');
        release();
        await waitFor(() => expect(button).toBeEnabled());
    });

    it('conserve identifiants, genre et tenue entre un POST 500 et la reprise', async () => {
        const payloads: unknown[] = [];
        let purchases = 0;
        server.use(
            http.get('*/auth/profile/', () => HttpResponse.json({ shop_items: [] })),
            http.post('*/auth/buy/', () => { purchases++; return HttpResponse.json({}); }),
            http.post('*/auth/signup/', async ({ request }) => {
                payloads.push(await request.json());
                return payloads.length === 1
                    ? HttpResponse.json({ detail: 'Panne test' }, { status: 500 })
                    : HttpResponse.json({ access_token: 'retry-token', username: 'NewUser' });
            }),
        );
        render(<SignUp />);
        const user = await enterAvatar();
        await user.click(screen.getByRole('button', { name: 'Femme' }));
        const button = screen.getByRole('button', { name: 'Créer mon compte' });
        await waitFor(() => expect(button).toBeEnabled());
        await user.click(button);
        await screen.findByRole('alert');
        expect(mockedNavigate).not.toHaveBeenCalled();
        expect(button).toBeEnabled();
        await user.click(button);
        await waitFor(() => expect(mockedNavigate).toHaveBeenCalledWith('/dashboard'));
        expect(payloads).toHaveLength(2);
        expect(payloads[1]).toEqual(payloads[0]);
        expect(payloads[0]).toMatchObject({ username: 'NewUser', password: 'password123', avatar: { gender: 'Women', head: 'none' } });
        expect(localStorage.getItem('token')).toBe('retry-token');
        expect(purchases).toBe(0);
    });

    it('ne confirme pas une réponse sans token et permet de réessayer', async () => {
        localStorage.removeItem('token');
        server.use(
            http.get('*/auth/profile/', () => HttpResponse.json({ shop_items: [] })),
            http.post('*/auth/signup/', () => HttpResponse.json({ username: 'NewUser' })),
        );
        render(<SignUp />);
        const user = await enterAvatar();
        const button = screen.getByRole('button', { name: 'Créer mon compte' });
        await waitFor(() => expect(button).toBeEnabled());
        await user.click(button);
        expect(await screen.findByRole('alert')).toHaveTextContent('Création non confirmée');
        expect(mockedNavigate).not.toHaveBeenCalled();
        expect(localStorage.getItem('token')).toBeNull();
        expect(button).toBeEnabled();
    });
});
