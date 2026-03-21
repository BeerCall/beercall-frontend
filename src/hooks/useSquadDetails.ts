import {useQuery} from '@tanstack/react-query';
import {api} from '../lib/api';

export interface BeerCall {
    id: string;
    creator_name: string;
    location_name: string;
    longitude: number;
    latitude: number;
    started_at: string;
    participants_count: number;
    // 👇 LES NOUVEAUX CHAMPS DE TON BACKEND
    has_responded: boolean;
    user_status: string;
}

export interface SquadDetails {
    id: string;
    name: string;
    color: string;
    icon: string;
    invite_code: string;
    active_beer_call: BeerCall | null;
    past_beer_calls: BeerCall[];
}

export function useSquadDetails(id: string | undefined) {
    return useQuery({
        queryKey: ['squad', id],
        queryFn: async () => {
            if (!id) return null;
            const response = await api.get<SquadDetails>(`/squads/${id}`);
            return response.data;
        },
        enabled: !!id,
    });
}