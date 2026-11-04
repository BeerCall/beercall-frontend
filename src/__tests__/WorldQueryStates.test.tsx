import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';
import SelectWorldModal from '../components/Modals/SelectWorldModal';
import { useGameUIStore } from '../store/useGameUIStore';

const worldSceneCaptor = vi.fn();

vi.mock('../worlds/WorldScene', () => ({
    WorldScene: (props: unknown) => {
        worldSceneCaptor(props);
        return <div data-testid="world-scene-mock" />;
    },
}));

const worlds = (count: number) => ({
    worlds: { bar: { participants: Array.from({ length: count }, (_, i) => ({ user_id: `u_${i}` })) } },
});

const clients: QueryClient[] = [];

afterEach(() => {
    clients.forEach((client) => client.clear());
    clients.length = 0;
    useGameUIStore.getState().closeGameScreen();
});

function mount() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    clients.push(client);
    render(
        <QueryClientProvider client={client}>
            <SelectWorldModal isOpen onClose={vi.fn()} squadId="1" beerCallId="bc_1" isActiveApero />
        </QueryClientProvider>
    );
    return client;
}

describe('Mondes : attente, panne, vide, fiabilité et refetch (T06 / CHAL-04)', () => {
    beforeEach(() => {
        worldSceneCaptor.mockClear();
    });

    it('attend les participants sans canvas ni bouton HTML, puis monte la scène PoC', async () => {
        let finish: () => void = () => {};
        const pending = new Promise<void>((resolve) => {
            finish = resolve;
        });

        server.use(
            http.get('*/squads/1/beer-calls/bc_1/worlds', async () => {
                await pending;
                return HttpResponse.json(worlds(2));
            })
        );

        mount();
        expect(screen.getByRole('status')).toHaveTextContent('Chargement des participants');
        expect(screen.queryByText(/Soldat\(s\)/)).not.toBeInTheDocument();
        expect(screen.queryByTestId('world-scene-mock')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Lancer le jeu/i })).not.toBeInTheDocument();
        expect(worldSceneCaptor).not.toHaveBeenCalled();

        await act(async () => {
            finish();
            await pending;
        });

        expect(await screen.findByText('2 Soldat(s)')).toBeInTheDocument();
        expect(screen.getByTestId('world-scene-mock')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Lancer le jeu/i })).not.toBeInTheDocument();
        expect(worldSceneCaptor).toHaveBeenLastCalledWith(
            expect.objectContaining({
                world: 'bar',
                participants: [{ user_id: 'u_0' }, { user_id: 'u_1' }],
            })
        );
    });

    it('affiche 500 sans zéro participant puis reprend par GET', async () => {
        let requests = 0;
        server.use(
            http.get('*/squads/1/beer-calls/bc_1/worlds', () =>
                ++requests === 1 ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json(worlds(2))
            )
        );

        mount();
        expect(await screen.findByRole('alert')).toHaveTextContent('Participants indisponibles');
        expect(screen.queryByText(/Soldat\(s\)/)).not.toBeInTheDocument();
        expect(screen.queryByTestId('world-scene-mock')).not.toBeInTheDocument();
        expect(worldSceneCaptor).not.toHaveBeenCalled();

        await userEvent.setup().click(screen.getByRole('button', { name: 'Réessayer' }));
        expect(await screen.findByText('2 Soldat(s)')).toBeInTheDocument();
        expect(requests).toBe(2);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(worldSceneCaptor).toHaveBeenLastCalledWith(
            expect.objectContaining({
                world: 'bar',
                participants: [{ user_id: 'u_0' }, { user_id: 'u_1' }],
            })
        );
    });

    it('explique un vrai monde vide après succès sans bouton HTML', async () => {
        server.use(http.get('*/squads/1/beer-calls/bc_1/worlds', () => HttpResponse.json(worlds(0))));
        mount();

        expect(await screen.findByText('Aucun participant dans ce monde')).toBeInTheDocument();
        expect(screen.getByText('0 Soldat(s)')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Démarrer la partie' })).toBeDisabled();
        expect(screen.queryByRole('button', { name: /Lancer le jeu/i })).not.toBeInTheDocument();
        expect(worldSceneCaptor).toHaveBeenLastCalledWith(
            expect.objectContaining({
                world: 'bar',
                participants: [],
            })
        );
    });

    it('préserve la scène et garde les dernières données pendant un refetch en erreur', async () => {
        let failing = false;
        let holdRefetch = false;
        let resolveRefetchPromise!: () => void;
        const refetchGate = new Promise<void>((resolve) => {
            resolveRefetchPromise = resolve;
        });

        server.use(
            http.get('*/squads/1/beer-calls/bc_1/worlds', async () => {
                if (holdRefetch) {
                    await refetchGate;
                }
                return failing ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json(worlds(2));
            })
        );

        const client = mount();
        await screen.findByText('2 Soldat(s)');
        expect(worldSceneCaptor).toHaveBeenLastCalledWith(
            expect.objectContaining({ world: 'bar' })
        );

        holdRefetch = true;
        failing = true;
        const refetchPromise = client.invalidateQueries({ queryKey: ['worlds', '1', 'bc_1'] });

        expect(worldSceneCaptor).toHaveBeenLastCalledWith(
            expect.objectContaining({ world: 'bar' })
        );

        resolveRefetchPromise();
        await act(async () => {
            await refetchPromise;
        });

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Actualisation impossible — dernières données affichées'
        );
        expect(screen.getByTestId('world-scene-mock')).toBeInTheDocument();
        expect(screen.getByText('2 Soldat(s)')).toBeInTheDocument();
        expect(worldSceneCaptor).toHaveBeenLastCalledWith(
            expect.objectContaining({
                world: 'bar',
                participants: [{ user_id: 'u_0' }, { user_id: 'u_1' }],
            })
        );

        failing = false;
        holdRefetch = false;
        await userEvent.setup().click(screen.getByRole('button', { name: 'Réessayer' }));
        expect(await screen.findByText('2 Soldat(s)')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('change de monde sans remonter le dashboard et transmet les participants de l’onglet actif', async () => {
        server.use(
            http.get('*/squads/1/beer-calls/bc_1/worlds', () =>
                HttpResponse.json({
                    worlds: {
                        bar: { participants: [{ user_id: 'u_0' }] },
                        piscine: { participants: [{ user_id: 'u_1' }] },
                    },
                })
            )
        );
        mount();

        expect(await screen.findByTestId('world-scene-mock')).toBeInTheDocument();
        expect(worldSceneCaptor).toHaveBeenLastCalledWith(
            expect.objectContaining({ world: 'bar', participants: [{ user_id: 'u_0' }] })
        );

        await userEvent.setup().click(screen.getByRole('button', { name: /piscine/i }));

        expect(await screen.findByTestId('world-scene-mock')).toBeInTheDocument();
        expect(worldSceneCaptor).toHaveBeenLastCalledWith(
            expect.objectContaining({ world: 'piscine', participants: [{ user_id: 'u_1' }] })
        );
    });
});
