import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';
import Dashboard from '../pages/Dashboard';
import type { SquadDetails, BeerCall } from '../types/api';

vi.mock('../components/Dashboard/MapSection', () => ({ MapSection: () => <div data-testid="query-state-map" /> }));
vi.mock('../hooks/usePushNotifications', () => ({ usePushNotifications: () => ({ subscribeToNotifications: vi.fn() }) }));
vi.mock('../hooks/useSquadWebSocket', () => ({ useSquadWebSocket: vi.fn() }));
const call: BeerCall = {
    id: 'bc-test', creator_name: 'Fixture', creator_id: 1, location_name: 'Lieu conservé',
    latitude: 48.85, longitude: 2.35, status: 'active', participants_count: 1, has_responded: false, can_start: false,
};
const details: SquadDetails = {
    id: '1', name: 'Squad réelle', color: '#F59E0B', icon: 'beer', invite_code: 'TEST',
    active_beer_call: [], scheduled_beer_calls: [], past_beer_calls: [],
};
const clients: QueryClient[] = [];
afterEach(() => { clients.forEach(client => client.clear()); clients.length = 0; });
function mount() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    clients.push(client);
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/squad/1']}>
        <Routes><Route path="/squad/:id" element={<Dashboard />} /></Routes>
    </MemoryRouter></QueryClientProvider>);
    return client;
}
function expectNoFalseEmpty() {
    expect(screen.queryByText(/Aucun événement/)).not.toBeInTheDocument();
    expect(screen.queryByText('Squad #1')).not.toBeInTheDocument();
    expect(screen.getByTestId('query-state-map')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Navigation des squads' })).toBeInTheDocument();
}

describe('Squad : vraie query, quatre états distincts', () => {
    it('conserve carte/navigation et ne montre pas de faux vide pendant l’attente', async () => {
        let finish: () => void = () => {};
        const pending = new Promise<void>(resolve => { finish = resolve; });
        server.use(http.get('*/squads/1', async () => { await pending; return HttpResponse.json(details); }));
        mount();
        expect(screen.getByText('Chargement de la squad…')).toHaveAttribute('role', 'status');
        expectNoFalseEmpty();
        await act(async () => { finish(); await pending; });
        expect(await screen.findByRole('heading', { name: details.name })).toBeInTheDocument();
        expect(await screen.findByText(/Aucun événement/)).toBeInTheDocument();
    });

    it.each([[403, 'Accès à cette squad refusé'], [404, 'Squad introuvable'], [500, 'Squad indisponible']] as const)('affiche %i sans titre factice ni liste vide', async (status, message) => {
        server.use(http.get('*/squads/1', () => HttpResponse.json({ detail: 'Erreur test' }, { status })));
        mount();
        expect(await screen.findByRole('alert')).toHaveTextContent(message);
        expectNoFalseEmpty();
        expect(screen.getByRole('button', { name: 'Réessayer', exact: true })).toBeEnabled();
    });

    it('distingue une panne réseau d’une squad vide', async () => {
        server.use(http.get('*/squads/1', () => HttpResponse.error()));
        mount();
        expect(await screen.findByRole('alert')).toHaveTextContent('Squad indisponible');
        expectNoFalseEmpty();
    });

    it('reprend une erreur initiale par un GET et affiche un vrai succès vide', async () => {
        let requests = 0;
        server.use(http.get('*/squads/1', () => ++requests === 1
            ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json(details)));
        mount();
        await screen.findByRole('alert');
        await userEvent.setup().click(screen.getByRole('button', { name: 'Réessayer', exact: true }));
        expect(await screen.findByRole('heading', { name: details.name })).toBeInTheDocument();
        expect(await screen.findByText(/Aucun événement/)).toBeInTheDocument();
        expect(requests).toBe(2);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('garde les dernières cartes en échec de refetch puis rétablit la query', async () => {
        let failing = false;
        server.use(http.get('*/squads/1', () => failing ? HttpResponse.json({}, { status: 500 })
            : HttpResponse.json({ ...details, active_beer_call: [call] })));
        const client = mount();
        await screen.findByRole('heading', { name: call.location_name });
        failing = true;
        await act(async () => { await client.invalidateQueries({ queryKey: ['squad', '1'] }); });
        expect(await screen.findByRole('alert')).toHaveTextContent('Actualisation impossible — dernières données affichées');
        expect(screen.getByRole('heading', { name: details.name })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: call.location_name })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Chat', exact: true })).toBeEnabled();
        expectNoFalseEmpty();
        failing = false;
        await userEvent.setup().click(screen.getByRole('button', { name: 'Réessayer', exact: true }));
        await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
        expect(screen.getByRole('heading', { name: call.location_name })).toBeInTheDocument();
    });
});
