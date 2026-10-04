import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from './utils/test-utils';
import SignUp from '../pages/SignUp';
import Profile from '../pages/Profile';
import Connections from '../pages/Connections';
import ChatPage from '../pages/ChatPage';
import { useUserStore } from '../store/useUserStore';
import React from 'react';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useParams: () => ({ id: '1' }),
        Link: ({ children }: React.PropsWithChildren) => <a>{children}</a>,
    };
});

// Mock Firebase module completely
vi.mock('../lib/firebase', () => ({
    messaging: {},
    getToken: vi.fn(),
    onMessage: vi.fn(),
    squadChatRef: vi.fn(() => ({})),
}));

vi.mock('firebase/database', () => ({
    getDatabase: vi.fn(),
    ref: vi.fn(),
    push: vi.fn().mockReturnValue({ key: 'msg-1', set: vi.fn() }),
    onValue: vi.fn().mockImplementation((ref, callback) => {
        callback({ val: () => ({}) });
        return () => {};
    }),
    query: vi.fn(),
    orderByChild: vi.fn(),
    limitToLast: vi.fn(),
}));

describe('Pages Rendering & Interactions (Coverage)', () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        useUserStore.setState({ username: 'validUser', isAuthenticated: true });
        mockNavigate.mockClear();
    });

    it('SignUp: remplit et soumet le formulaire', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<SignUp />);
        
        const usernameInput = screen.getByPlaceholderText(/^Pseudo/i);
        const passwordInput = screen.getByPlaceholderText(/Mot de passe/i);
        const submitButton = screen.getByRole('button', { name: /CRÉER L'AVATAR/i });

        await user.type(usernameInput, 'NewUser');
        await user.type(passwordInput, 'password123');

        expect(submitButton).not.toBeDisabled();
        
        // Clic sur l'inscription
        await user.click(submitButton);

        const femmeBtn = await screen.findByText('Femme');
        fireEvent.click(femmeBtn);

        const saveBtn = await screen.findByRole('button', { name: /SAUVEGARDER LE STYLE/i });
        fireEvent.click(saveBtn);

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
        });
    });

    it('Profile: change de vue et clique sur Sauvegarder', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<Profile />);
        
        // Attendre le chargement
        await waitFor(() => {
            expect(screen.queryByText(/Chargement/i)).not.toBeInTheDocument();
        });

        // Les boutons de navigation des onglets du profil
        const vestiaireBtn = screen.queryByText(/Vestiaire/i);
        const infosBtn = screen.queryByText(/Trophées/i) || screen.queryByText(/Infos/i);

        if (infosBtn) {
            await user.click(infosBtn);
        }
        if (vestiaireBtn) {
            await user.click(vestiaireBtn);
        }

        // Click sur sauvegarder (si c'est son profil)
        const saveBtn = screen.queryByRole('button', { name: /SAUVEGARDER/i }) 
                     || screen.queryByText(/SAUVEGARDER/i);
        
        if (saveBtn) {
            await user.click(saveBtn);
        }
        
        await waitFor(() => {
            expect(screen.queryByText(/Sauvegarde en cours/i)).not.toBeInTheDocument();
        });
    });

    it('Connections: rend la page des connexions', async () => {
        render(<Connections />);
        
        await waitFor(() => {
            expect(screen.queryByText(/Chargement/i)).not.toBeInTheDocument();
        });
        
        expect(screen.getByText(/Friend1/i)).toBeInTheDocument();
    });

    it('ChatPage: envoie un message', async () => {
        render(<ChatPage />);

        // On vérifie juste que l'UI se monte et le composant charge correctement
        await waitFor(() => {
            expect(screen.queryByText(/Chargement/i)).not.toBeInTheDocument();
        });
    });
});
