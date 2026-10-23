import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

import type { SquadDetails } from '../types/api';
export type { AperoStatus, BeerCall, SquadDetails } from '../types/api';

export function useSquadDetails(id: string | undefined) {
    const queryClient = useQueryClient();
    const query = useQuery({
        queryKey: ['squad', id],
        queryFn: async () => {
            if (!id) return null;
            const response = await api.get<SquadDetails>(`/squads/${id}`);
            return response.data;
        },
        enabled: !!id,
    });

    useEffect(() => {
        if (!id || !query.data?.active_beer_call?.length) {
            return;
        }

        const endedAtTimestamps = query.data.active_beer_call
            .map((call) => (call.ended_at ? new Date(call.ended_at).getTime() : NaN))
            .filter((t) => !isNaN(t));

        if (!endedAtTimestamps.length) {
            return;
        }

        const minEndedAt = Math.min(...endedAtTimestamps);
        const delay = Math.max(0, minEndedAt - Date.now());

        const timer = setTimeout(() => {
            void queryClient.invalidateQueries({ queryKey: ['squad', id] });
        }, delay);

        return () => {
            clearTimeout(timer);
        };
    }, [id, query.data, queryClient]);

    return query;
}
