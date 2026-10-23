import { act, renderHook, waitFor } from '@testing-library/react';
import { useBeerCallJob } from '../hooks/useBeerCallJob';
import { api } from '../lib/api';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn()
  }
}));

describe('useBeerCallJob', () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.resetAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });
  afterEach(() => vi.useRealTimers());

  it('should start with null status', () => {
    const { result } = renderHook(() => useBeerCallJob('squad1', null), { wrapper });
    expect(result.current.status).toBeNull();
  });

  it('fait un GET initial puis s’actualise sur invalidation cache (WS) sans polling', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { status: 'pending' } })
      .mockResolvedValueOnce({ data: { status: 'running' } })
      .mockResolvedValueOnce({ data: { status: 'succeeded' } });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useBeerCallJob('squad1', 'job1'), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('pending'));
    expect(api.get).toHaveBeenCalledTimes(1);

    // Simuler un événement WS BEER_CALL_JOB_UPDATED
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['beer-call-job', 'squad1', 'job1'] });
    });
    await waitFor(() => expect(result.current.status).toBe('running'));
    expect(api.get).toHaveBeenCalledTimes(2);

    // Simuler l'événement WS terminal SUCCEEDED
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['beer-call-job', 'squad1', 'job1'] });
    });
    await waitFor(() => expect(result.current.status).toBe('succeeded'));
    expect(api.get).toHaveBeenCalledTimes(3);

    // Vérifier l'invalidation de la squad après succès
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['squad', 'squad1'] });
  });

  it('ne fait aucun appel HTTP supplémentaire après 60 s sans événement (aucun polling)', async () => {
    vi.useFakeTimers();
    vi.mocked(api.get).mockResolvedValue({ data: { status: 'pending' } });

    const { result } = renderHook(() => useBeerCallJob('squad1', 'job-no-poll'), { wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(result.current.status).toBe('pending');
    expect(api.get).toHaveBeenCalledTimes(1);

    // Avancer de 60 secondes : aucun refetchInterval périodique
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('traite le statut rejeté et renseigne la raison', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { status: 'rejected', reject_reason: 'Pas de bière' }
    });

    const { result } = renderHook(() => useBeerCallJob('squad1', 'job2'), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('rejected'));
    expect(result.current.rejectReason).toBe('Pas de bière');
  });

  it('traite le statut failed sans le masquer', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { status: 'failed' }
    });

    const { result } = renderHook(() => useBeerCallJob('squad1', 'job-fail'), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('failed'));
    expect(result.current.trackingUnavailable).toBe(false);
  });

  it('keeps an unknown result distinct from terminal failure and recovers', async () => {
    vi.mocked(api.get)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue({ data: { status: 'succeeded' } });

    const { result } = renderHook(() => useBeerCallJob('squad1', 'recover'), { wrapper });
    await waitFor(() => expect(result.current.trackingUnavailable).toBe(true));
    expect(result.current.status).not.toBe('failed');

    // Réseau rétabli et invalidation déclenchée
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['beer-call-job', 'squad1', 'recover'] });
    });
    await waitFor(() => expect(result.current.status).toBe('succeeded'));
  });

  it('pauses at the deadline and resumes the same job', async () => {
    vi.useFakeTimers();
    vi.mocked(api.get).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useBeerCallJob('squad1', 'same-job', 1000), { wrapper });
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(result.current.trackingPaused).toBe(true);
    expect(result.current.status).not.toBe('failed');
    const calls = vi.mocked(api.get).mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(api.get).toHaveBeenCalledTimes(calls);
    vi.mocked(api.get).mockResolvedValue({ data: { status: 'succeeded' } });
    await act(async () => { result.current.resumeTracking(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(result.current.status).toBe('succeeded');
    expect(vi.mocked(api.get).mock.lastCall?.[0]).toContain('/same-job');
  });

  it('resumeTracking sur un job non pausé relance explicitement un GET sans timer périodique', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { status: 'pending' } })
      .mockResolvedValueOnce({ data: { status: 'running' } });

    const { result } = renderHook(() => useBeerCallJob('squad1', 'job-active'), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('pending'));
    expect(api.get).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.resumeTracking();
    });
    await waitFor(() => expect(result.current.status).toBe('running'));
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('rattrapage initial couvre un terminal reçu avant l’ouverture WS', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { status: 'succeeded' } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useBeerCallJob('squad1', 'job-fast'), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('succeeded'));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['squad', 'squad1'] });
  });
});
