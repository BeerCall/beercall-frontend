import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';
import SelectWorldModal from '../components/Modals/SelectWorldModal';
import { useGameUIStore } from '../store/useGameUIStore';

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
        barWorldCaptor.mockClear();
    });

    it('attend les participants sans canvas ni bouton HTML, puis passe participantsReliable=true', async () => {
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
        expect(screen.queryByTestId('world-canvas')).not.toBeInTheDocument();
        // Absence systématique du bouton HTML
        expect(screen.queryByRole('button', { name: /Lancer le jeu/i })).not.toBeInTheDocument();
        expect(barWorldCaptor).not.toHaveBeenCalled();

        await act(async () => {
            finish();
            await pending;
        });

        expect(await screen.findByText('2 Soldat(s)')).toBeInTheDocument();
        expect(screen.getByTestId('world-canvas')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Lancer le jeu/i })).not.toBeInTheDocument();
        expect(barWorldCaptor).toHaveBeenLastCalledWith(
            expect.objectContaining({
                participantsReliable: true,
                participants: [{ user_id: 'u_0' }, { user_id: 'u_1' }],
            })
        );
    });

    it('affiche 500 sans zéro participant puis reprend par GET et active la fiabilité', async () => {
        let requests = 0;
        server.use(
            http.get('*/squads/1/beer-calls/bc_1/worlds', () =>
                ++requests === 1 ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json(worlds(2))
            )
        );

        mount();
        expect(await screen.findByRole('alert')).toHaveTextContent('Participants indisponibles');
        expect(screen.queryByText(/Soldat\(s\)/)).not.toBeInTheDocument();
        expect(screen.queryByTestId('world-canvas')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Lancer le jeu/i })).not.toBeInTheDocument();
        expect(barWorldCaptor).not.toHaveBeenCalled();

        await userEvent.setup().click(screen.getByRole('button', { name: 'Réessayer' }));
        expect(await screen.findByText('2 Soldat(s)')).toBeInTheDocument();
        expect(requests).toBe(2);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(barWorldCaptor).toHaveBeenLastCalledWith(
            expect.objectContaining({
                participantsReliable: true,
                participants: [{ user_id: 'u_0' }, { user_id: 'u_1' }],
            })
        );
    });

    it('explique un vrai monde vide après succès sans bouton HTML', async () => {
        server.use(http.get('*/squads/1/beer-calls/bc_1/worlds', () => HttpResponse.json(worlds(0))));
        mount();

        expect(await screen.findByText('Aucun participant dans ce monde')).toBeInTheDocument();
        expect(screen.getByText('0 Soldat(s)')).toBeInTheDocument();
        expect(screen.getByText('Au moins 2 participants au Bar sont nécessaires')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Lancer le jeu/i })).not.toBeInTheDocument();
        expect(barWorldCaptor).toHaveBeenLastCalledWith(
            expect.objectContaining({
                participantsReliable: true,
                participants: [],
            })
        );
    });

    it('préserve la scène, garde participantsReliable=true pendant un refetch, et bascule à false sur erreur stale', async () => {
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
        expect(barWorldCaptor).toHaveBeenLastCalledWith(
            expect.objectContaining({ participantsReliable: true })
        );

        // Début du refetch de fond (CHAL-04)
        holdRefetch = true;
        failing = true;
        const refetchPromise = client.invalidateQueries({ queryKey: ['worlds', '1', 'bc_1'] });

        // Pendant le refetch (en cours de requête), hasWorldData reste vrai et isError est encore faux
        expect(barWorldCaptor).toHaveBeenLastCalledWith(
            expect.objectContaining({ participantsReliable: true })
        );

        // On libère la réponse 500
        resolveRefetchPromise();
        await act(async () => {
            await refetchPromise;
        });

        // Maintenant l'erreur stale est arrivée
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Actualisation impossible — dernières données affichées'
        );
        expect(screen.getByTestId('world-canvas')).toBeInTheDocument();
        expect(screen.getByText('2 Soldat(s)')).toBeInTheDocument();
        expect(barWorldCaptor).toHaveBeenLastCalledWith(
            expect.objectContaining({
                participantsReliable: false,
                participants: [{ user_id: 'u_0' }, { user_id: 'u_1' }],
            })
        );

        // Réessayer avec succès
        failing = false;
        holdRefetch = false;
        await userEvent.setup().click(screen.getByRole('button', { name: 'Réessayer' }));
        await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());

        expect(screen.getByText('2 Soldat(s)')).toBeInTheDocument();
        expect(barWorldCaptor).toHaveBeenLastCalledWith(
            expect.objectContaining({ participantsReliable: true })
        );
    });
});
