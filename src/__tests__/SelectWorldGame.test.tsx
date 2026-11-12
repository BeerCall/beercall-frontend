import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SelectWorldModal from '../components/Modals/SelectWorldModal';
import { isWorldOpen, resetWorldOpenState } from '../lib/worldOpenState';
import { useGameUIStore } from '../store/useGameUIStore';
import { server } from './mocks/server';

const worldSceneCaptor = vi.fn();
const viewportMounts = vi.hoisted(() => ({ count: 0 }));

vi.mock('../worlds/WorldViewport', () => ({
    WorldViewport: (props: unknown) => {
        worldSceneCaptor(props);
        React.useEffect(() => {
            viewportMounts.count += 1;
        }, []);
        return <div data-testid="world-scene-mock" />;
    },
}));

describe('SelectWorldModal avec contrôle accessible masqué et délégation à la scène PoC (T06)', () => {
    beforeEach(() => {
        worldSceneCaptor.mockClear();
        viewportMounts.count = 0;
    });

    afterEach(() => {
        useGameUIStore.getState().closeGameScreen();
        resetWorldOpenState();
    });

    it('suspend le préchargement GLB tant que la modale des mondes est ouverte', () => {
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const { unmount } = render(
            <QueryClientProvider client={queryClient}>
                <SelectWorldModal isOpen onClose={vi.fn()} squadId="1" beerCallId="bc_1" isActiveApero />
            </QueryClientProvider>
        );
        expect(isWorldOpen()).toBe(true);
        unmount();
        expect(isWorldOpen()).toBe(false);
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

        // Les données arrivent, la scène PoC est montée avec les participants
        await waitFor(() => expect(screen.getByTestId('world-scene-mock')).toBeInTheDocument());
        expect(screen.queryByRole('button', { name: /Lancer le jeu/i })).not.toBeInTheDocument();

        expect(worldSceneCaptor).toHaveBeenLastCalledWith(
            expect.objectContaining({
                activeTab: 'bar',
                worlds: expect.objectContaining({
                    bar: expect.objectContaining({
                        participants: [{ user_id: 'u_1' }, { user_id: 'u_2' }],
                    }),
                }),
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

        expect(worldSceneCaptor).toHaveBeenLastCalledWith(
            expect.objectContaining({
                activeTab: 'bar',
                worlds: expect.objectContaining({
                    bar: expect.objectContaining({
                        participants: [{ user_id: 'u_1' }],
                    }),
                }),
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
        await waitFor(() => expect(screen.getByTestId('world-scene-mock')).toBeInTheDocument());

        const startButton = screen.getByRole('button', { name: 'Démarrer la partie' });
        expect(startButton).toBeEnabled();

        // Le lancement déclenche l'ouverture de l'écran de jeu et la fermeture de la modale
        startButton.click();
        await waitFor(() => {
            expect(useGameUIStore.getState().isGameScreenOpen).toBe(true);
            expect(onClose).toHaveBeenCalled();
        });
    });

    it('retire le focus de la feuille quand elle passe en aria-hidden', async () => {
        server.use(
            http.get('*/squads/1/beer-calls/bc_1/worlds', () =>
                HttpResponse.json({ worlds: { bar: { participants: [] } } })
            )
        );
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const renderModal = (isOpen: boolean) => (
            <QueryClientProvider client={queryClient}>
                <SelectWorldModal isOpen={isOpen} onClose={vi.fn()} squadId="1" beerCallId="bc_1" isActiveApero={false}/>
            </QueryClientProvider>
        );
        const view = render(renderModal(true));
        const close = screen.getByRole('button', { name: 'Fermer les mondes' });
        close.focus();
        expect(close).toHaveFocus();

        view.rerender(renderModal(false));

        const sheet = close.closest('[aria-hidden]') as HTMLElement;
        expect(sheet).toHaveAttribute('aria-hidden', 'true');
        expect(sheet).toHaveAttribute('inert');
        expect(close).not.toHaveFocus();
        expect(document.activeElement).not.toBe(close);
    });

    it('garde un seul WorldViewport monté lors du changement d’onglet', async () => {        server.use(
            http.get('*/squads/1/beer-calls/bc_1/worlds', () =>
                HttpResponse.json({
                    worlds: {
                        bar: { participants: [{ user_id: 'u_1' }] },
                        piscine: { participants: [{ user_id: 'u_2' }] },
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

        await waitFor(() => expect(screen.getByTestId('world-scene-mock')).toBeInTheDocument());
        expect(viewportMounts.count).toBe(1);
        expect(worldSceneCaptor).toHaveBeenLastCalledWith(
            expect.objectContaining({ activeTab: 'bar' })
        );

        fireEvent.click(screen.getByRole('button', { name: /piscine/i }));

        await waitFor(() => expect(worldSceneCaptor).toHaveBeenLastCalledWith(
            expect.objectContaining({ activeTab: 'piscine' })
        ));
        expect(viewportMounts.count).toBe(1);
        expect(screen.getByTestId('world-scene-mock')).toBeInTheDocument();
    });

    it('transmet le toucher d’un avatar au parent, sans changer de Canvas', async () => {
        server.use(
            http.get('*/squads/1/beer-calls/bc_1/worlds', () =>
                HttpResponse.json({
                    worlds: {
                        bar: { participants: [{ user_id: 'u_7', username: 'Ada' }] },
                    },
                })
            )
        );

        const onSelectUser = vi.fn();
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(
            <QueryClientProvider client={queryClient}>
                <SelectWorldModal isOpen onClose={vi.fn()} squadId="1" beerCallId="bc_1"
                                  isActiveApero onSelectUser={onSelectUser}/>
            </QueryClientProvider>
        );

        await waitFor(() => expect(screen.getByTestId('world-scene-mock')).toBeInTheDocument());
        expect(viewportMounts.count).toBe(1);
        const props = worldSceneCaptor.mock.calls.at(-1)?.[0] as {
            onSelectUser?: (userId: string) => void;
        };
        expect(typeof props.onSelectUser).toBe('function');

        props.onSelectUser?.('u_7');
        expect(onSelectUser).toHaveBeenCalledWith('u_7');
        expect(viewportMounts.count).toBe(1);
    });
});
