import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { isAxiosError } from 'axios';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROFILE_REFRESH_ACTIONS = ['CREATE', 'JOIN', 'START'];

export const useSquadWebSocket = (squadId?: number) => {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    mountedRef.current = true;
    let isConnecting = false;
    let cancelled = false;

    const resyncActiveQueries = () => {
      if (!squadId) return;
      const strSquadId = String(squadId);
      queryClient.invalidateQueries({ queryKey: ['squad', strSquadId], type: 'active' });
      queryClient.invalidateQueries({ queryKey: ['squad', squadId], type: 'active' });
      queryClient.invalidateQueries({ queryKey: ['worlds', strSquadId], type: 'active' });
      queryClient.invalidateQueries({ queryKey: ['beer-call-job', strSquadId], type: 'active' });
    };

    const connect = async () => {
      if (!squadId || !mountedRef.current || isConnecting) return;
      isConnecting = true;

      try {
        const { data } = await api.post(`/squads/${squadId}/ws-ticket`);

        if (cancelled || !mountedRef.current) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/squads/${squadId}/ws`;

        const ws = new WebSocket(wsUrl, ['beercall', `ticket.${data.ticket}`]);

        ws.onopen = () => {
          if (cancelled || !mountedRef.current) return;
          resyncActiveQueries();
        };

        ws.onmessage = (event) => {
          if (cancelled) return;
          try {
            const message = JSON.parse(event.data);
            if (!message || typeof message !== 'object') return;

            if (message.type === 'REFRESH_SQUAD') {
              const strSquadId = String(squadId);
              queryClient.invalidateQueries({ queryKey: ['squad', strSquadId] });
              queryClient.invalidateQueries({ queryKey: ['squad', squadId] });
              queryClient.invalidateQueries({ queryKey: ['worlds', strSquadId] });
              queryClient.invalidateQueries({ queryKey: ['squads'] });

              if (!message.action || PROFILE_REFRESH_ACTIONS.includes(message.action)) {
                queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
              }
            } else if (message.type === 'BEER_CALL_JOB_UPDATED') {
              if (typeof message.job_id === 'string' && UUID_REGEX.test(message.job_id)) {
                queryClient.invalidateQueries({
                  queryKey: ['beer-call-job', String(squadId), message.job_id],
                });
              }
            }
          } catch {
            // Ignorer les messages malformés
          }
        };

        ws.onclose = (e) => {
          if (wsRef.current === ws) wsRef.current = null;
          isConnecting = false;
          if (!cancelled && mountedRef.current && e.code !== 1000) {
            reconnectTimeoutRef.current = setTimeout(connect, 3000);
          }
        };

        ws.onerror = () => {
          // Error handled in onclose
        };

        wsRef.current = ws;
      } catch (e: unknown) {
        isConnecting = false;
        const status = isAxiosError(e) ? e.response?.status : undefined;
        // Ne pas boucler à l'infini si on n'est pas autorisé (401, 403) ou si la squad n'existe pas (404)
        if (status === 401 || status === 403 || status === 404) {
          return;
        }
        if (!cancelled && mountedRef.current) {
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
      }
      isConnecting = false;
    };

    const handleRevalidate = () => {
      if (!mountedRef.current || !squadId) return;
      resyncActiveQueries();
      if (!wsRef.current) {
        connect();
      }
    };

    const handleOnline = () => {
      handleRevalidate();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleRevalidate();
      }
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    connect();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close(1000);
        wsRef.current = null;
      }
    };
  }, [squadId, queryClient]);

  return wsRef;
};
