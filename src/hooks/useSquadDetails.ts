import {useQuery} from '@tanstack/react-query';
import {api} from '../lib/api';

import type {SquadDetails} from '../types/api';
export type {AperoStatus, BeerCall, SquadDetails} from '../types/api';

export function useSquadDetails(id: string | undefined) {
    return useQuery({
        queryKey: ['squad', id],
        queryFn: async () => {
            if (!id) return null;
            const response = await api.get<SquadDetails>(`/squads/${id}`);
            return response.data;
        },
        enabled: !!id,
        refetchInterval: 10000,
    });
}
