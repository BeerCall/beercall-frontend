import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useQueryClient } from '@tanstack/react-query';

export function useBeerCallJob(squadId: string, jobId: string | null) {
  const [status, setStatus] = useState<'uploading' | 'pending' | 'running' | 'succeeded' | 'rejected' | 'failed' | null>(null);
  const [rejectReason, setRejectReason] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!jobId || !squadId) {
      setStatus(null);
      setRejectReason(null);
      return;
    }

    let intervalId: number;

    const pollJob = async () => {
      try {
        const response = await api.get(`/squads/${squadId}/beer-calls/jobs/${jobId}`);
        const jobStatus = response.data.status;
        setStatus(jobStatus);

        if (jobStatus === 'rejected') {
          setRejectReason(response.data.reject_reason || "Rejeté.");
        }

        if (jobStatus === 'succeeded' || jobStatus === 'rejected' || jobStatus === 'failed') {
          clearInterval(intervalId);
          if (jobStatus === 'succeeded') {
            queryClient.invalidateQueries({ queryKey: ['squad', squadId] });
          }
        }
      } catch (error) {
        console.error("Erreur polling job:", error);
        clearInterval(intervalId);
        setStatus('failed');
      }
    };

    pollJob();
    intervalId = window.setInterval(pollJob, process.env.NODE_ENV === 'test' ? 50 : 2000);

    return () => {
      clearInterval(intervalId);
    };
  }, [jobId, squadId, queryClient]);

  return { status, rejectReason };
}
