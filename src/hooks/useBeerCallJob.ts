import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

import type { BeerCallJobStatus, BeerCallJobResult } from '../types/api';
const terminal = (status?: BeerCallJobStatus | null) =>
  status === 'succeeded' || status === 'rejected' || status === 'failed';

export function useBeerCallJob(squadId: string, jobId: string | null, trackingTimeoutMs = 20 * 60 * 1000) {
  const queryClient = useQueryClient();
  const [pausedJob, setPausedJob] = useState<string | null>(null);
  const [resumeCount, setResumeCount] = useState(0);
  const trackingPaused = jobId !== null && pausedJob === jobId;
  const query = useQuery({
    queryKey: ['beer-call-job', squadId, jobId],
    enabled: Boolean(jobId && squadId) && !trackingPaused,
    queryFn: async ({ signal }) => {
      const response = await api.get<BeerCallJobResult>(
        `/squads/${squadId}/beer-calls/jobs/${jobId}`, { signal, timeout: 10000 }
      );
      return response.data;
    },
    retry: false,
    refetchInterval: (current) => terminal(current.state.data?.status) ? false :
      (import.meta.env.MODE === 'test' ? 50 : 2000),
  });
  const status = jobId ? query.data?.status ?? null : null;
  const isTerminal = terminal(status);

  useEffect(() => {
    if (!jobId || isTerminal || trackingPaused) return;
    const timer = window.setTimeout(() => setPausedJob(jobId), trackingTimeoutMs);
    return () => window.clearTimeout(timer);
  }, [jobId, isTerminal, trackingPaused, resumeCount, trackingTimeoutMs]);

  useEffect(() => {
    if (status === 'succeeded') {
      void queryClient.invalidateQueries({ queryKey: ['squad', squadId] });
    }
  }, [status, squadId, queryClient]);

  return {
    status,
    rejectReason: query.data?.reject_reason ?? null,
    trackingUnavailable: Boolean(jobId) && (query.isError || trackingPaused),
    trackingPaused,
    resumeTracking: () => { setPausedJob(null); setResumeCount((count) => count + 1); },
  };
}
