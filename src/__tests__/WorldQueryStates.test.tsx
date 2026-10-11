import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';
import SelectWorldModal from '../components/Modals/SelectWorldModal';
import { useGameUIStore } from '../store/useGameUIStore';

vi.mock('@react-three/fiber', () => ({ Canvas: () => <div data-testid="world-canvas" />, useFrame: vi.fn() }));
vi.mock('../components/3D/BarWorld', () => ({ default: () => null }));
vi.mock('../components/3D/PiscineWorld', () => ({ default: () => null }));
vi.mock('../components/3D/FloatyIslandWorld', () => ({ default: () => null }));
const worlds = (count: number) => ({ worlds: { bar: { participants: Array.from({ length: count }, (_, i) => ({ user_id: `u_${i}` })) } } });
const clients: QueryClient[] = [];
afterEach(() => { clients.forEach(client => client.clear()); clients.length = 0; useGameUIStore.getState().closeGameScreen(); });
function mount() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    clients.push(client);
    render(<QueryClientProvider client={client}><SelectWorldModal isOpen onClose={vi.fn()} squadId="1" beerCallId="bc_1" isActiveApero /></QueryClientProvider>);
    return client;
}

describe('Mondes : attente, panne, vide et participants conservés', () => {
    it('attend les participants sans canvas ni compteur fictif', async () => {
        let finish: () => void = () => {};
        const pending = new Promise<void>(resolve => { finish = resolve; });
        server.use(http.get('*/squads/1/beer-calls/bc_1/worlds', async () => { await pending; return HttpResponse.json(worlds(2)); }));
        mount();
        expect(screen.getByRole('status')).toHaveTextContent('Chargement des participants');
        expect(screen.queryByText(/Soldat\(s\)/)).not.toBeInTheDocument();
        expect(screen.queryByTestId('world-canvas')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Lancer le jeu' })).toBeDisabled();
        await act(async () => { finish(); await pending; });
        expect(await screen.findByText('2 Soldat(s)')).toBeInTheDocument();
        expect(screen.getByTestId('world-canvas')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Lancer le jeu' })).toBeEnabled();
    });

    it('affiche 500 sans zéro participant puis reprend par GET', async () => {
        let requests = 0;
        server.use(http.get('*/squads/1/beer-calls/bc_1/worlds', () => ++requests === 1
            ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json(worlds(2))));
        mount();
        expect(await screen.findByRole('alert')).toHaveTextContent('Participants indisponibles');
        expect(screen.queryByText(/Soldat\(s\)/)).not.toBeInTheDocument();
        expect(screen.queryByTestId('world-canvas')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Lancer le jeu' })).toBeDisabled();
        await userEvent.setup().click(screen.getByRole('button', { name: 'Réessayer' }));
        expect(await screen.findByText('2 Soldat(s)')).toBeInTheDocument();
        expect(requests).toBe(2);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('explique un vrai monde vide après succès', async () => {
        server.use(http.get('*/squads/1/beer-calls/bc_1/worlds', () => HttpResponse.json(worlds(0))));
        mount();
        expect(await screen.findByText('Aucun participant dans ce monde')).toBeInTheDocument();
        expect(screen.getByText('0 Soldat(s)')).toBeInTheDocument();
        expect(screen.getByText('Au moins 2 participants au Bar sont nécessaires')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Lancer le jeu' })).toBeDisabled();
    });

    it('préserve la scène mais bloque le jeu sur données périmées et rétablit le lancement', async () => {
        let failing = false;
        let starts = 0;
        server.use(
            http.get('*/squads/1/beer-calls/bc_1/worlds', () => failing ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json(worlds(2))),
            http.post('*/aperos/1/game/start', () => { starts++; return HttpResponse.json({}); }),
        );
        const client = mount();
        await screen.findByText('2 Soldat(s)');
        const canvas = screen.getByTestId('world-canvas');
        failing = true;
        await act(async () => { await client.invalidateQueries({ queryKey: ['worlds', '1', 'bc_1'] }); });
        expect(await screen.findByRole('alert')).toHaveTextContent('Actualisation impossible — dernières données affichées');
        expect(screen.getByTestId('world-canvas')).toBe(canvas);
        expect(screen.getByText('2 Soldat(s)')).toBeInTheDocument();
        const button = screen.getByRole('button', { name: 'Lancer le jeu' });
        expect(button).toBeDisabled();
        await userEvent.setup().click(button);
        expect(starts).toBe(0);
        failing = false;
        await userEvent.setup().click(screen.getByRole('button', { name: 'Réessayer' }));
        await waitFor(() => expect(button).toBeEnabled());
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByText('2 Soldat(s)')).toBeInTheDocument();
    });
});
