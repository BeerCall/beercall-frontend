import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SelectWorldModal from '../components/Modals/SelectWorldModal';
import { useGameUIStore } from '../store/useGameUIStore';
import { server } from './mocks/server';

const barWorldCaptor = vi.fn();

vi.mock('@react-three/fiber', () => ({
    Canvas: ({ children }: React.PropsWithChildren<unknown>) => <div data-testid="world-canvas">{children}</div>,
    useFrame: vi.fn(),
}));

vi.mock('../components/3D/BarWorld', () => ({
    default: (props: unknown) => {
        barWorldCaptor(props);
        return <div data-testid="bar-world-mock" />;
    },
}));
vi.mock('../components/3D/PiscineWorld', () => ({ default: () => null }));
vi.mock('../components/3D/FloatyIslandWorld', () => ({ default: () => null }));

describe('SelectWorldModal avec contrôle accessible masqué et délégation au Bar (T06)', () => {
    beforeEach(() => {
        barWorldCaptor.mockClear();
    });

    afterEach(() => {
        useGameUIStore.getState().closeGameScreen();
    });

    it('supprime le bouton HTML et transmet participantsReliable=true à BarWorld', async () => {
        server.use(
            http.get('*/squads/1/beer-calls/bc_1/worlds', () =>
                HttpResponse.json({
                    worlds: {
                        bar: {
                            participants: [{ user_id: 'u_1' }, { user_id: 'u_2' }],
                        },
                    },
                })
            )
        );

        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const onClose = vi.fn();

        render(
            <QueryClientProvider client={queryClient}>
                <SelectWorldModal isOpen onClose={onClose} squadId="1" beerCallId="bc_1" isActiveApero />
            </QueryClientProvider>
        );

        // Absence systématique du bouton HTML visible
        expect(screen.queryByRole('button', { name: /Lancer le jeu/i })).not.toBeInTheDocument();
        // Contrôle accessible masqué pour les lecteurs d'écran et les tests E2E
        expect(screen.getByRole('button', { name: 'Démarrer la partie' })).toBeInTheDocument();

        // Les données arrivent, BarWorld est monté avec les props requises
        await waitFor(() => expect(screen.getByTestId('bar-world-mock')).toBeInTheDocument());
        expect(screen.queryByRole('button', { name: /Lancer le jeu/i })).not.toBeInTheDocument();

        expect(barWorldCaptor).toHaveBeenLastCalledWith(
            expect.objectContaining({
                isActiveApero: true,
                aperoId: 'bc_1',
                squadId: '1',
                participantsReliable: true,
                participants: [{ user_id: 'u_1' }, { user_id: 'u_2' }],
            })
        );
    });

    it('désactive le lancement sans bouton HTML ni avertissement textuel avec moins de 2 participants', async () => {
        server.use(
            http.get('*/squads/1/beer-calls/bc_1/worlds', () =>
                HttpResponse.json({
                    worlds: {
                        bar: {
                            participants: [{ user_id: 'u_1' }],
                        },
                    },
                })
            )
        );

        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

        render(
            <QueryClientProvider client={queryClient}>
                <SelectWorldModal isOpen onClose={vi.fn()} squadId="1" beerCallId="bc_1" isActiveApero />
            </QueryClientProvider>
        );

        await screen.findByText('1 Soldat(s)');
        expect(screen.queryByText(/Au moins 2 participants/i)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Démarrer la partie' })).toBeDisabled();
        expect(screen.queryByRole('button', { name: /Lancer le jeu/i })).not.toBeInTheDocument();

        expect(barWorldCaptor).toHaveBeenLastCalledWith(
            expect.objectContaining({
                participantsReliable: true,
                participants: [{ user_id: 'u_1' }],
            })
        );
    });

    it('active le bouton masqué "Démarrer la partie" et permet le lancement quand les conditions sont réunies (T19)', async () => {
        server.use(
            http.get('*/squads/1/beer-calls/bc_1/worlds', () =>
                HttpResponse.json({
                    worlds: {
                        bar: {
                            participants: [{ user_id: 'u_1' }, { user_id: 'u_2' }],
                        },
                    },
                })
            ),
            http.post('*/aperos/:id/game/start', () =>
                HttpResponse.json({ success: true, game_state: { status: 'in_progress' } })
            ),
            http.get('*/aperos/:id/game/state', () =>
                HttpResponse.json({ status: 'in_progress' })
            )
        );

        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const onClose = vi.fn();

        render(
            <QueryClientProvider client={queryClient}>
                <SelectWorldModal isOpen onClose={onClose} squadId="1" beerCallId="bc_1" isActiveApero />
            </QueryClientProvider>
        );

        // Attente du chargement du module et des participants
        await waitFor(() => expect(screen.getByTestId('bar-world-mock')).toBeInTheDocument());

        const startButton = screen.getByRole('button', { name: 'Démarrer la partie' });
        expect(startButton).toBeEnabled();

        // Le lancement déclenche l'ouverture de l'écran de jeu et la fermeture de la modale
        startButton.click();
        await waitFor(() => {
            expect(useGameUIStore.getState().isGameScreenOpen).toBe(true);
            expect(onClose).toHaveBeenCalled();
        });
    });
});
