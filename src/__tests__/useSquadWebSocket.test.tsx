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

  it('invalidates queries on REFRESH_SQUAD message', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { ticket: '123' } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    
    const { result } = renderHook(() => useSquadWebSocket(10), { wrapper });
    
    await waitFor(() => expect(result.current.current).not.toBeNull());
    
    const wsInstance = result.current.current;
    
    // Simulate incoming message
    if (wsInstance?.onmessage) {
      wsInstance.onmessage({ data: JSON.stringify({ type: 'REFRESH_SQUAD' }) } as MessageEvent);
    }
    
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['squad', '10'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['squad', 10] });
  });

  it('attempts to reconnect on abnormal closure', async () => {
    vi.useFakeTimers();
    vi.mocked(api.post)
      .mockResolvedValueOnce({ data: { ticket: 'tick1' } })
      .mockResolvedValueOnce({ data: { ticket: 'tick2' } });

    const { result } = renderHook(() => useSquadWebSocket(5), { wrapper });
    
    // allow initial promise to resolve
    await vi.runAllTimersAsync();
    
    expect(api.post).toHaveBeenCalledTimes(1);
    
    const wsInstance = result.current.current;
    if (wsInstance?.onclose) {
      wsInstance.onclose({ code: 1006 } as CloseEvent);
    }
    
    // advance timer for reconnect
    await vi.runAllTimersAsync();
    
    expect(api.post).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('does not reconnect on 401 Unauthorized', async () => {
    vi.useFakeTimers();
    vi.mocked(api.post).mockRejectedValueOnce({ isAxiosError: true, response: { status: 401 } });
    
    renderHook(() => useSquadWebSocket(401), { wrapper });
    
    await vi.runAllTimersAsync();
    
    expect(api.post).toHaveBeenCalledTimes(1);
    
    await vi.runAllTimersAsync();
    expect(api.post).toHaveBeenCalledTimes(1);
    
    vi.useRealTimers();
  });

  it('cleans up on unmount', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { ticket: 'xyz' } });
    const { result, unmount } = renderHook(() => useSquadWebSocket(8), { wrapper });
    
    await waitFor(() => expect(result.current.current).not.toBeNull());
    const wsInstance = result.current.current;
    
    unmount();
    
    expect(wsInstance?.close).toHaveBeenCalledWith(1000);
    expect(result.current.current).toBeNull();
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
