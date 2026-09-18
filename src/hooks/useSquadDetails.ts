import {useQuery} from '@tanstack/react-query';
import {api} from '../lib/api';

export type AperoStatus = 'scheduled' | 'active' | 'ended' | 'cancelled';

export interface BeerCall {
    id: string;
    creator_name: string;
    creator_id: number;
    location_name: string;
    longitude: number;
    latitude: number;
    status: AperoStatus;
    scheduled_for?: string;
    started_at?: string;
    ended_at?: string;
    participants_count: number;
    has_responded: boolean;
    user_status?: string | null;
    can_start: boolean;
}

export interface SquadDetails {
    id: string;
    name: string;
    color: string;
    icon: string;
    invite_code: string;
    active_beer_call: BeerCall[];
    scheduled_beer_calls: BeerCall[];
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
        refetchInterval: 10000,
    });
}
