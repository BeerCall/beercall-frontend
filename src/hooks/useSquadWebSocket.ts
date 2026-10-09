import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { isAxiosError } from 'axios';

export const useSquadWebSocket = (squadId?: number) => {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    mountedRef.current = true;
    let isConnecting = false;
    let cancelled = false;

    const connect = async () => {
      if (!squadId || !mountedRef.current || isConnecting) return;
      isConnecting = true;

      try {
        const { data } = await api.post(`/squads/${squadId}/ws-ticket`);
        
        if (cancelled || !mountedRef.current) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/squads/${squadId}/ws`;

        const ws = new WebSocket(wsUrl, ['beercall', `ticket.${data.ticket}`]);

        ws.onmessage = (event) => {
          if (cancelled) return;
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'REFRESH_SQUAD') {
              queryClient.invalidateQueries({ queryKey: ['squad', squadId.toString()] });
              queryClient.invalidateQueries({ queryKey: ['squad', squadId] });
            }
          } catch (e) {
            console.error('Invalid WS message', e);
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

    connect();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close(1000);
        wsRef.current = null;
      }
    };
  }, [squadId, queryClient]);

  return wsRef;
};
