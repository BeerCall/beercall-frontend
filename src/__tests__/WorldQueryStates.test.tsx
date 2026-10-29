import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';
import SelectWorldModal from '../components/Modals/SelectWorldModal';
import { useGameUIStore } from '../store/useGameUIStore';

const barWorldCaptor = vi.fn();
const piscineWorldCaptor = vi.fn();
const dodoWorldCaptor = vi.fn();

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
vi.mock('../components/3D/PiscineWorld', () => ({
    default: (props: unknown) => {
        piscineWorldCaptor(props);
        return <div data-testid="piscine-world-mock" />;
    },
}));
vi.mock('../components/3D/FloatyIslandWorld', () => ({
    default: (props: unknown) => {
        dodoWorldCaptor(props);
        return <div data-testid="dodo-world-mock" />;
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
        barWorldCaptor.mockClear();
        piscineWorldCaptor.mockClear();
        dodoWorldCaptor.mockClear();
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
        expect(screen.queryByText(/Au moins 2 participants au Bar sont nécessaires/i)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Démarrer la partie' })).toBeDisabled();
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

    it('chargement dynamique (T19) : ne télécharge que le module du monde actif (bar) sans précharger piscine ni dodo', async () => {
        server.use(http.get('*/squads/1/beer-calls/bc_1/worlds', () => HttpResponse.json(worlds(2))));
        const client = mount();

        expect(await screen.findByText('2 Soldat(s)')).toBeInTheDocument();
        expect(await screen.findByTestId('bar-world-mock')).toBeInTheDocument();

        // Seule la query du monde actif ('bar') est présente dans le cache React Query
        expect(client.getQueryCache().find({ queryKey: ['world-module', 'bar'] })).toBeDefined();
        expect(client.getQueryCache().find({ queryKey: ['world-module', 'piscine'] })).toBeUndefined();
        expect(client.getQueryCache().find({ queryKey: ['world-module', 'dodo'] })).toBeUndefined();

        expect(barWorldCaptor).toHaveBeenCalled();
        expect(piscineWorldCaptor).not.toHaveBeenCalled();
        expect(dodoWorldCaptor).not.toHaveBeenCalled();
    });

    it('chargement dynamique (T19) : passage d’onglet vers piscine déclenche le téléchargement du module correspondant', async () => {
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
        const client = mount();

        expect(await screen.findByTestId('bar-world-mock')).toBeInTheDocument();
        expect(client.getQueryCache().find({ queryKey: ['world-module', 'piscine'] })).toBeUndefined();

        // Clic sur l'onglet piscine
        const poolButton = screen.getByRole('button', { name: /piscine/i });
        await userEvent.setup().click(poolButton);

        // Maintenant le module piscine est demandé et monté
        expect(await screen.findByTestId('piscine-world-mock')).toBeInTheDocument();
        expect(client.getQueryCache().find({ queryKey: ['world-module', 'piscine'] })).toBeDefined();
        expect(piscineWorldCaptor).toHaveBeenCalled();

        // Le module dodo n'a toujours jamais été téléchargé
        expect(client.getQueryCache().find({ queryKey: ['world-module', 'dodo'] })).toBeUndefined();
        expect(dodoWorldCaptor).not.toHaveBeenCalled();
    });

    it('chargement dynamique (T19) : échec de chargement du module affiche une erreur explicite avec rechargement et retry', async () => {
        server.use(http.get('*/squads/1/beer-calls/bc_1/worlds', () => HttpResponse.json(worlds(2))));
        
        const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
        clients.push(client);
        
        let shouldFail = true;
        const mockLoader = vi.fn().mockImplementation(async () => {
            if (shouldFail) {
                throw new Error('Failed to fetch dynamically imported module');
            }
            return import('../components/3D/BarWorld');
        });

        render(
            <QueryClientProvider client={client}>
                <SelectWorldModal
                    isOpen
                    onClose={vi.fn()}
                    squadId="1"
                    beerCallId="bc_1"
                    isActiveApero
                    worldModuleLoader={mockLoader}
                />
            </QueryClientProvider>
        );

        // Les participants sont chargés
        expect(await screen.findByText('2 Soldat(s)')).toBeInTheDocument();

        // L'alerte d'échec de module 3D est affichée
        const alert = await screen.findByRole('alert', {}, { timeout: 4000 });
        expect(alert).toHaveTextContent('Impossible de charger le monde 3D');
        expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Recharger la page' })).toBeInTheDocument();

        // Le canvas 3D n'affiche pas le monde brisé
        expect(screen.queryByTestId('bar-world-mock')).not.toBeInTheDocument();

        // Test de l'action Recharger la page
        const reloadSpy = vi.fn();
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...window.location, reload: reloadSpy },
        });

        await userEvent.setup().click(screen.getByRole('button', { name: 'Recharger la page' }));
        expect(reloadSpy).toHaveBeenCalledOnce();

        // Test du retry : après rétablissement du réseau, le clic sur "Réessayer" charge le monde
        shouldFail = false;
        await userEvent.setup().click(screen.getByRole('button', { name: 'Réessayer' }));
        expect(await screen.findByTestId('bar-world-mock')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});
