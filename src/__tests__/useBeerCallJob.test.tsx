import { renderHook, waitFor } from '@testing-library/react';
import { useBeerCallJob } from '../hooks/useBeerCallJob';
import { api } from '../lib/api';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    vi.clearAllMocks();
  });

  it('should start with null status', () => {
    const { result } = renderHook(() => useBeerCallJob('squad1', null), { wrapper });
    expect(result.current.status).toBeNull();
  });

  it('should poll and update status', async () => {
    (api.get as any).mockResolvedValueOnce({ data: { status: 'pending' } })
                   .mockResolvedValueOnce({ data: { status: 'running' } })
                   .mockResolvedValueOnce({ data: { status: 'succeeded' } });

    const { result } = renderHook(() => useBeerCallJob('squad1', 'job1'), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('succeeded'), { timeout: 2000 });
  });

  it('should stop on rejection and set reason', async () => {
    (api.get as any).mockResolvedValueOnce({ data: { status: 'rejected', reject_reason: 'Pas de bière' } });

    const { result } = renderHook(() => useBeerCallJob('squad1', 'job2'), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('rejected'), { timeout: 2000 });
    expect(result.current.rejectReason).toBe('Pas de bière');
  });
});

