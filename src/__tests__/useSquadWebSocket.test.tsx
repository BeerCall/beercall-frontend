import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useSquadWebSocket } from '../hooks/useSquadWebSocket';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/api', () => ({
  api: { post: vi.fn() }
}));

describe('useSquadWebSocket', () => {
  let queryClient: QueryClient;
  
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.clearAllMocks();
    
    vi.stubGlobal('WebSocket', vi.fn().mockImplementation(function (url: string, protocols: string[]) {
      // @ts-expect-error test mock
      this.url = url;
      // @ts-expect-error test mock
      this.protocols = protocols;
      // @ts-expect-error test mock
      this.close = vi.fn();
      // @ts-expect-error test mock
      this.send = vi.fn();
      
      setTimeout(() => {
        // @ts-expect-error test mock
        if (this.onopen) this.onopen();
      }, 10);
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('does not connect if no squadId is provided', () => {
    renderHook(() => useSquadWebSocket(undefined), { wrapper });
    expect(api.post).not.toHaveBeenCalled();
    expect(global.WebSocket).not.toHaveBeenCalled();
  });

  it('fetches a ticket and connects securely', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { ticket: 'secure_ticket_xyz' } });
    
    renderHook(() => useSquadWebSocket(42), { wrapper });
    
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/squads/42/ws-ticket');
    });
    
    await waitFor(() => {
      expect(global.WebSocket).toHaveBeenCalledWith(
        expect.stringContaining('/api/squads/42/ws'),
        ['beercall', 'ticket.secure_ticket_xyz']
      );
    });
    
    // Assure qu'aucun JWT n'est dans l'URL
    const wsCallUrl = vi.mocked(global.WebSocket).mock.calls[0][0];
    expect(wsCallUrl).not.toContain('?token=');
    expect(wsCallUrl).not.toContain('jwt');
  });

  it('aucun envoi avant ouverture, PING à 25 s après ouverture (CHAL-06)', async () => {
    vi.useFakeTimers();
    vi.mocked(api.post).mockResolvedValueOnce({ data: { ticket: 'hb-ticket' } });

    const { result, unmount } = renderHook(() => useSquadWebSocket(42), { wrapper });
    
    // Avant onopen (qui intervient à 10ms dans notre mock) : aucun ping envoyé
    await vi.advanceTimersByTimeAsync(5);
    expect(result.current.current?.send).not.toHaveBeenCalled();

    // Laisser passer le onopen (10ms)
    await vi.advanceTimersByTimeAsync(10);
    expect(result.current.current?.send).not.toHaveBeenCalled();

    // 24.9 s après onopen : toujours rien
    await vi.advanceTimersByTimeAsync(24900);
    expect(result.current.current?.send).not.toHaveBeenCalled();

    // À 25 s après onopen : PING est envoyé
    await vi.advanceTimersByTimeAsync(100);
    expect(result.current.current?.send).toHaveBeenCalledTimes(1);
    expect(result.current.current?.send).toHaveBeenCalledWith('PING');

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('la réponse PONG maintient la socket ouverte et réarme les timers', async () => {
    vi.useFakeTimers();
    vi.mocked(api.post).mockResolvedValueOnce({ data: { ticket: 'hb-ticket' } });

    const { result, unmount } = renderHook(() => useSquadWebSocket(42), { wrapper });
    await vi.advanceTimersByTimeAsync(25010);
    expect(result.current.current?.send).toHaveBeenCalledTimes(1);

    // Simuler la réception de PONG dans les 10 s
    result.current.current?.onmessage?.({ data: 'PONG' } as MessageEvent);

    // Avancer de 10 s : la socket n'a PAS été fermée
    await vi.advanceTimersByTimeAsync(10000);
    expect(result.current.current?.close).not.toHaveBeenCalled();

    // Avancer jusqu'au prochain intervalle (50 s) : deuxième PING
    await vi.advanceTimersByTimeAsync(15000);
    expect(result.current.current?.send).toHaveBeenCalledTimes(2);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('l’absence de PONG pendant 10 s après PING déclenche fermeture et reconnexion', async () => {
    vi.useFakeTimers();
    vi.mocked(api.post)
      .mockResolvedValueOnce({ data: { ticket: 'hb-ticket-1' } })
      .mockResolvedValueOnce({ data: { ticket: 'hb-ticket-2' } });

    const { result, unmount } = renderHook(() => useSquadWebSocket(42), { wrapper });
    await vi.advanceTimersByTimeAsync(25010);
    expect(result.current.current?.send).toHaveBeenCalledWith('PING');

    const oldWs = result.current.current;

    // Aucun PONG reçu pendant 10 s -> timeout déclenche fermeture
    await vi.advanceTimersByTimeAsync(10000);
    expect(oldWs?.close).toHaveBeenCalledWith(4000, 'Heartbeat timeout');

    // Déclencher onclose sur la fermeture
    oldWs?.onclose?.({ code: 4000 } as CloseEvent);

    // Avancer de 3 s pour la reconnexion
    await vi.advanceTimersByTimeAsync(3000);
    expect(api.post).toHaveBeenCalledTimes(2);

    // Laisser le onopen du nouveau WebSocket s'exécuter
    await vi.advanceTimersByTimeAsync(50);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('invalidates squad, worlds, squads and profile queries on REFRESH_SQUAD message', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { ticket: '123' } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    
    const { result } = renderHook(() => useSquadWebSocket(10), { wrapper });
    
    await waitFor(() => expect(result.current.current).not.toBeNull());
    const wsInstance = result.current.current;
    
    invalidateSpy.mockClear();

    // Simulate incoming REFRESH_SQUAD message without action (security fallback)
    if (wsInstance?.onmessage) {
      wsInstance.onmessage({ data: JSON.stringify({ type: 'REFRESH_SQUAD' }) } as MessageEvent);
    }
    
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['squad', '10'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['squad', 10] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['worlds', '10'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['squads'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['profile', 'me'] });
  });

  it('invalidation profil présente sur CREATE, JOIN, START et sans action (CHAL-11)', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { ticket: '123' } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    
    const { result } = renderHook(() => useSquadWebSocket(10), { wrapper });
    await waitFor(() => expect(result.current.current).not.toBeNull());
    const wsInstance = result.current.current;
    
    for (const action of ['CREATE', 'JOIN', 'START', undefined]) {
      invalidateSpy.mockClear();
      wsInstance?.onmessage?.({
        data: JSON.stringify({ type: 'REFRESH_SQUAD', ...(action ? { action } : {}) })
      } as MessageEvent);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['profile', 'me'] });
    }
  });

  it('invalidation profil ABSENTE sur une action non pertinente comme DECLINE ou REJECTED (CHAL-11)', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { ticket: '123' } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    
    const { result } = renderHook(() => useSquadWebSocket(10), { wrapper });
    await waitFor(() => expect(result.current.current).not.toBeNull());
    const wsInstance = result.current.current;
    
    for (const action of ['DECLINE', 'REJECTED', 'OTHER']) {
      invalidateSpy.mockClear();
      wsInstance?.onmessage?.({
        data: JSON.stringify({ type: 'REFRESH_SQUAD', action })
      } as MessageEvent);
      expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['profile', 'me'] });
      // Les caches squad et worlds restent invalidés
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['squad', '10'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['worlds', '10'] });
    }
  });

  it('invalide uniquement le job concerné sur BEER_CALL_JOB_UPDATED valide', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { ticket: '123' } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    
    const { result } = renderHook(() => useSquadWebSocket(10), { wrapper });
    await waitFor(() => expect(result.current.current).not.toBeNull());
    const wsInstance = result.current.current;
    
    invalidateSpy.mockClear();
    const testJobId = '12345678-1234-1234-1234-123456789abc';

    wsInstance?.onmessage?.({
      data: JSON.stringify({ type: 'BEER_CALL_JOB_UPDATED', job_id: testJobId })
    } as MessageEvent);

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['beer-call-job', '10', testJobId]
    });
    // Ne touche pas à squad, worlds ou profile
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['squad', '10'] });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['profile', 'me'] });
  });

  it('ignore BEER_CALL_JOB_UPDATED si le job_id n’est pas un UUID valide', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { ticket: '123' } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    
    const { result } = renderHook(() => useSquadWebSocket(10), { wrapper });
    await waitFor(() => expect(result.current.current).not.toBeNull());
    const wsInstance = result.current.current;
    
    invalidateSpy.mockClear();

    // job_id non UUID
    wsInstance?.onmessage?.({
      data: JSON.stringify({ type: 'BEER_CALL_JOB_UPDATED', job_id: '123' })
    } as MessageEvent);
    expect(invalidateSpy).not.toHaveBeenCalled();

    // job_id manquant
    wsInstance?.onmessage?.({
      data: JSON.stringify({ type: 'BEER_CALL_JOB_UPDATED' })
    } as MessageEvent);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('tolère les JSON invalides, types inconnus, messages non-objets et doublons', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { ticket: '123' } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    
    const { result } = renderHook(() => useSquadWebSocket(10), { wrapper });
    await waitFor(() => expect(result.current.current).not.toBeNull());
    const wsInstance = result.current.current;
    
    invalidateSpy.mockClear();

    // JSON corrompu
    expect(() => {
      wsInstance?.onmessage?.({ data: '{bad-json' } as MessageEvent);
    }).not.toThrow();
    expect(invalidateSpy).not.toHaveBeenCalled();

    // Type inconnu
    wsInstance?.onmessage?.({ data: JSON.stringify({ type: 'SOME_UNKNOWN_EVENT' }) } as MessageEvent);
    expect(invalidateSpy).not.toHaveBeenCalled();

    // Primitif ou null
    wsInstance?.onmessage?.({ data: JSON.stringify('hello') } as MessageEvent);
    wsInstance?.onmessage?.({ data: JSON.stringify(null) } as MessageEvent);
    expect(invalidateSpy).not.toHaveBeenCalled();

    // Doublons tolérés
    const validEvent = JSON.stringify({ type: 'REFRESH_SQUAD' });
    wsInstance?.onmessage?.({ data: validEvent } as MessageEvent);
    wsInstance?.onmessage?.({ data: validEvent } as MessageEvent);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['squad', '10'] });
  });

  it('onopen déclenche un rattrapage ponctuel des caches actifs', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { ticket: '123' } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    
    renderHook(() => useSquadWebSocket(10), { wrapper });
    
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['squad', '10'], type: 'active' });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['squad', 10], type: 'active' });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['worlds', '10'], type: 'active' });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['beer-call-job', '10'], type: 'active' });
    });
  });

  it('retour online déclenche le rattrapage et reconnecte si la socket est fermée', async () => {
    vi.mocked(api.post)
      .mockResolvedValueOnce({ data: { ticket: 'ticket-1' } })
      .mockResolvedValueOnce({ data: { ticket: 'ticket-2' } });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useSquadWebSocket(10), { wrapper });
    
    await waitFor(() => expect(result.current.current).not.toBeNull());
    const wsInstance = result.current.current;
    
    // Fermer la socket
    wsInstance?.onclose?.({ code: 1006 } as CloseEvent);
    expect(result.current.current).toBeNull();

    invalidateSpy.mockClear();

    // Dispatcher event online
    window.dispatchEvent(new Event('online'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledTimes(2);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['squad', '10'], type: 'active' });
    });
  });

  it('retour visibilitychange vers visible déclenche le rattrapage et reconnecte si fermée', async () => {
    vi.mocked(api.post)
      .mockResolvedValueOnce({ data: { ticket: 'ticket-1' } })
      .mockResolvedValueOnce({ data: { ticket: 'ticket-2' } });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useSquadWebSocket(10), { wrapper });
    
    await waitFor(() => expect(result.current.current).not.toBeNull());
    const wsInstance = result.current.current;
    
    wsInstance?.onclose?.({ code: 1006 } as CloseEvent);
    invalidateSpy.mockClear();

    // Visibility hidden ne fait rien
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(invalidateSpy).not.toHaveBeenCalled();

    // Visibility visible déclenche rattrapage et reconnexion
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledTimes(2);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['squad', '10'], type: 'active' });
    });
  });

  it('attempts to reconnect on abnormal closure', async () => {
    vi.useFakeTimers();
    vi.mocked(api.post)
      .mockResolvedValueOnce({ data: { ticket: 'tick1' } })
      .mockResolvedValueOnce({ data: { ticket: 'tick2' } });

    const { result, unmount } = renderHook(() => useSquadWebSocket(5), { wrapper });
    
    // allow initial ticket and onopen
    await vi.advanceTimersByTimeAsync(50);
    
    expect(api.post).toHaveBeenCalledTimes(1);
    
    const wsInstance = result.current.current;
    if (wsInstance?.onclose) {
      wsInstance.onclose({ code: 1006 } as CloseEvent);
    }
    
    // advance timer for reconnect (3000ms)
    await vi.advanceTimersByTimeAsync(3000);
    
    expect(api.post).toHaveBeenCalledTimes(2);
    unmount();
    vi.useRealTimers();
  });

  it('does not reconnect on 401, 403 or 404', async () => {
    vi.useFakeTimers();
    for (const status of [401, 403, 404]) {
      vi.mocked(api.post).mockReset();
      vi.mocked(api.post).mockRejectedValueOnce({ isAxiosError: true, response: { status } });
      
      const { unmount } = renderHook(() => useSquadWebSocket(status), { wrapper });
      
      await vi.advanceTimersByTimeAsync(100);
      expect(api.post).toHaveBeenCalledTimes(1);
      
      await vi.advanceTimersByTimeAsync(10000);
      expect(api.post).toHaveBeenCalledTimes(1);
      unmount();
    }
    vi.useRealTimers();
  });

  it('cleans up listeners and socket on unmount', async () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const docRemoveEventListenerSpy = vi.spyOn(document, 'removeEventListener');

    vi.mocked(api.post).mockResolvedValueOnce({ data: { ticket: 'xyz' } });
    const { result, unmount } = renderHook(() => useSquadWebSocket(8), { wrapper });
    
    await waitFor(() => expect(result.current.current).not.toBeNull());
    const wsInstance = result.current.current;
    
    unmount();
    
    expect(wsInstance?.close).toHaveBeenCalledWith(1000);
    expect(result.current.current).toBeNull();
    expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(docRemoveEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });

  it('handles squad changes', async () => {
    vi.mocked(api.post)
      .mockResolvedValueOnce({ data: { ticket: 's1' } })
      .mockResolvedValueOnce({ data: { ticket: 's2' } });

    const { rerender, result } = renderHook(({ id }) => useSquadWebSocket(id), { 
      initialProps: { id: 1 },
      wrapper 
    });
    
    await waitFor(() => expect(globalThis.WebSocket).toHaveBeenCalledWith(
        expect.stringContaining('/api/squads/1/ws'),
        expect.anything()
    ));

    const oldSocket = result.current.current;
    rerender({ id: 2 });
    
    await waitFor(() => expect(globalThis.WebSocket).toHaveBeenCalledWith(
        expect.stringContaining('/api/squads/2/ws'),
        expect.anything()
    ));
    
    expect(api.post).toHaveBeenCalledTimes(2);
    const newSocket = result.current.current;
    oldSocket?.onclose?.({code: 1000} as CloseEvent);
    expect(result.current.current).toBe(newSocket);
  });

  it('ignores a stale ticket response after a squad change', async () => {
    let resolveOld!: (value: {data: {ticket: string}}) => void;
    vi.mocked(api.post).mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce({data: {ticket: 'new-squad'}});
    const {rerender} = renderHook(({id}) => useSquadWebSocket(id), {
      initialProps: {id: 1}, wrapper,
    });
    rerender({id: 2});
    await waitFor(() => expect(globalThis.WebSocket).toHaveBeenCalledTimes(1));
    resolveOld({data: {ticket: 'old-squad'}});
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(globalThis.WebSocket).toHaveBeenCalledTimes(1);
    expect(globalThis.WebSocket).toHaveBeenCalledWith(
      expect.stringContaining('/api/squads/2/ws'), ['beercall', 'ticket.new-squad'],
    );
  });
});
