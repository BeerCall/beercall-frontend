import {queryOptions, useQuery} from '@tanstack/react-query';
import {api} from '../lib/api';

export interface Connection {
    id: string;
    username: string;
    caps: number;
    score: number;
    title: string;
    avatar: {head: string; body: string; legs: string; feet: string; accessory: string; gender: 'Men' | 'Women'};
}

export function connectionsQueryOptions() {
    return queryOptions({queryKey: ['connections'], queryFn: async () => {
        const response = await api.get<Connection[]>('/auth/connections/');
        return response.data;
    }});
}

export function useConnections(enabled = true) { return useQuery({...connectionsQueryOptions(), enabled}); }
