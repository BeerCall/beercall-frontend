import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

export const useSquadWebSocket = (squadId?: number) => {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    mountedRef.current = true;
    let isConnecting = false;

    const connect = async () => {
      if (!squadId || !mountedRef.current || isConnecting) return;
      isConnecting = true;

      try {
        const { data } = await axios.post(`/api/squads/${squadId}/ws-ticket`);
        
        if (!mountedRef.current) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/squads/${squadId}/ws`;

        const ws = new WebSocket(wsUrl, ['beercall', `ticket.${data.ticket}`]);

        ws.onmessage = (event) => {
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
          wsRef.current = null;
          isConnecting = false;
          if (mountedRef.current && e.code !== 1000) {
            reconnectTimeoutRef.current = setTimeout(connect, 3000);
          }
        };

        ws.onerror = () => {
          // Error handled in onclose
        };

        wsRef.current = ws;
      } catch (e) {
        isConnecting = false;
        if (mountedRef.current) {
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
      }
      isConnecting = false;
    };

    connect();

    return () => {
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
