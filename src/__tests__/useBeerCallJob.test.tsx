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
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.resetAllMocks();
    queryClient.clear();
  });
  afterEach(() => vi.useRealTimers());

  it('should start with null status', () => {
    const { result } = renderHook(() => useBeerCallJob('squad1', null), { wrapper });
    expect(result.current.status).toBeNull();
  });

  it('should poll and update status', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { status: 'pending' } })
                   .mockResolvedValueOnce({ data: { status: 'running' } })
                   .mockResolvedValueOnce({ data: { status: 'succeeded' } });

    const { result } = renderHook(() => useBeerCallJob('squad1', 'job1'), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('succeeded'), { timeout: 2000 });
  });

  it('should stop on rejection and set reason', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { status: 'rejected', reject_reason: 'Pas de bière' } });

    const { result } = renderHook(() => useBeerCallJob('squad1', 'job2'), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('rejected'), { timeout: 2000 });
    expect(result.current.rejectReason).toBe('Pas de bière');
  });

  it('keeps an unknown result distinct from terminal failure and recovers', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue({ data: { status: 'succeeded' } });
    const { result } = renderHook(() => useBeerCallJob('squad1', 'recover'), { wrapper });
    await waitFor(() => expect(result.current.trackingUnavailable).toBe(true));
    expect(result.current.status).not.toBe('failed');
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
});
