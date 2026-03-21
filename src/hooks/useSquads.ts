import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface Squad {
    id: string;
    name: string;
    icon?: string;
    color?: string;
    inviteCode?: string;
}

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