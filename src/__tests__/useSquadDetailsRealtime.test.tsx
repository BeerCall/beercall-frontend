import { renderHook, act, waitFor, render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useSquadDetails } from '../hooks/useSquadDetails';
import { api } from '../lib/api';
import ChatPage from '../pages/ChatPage';
import * as wsHook from '../hooks/useSquadWebSocket';

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

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
  onValue: vi.fn().mockImplementation((_ref, callback) => {
    callback({ val: () => ({}) });
    return () => {};
  }),
  query: vi.fn(),
  orderByChild: vi.fn(),
  limitToLast: vi.fn(),
}));

describe('useSquadDetailsRealtime & ChatPage WS integration', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ne fait aucun refresh périodique squad après 60 s sans événement', async () => {
    vi.useFakeTimers();
    vi.mocked(api.get).mockResolvedValue({
      data: { id: '10', name: 'Squad 10', active_beer_call: [] },
    });

    const { result } = renderHook(() => useSquadDetails('10'), { wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(result.current.data?.name).toBe('Squad 10');
    expect(api.get).toHaveBeenCalledTimes(1);

    // Avancer de 60 s : aucun appel supplémentaire
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('s’actualise après une invalidation de cache (événement temps réel)', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({
        data: { id: '10', name: 'Nom Ancien', active_beer_call: [] },
      })
      .mockResolvedValueOnce({
        data: { id: '10', name: 'Nom Nouveau', active_beer_call: [] },
      });

    const { result } = renderHook(() => useSquadDetails('10'), { wrapper });

    await waitFor(() => expect(result.current.data?.name).toBe('Nom Ancien'));
    expect(api.get).toHaveBeenCalledTimes(1);

    // Déclencher une invalidation externe (comme le ferait useSquadWebSocket)
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['squad', '10'] });
    });

    await waitFor(() => expect(result.current.data?.name).toBe('Nom Nouveau'));
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('timer d’expiration déclenche exactement une invalidation à ended_at et aucune requête avant', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    const endedAtIso = new Date(now + 5000).toISOString();

    vi.mocked(api.get)
      .mockResolvedValueOnce({
        data: {
          id: '10',
          name: 'Squad 10',
          active_beer_call: [
            {
              id: 'call-1',
              status: 'active',
              ended_at: endedAtIso,
              creator_id: 1,
              creator_name: 'Alice',
              location_name: 'Bar',
              longitude: 2.3,
              latitude: 48.8,
              participants_count: 2,
              has_responded: true,
              can_start: true,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: '10',
          name: 'Squad 10',
          active_beer_call: [], // expiré et clos côté serveur
        },
      });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => useSquadDetails('10'), { wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(api.get).toHaveBeenCalledTimes(1);

    // Pendant sa vie (4900 ms sur 5000 ms), AUCUNE requête n'est émise
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4900);
    });
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['squad', '10'] });

    // À l'échéance ended_at (+100 ms supplémentaires) : déclenchement ponctuel
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['squad', '10'] });
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('timer d’expiration est annulé au démontage (aucun timer résiduel)', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    const endedAtIso = new Date(now + 10000).toISOString();

    vi.mocked(api.get).mockResolvedValueOnce({
      data: {
        id: '10',
        name: 'Squad 10',
        active_beer_call: [
          {
            id: 'call-1',
            status: 'active',
            ended_at: endedAtIso,
            creator_id: 1,
            creator_name: 'Alice',
            location_name: 'Bar',
            longitude: 2.3,
            latitude: 48.8,
            participants_count: 2,
            has_responded: true,
            can_start: true,
          },
        ],
      },
    });

    const { unmount } = renderHook(() => useSquadDetails('10'), { wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(api.get).toHaveBeenCalledTimes(1);

    // Démonter à T + 2000 ms
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    unmount();

    // Avancer au-delà de ended_at : aucun appel supplémentaire, aucun timer actif
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('timer d’expiration est recalculé et l’ancien annulé si ended_at avance', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    const firstEndedAt = new Date(now + 3000).toISOString();
    const secondEndedAt = new Date(now + 8000).toISOString();

    vi.mocked(api.get)
      .mockResolvedValueOnce({
        data: {
          id: '10',
          name: 'Squad 10',
          active_beer_call: [
            {
              id: 'c1',
              status: 'active',
              ended_at: firstEndedAt,
              creator_id: 1,
              creator_name: 'Alice',
              location_name: 'Bar',
              longitude: 2.3,
              latitude: 48.8,
              participants_count: 2,
              has_responded: true,
              can_start: true,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: '10',
          name: 'Squad 10',
          active_beer_call: [
            {
              id: 'c1',
              status: 'active',
              ended_at: secondEndedAt, // repoussé
              creator_id: 1,
              creator_name: 'Alice',
              location_name: 'Bar',
              longitude: 2.3,
              latitude: 48.8,
              participants_count: 2,
              has_responded: true,
              can_start: true,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: '10',
          name: 'Squad 10',
          active_beer_call: [],
        },
      });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => useSquadDetails('10'), { wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(api.get).toHaveBeenCalledTimes(1);

    // À T + 1000 ms, une actualisation externe met à jour ended_at vers +8000 ms
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await queryClient.invalidateQueries({ queryKey: ['squad', '10'] });
    });
    expect(api.get).toHaveBeenCalledTimes(2);
    invalidateSpy.mockClear();

    // À l'ancienne échéance T + 3000 ms (+2000 ms plus tard), l'ancien timer annulé ne déclenche rien
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['squad', '10'] });

    // À la nouvelle échéance T + 8000 ms (+5000 ms plus tard), l'invalidation se produit
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['squad', '10'] });
    expect(api.get).toHaveBeenCalledTimes(3);
  });

  it('ChatPage monte useSquadWebSocket avec son squadId et la ferme au démontage', () => {
    const wsSpy = vi.spyOn(wsHook, 'useSquadWebSocket');
    vi.mocked(api.get).mockResolvedValue({
      data: { id: '42', name: 'Squad 42', active_beer_call: [] },
    });

    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/squad/42/chat']}>
          <Routes>
            <Route path="/squad/:id/chat" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(wsSpy).toHaveBeenCalledWith(42);

    unmount();
    // Le démontage de ChatPage démonte useSquadWebSocket
  });

  it('ChatPage et Dashboard sont des routes distinctes : une seule monte la socket à la fois (CHAL-03, H06)', () => {
    let activeSquadWsCount = 0;
    vi.spyOn(wsHook, 'useSquadWebSocket').mockImplementation((squadId?: number) => {
      React.useEffect(() => {
        if (squadId) {
          activeSquadWsCount += 1;
        }
        return () => {
          if (squadId) {
            activeSquadWsCount -= 1;
          }
        };
      }, [squadId]);
      return { current: null };
    });

    vi.mocked(api.get).mockResolvedValue({
      data: { id: '42', name: 'Squad 42', active_beer_call: [] },
    });

    // Simuler un Dashboard factice qui monte useSquadWebSocket(42)
    const FakeDashboard = () => {
      wsHook.useSquadWebSocket(42);
      return <div>Dashboard View</div>;
    };

    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/squad/42']}>
          <Routes>
            <Route path="/squad/:id" element={<FakeDashboard />} />
            <Route path="/squad/:id/chat" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Sur /squad/42, exactement 1 montage actif
    expect(activeSquadWsCount).toBe(1);

    unmount();
    // Après unmount, 0 montage actif
    expect(activeSquadWsCount).toBe(0);

    // Maintenant monter ChatPage sur /squad/42/chat
    const chatRender = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/squad/42/chat']}>
          <Routes>
            <Route path="/squad/:id" element={<FakeDashboard />} />
            <Route path="/squad/:id/chat" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Exactement 1 montage actif pour ChatPage
    expect(activeSquadWsCount).toBe(1);

    chatRender.unmount();
    expect(activeSquadWsCount).toBe(0);
  });
});
