import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, expect, it, vi } from 'vitest';
import SelectWorldModal from '../components/Modals/SelectWorldModal';
import { useGameUIStore } from '../store/useGameUIStore';
import { server } from './mocks/server';

vi.mock('../components/3D/BarWorld', () => ({ default: () => null }));
vi.mock('../components/3D/PiscineWorld', () => ({ default: () => null }));
vi.mock('../components/3D/FloatyIslandWorld', () => ({ default: () => null }));

afterEach(() => useGameUIStore.getState().closeGameScreen());

it('lance le vrai contrat API, remplit le cache et ouvre le jeu', async () => {
    const payload = { game_id: 'TURN_TRANSITION', title: 'Nouveau défi', turn_of: 'User', required_sensor: { type: 'BUTTONS' }, actions: [] };
    let starts = 0;
    server.use(
        http.get('*/squads/1/beer-calls/bc_1/worlds', () => HttpResponse.json({ worlds: { bar: { participants: [{ user_id: 'u_1' }, { user_id: 'u_2' }] } } })),
        http.post('*/aperos/1/game/start', () => { starts++; return HttpResponse.json(payload); }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onClose = vi.fn();
    render(<QueryClientProvider client={queryClient}><SelectWorldModal isOpen onClose={onClose} squadId="1" beerCallId="bc_1" isActiveApero /></QueryClientProvider>);
    const button = screen.getByRole('button', { name: 'Lancer le jeu' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(useGameUIStore.getState().isGameScreenOpen).toBe(true));
    expect(starts).toBe(1);
    expect(onClose).toHaveBeenCalledOnce();
    expect(useGameUIStore.getState().currentAperoId).toBe('bc_1');
    expect(queryClient.getQueryData(['gameState', '1'])).toEqual(payload);
});

it('désactive le lancement tant que deux participants ne sont pas présents', async () => {
    server.use(http.get('*/squads/1/beer-calls/bc_1/worlds', () => HttpResponse.json({ worlds: { bar: { participants: [{ user_id: 'u_1' }] } } })));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><SelectWorldModal isOpen onClose={vi.fn()} squadId="1" beerCallId="bc_1" isActiveApero /></QueryClientProvider>);
    await screen.findByText('1 Soldat(s)');
    expect(screen.getByRole('button', { name: 'Lancer le jeu' })).toBeDisabled();
    expect(useGameUIStore.getState().isGameScreenOpen).toBe(false);
});
