import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

import type { Squad } from '../types/api';
export type { Squad } from '../types/api';

export function useSquads() {
    return useQuery({
        queryKey: ['squads'],
        queryFn: async () => {
            // Appelle ton endpoint FastAPI : GET /squads
            const response = await api.get<Squad[]>('/squads/');
            return response.data;
        },
    });
}
