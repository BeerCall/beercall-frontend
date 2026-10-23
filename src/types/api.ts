import type { AvatarConfig } from './avatar';

export type AperoStatus = 'scheduled' | 'active' | 'ended' | 'cancelled';

export interface WorldParticipant {
    user_id?: string;
    id?: string;
    username: string;
    avatar_config?: AvatarConfig;
    avatar?: AvatarConfig;
    proof_photo_url?: string | null;
    joined_at?: string | null;
    excuse?: string | null;
    declined_at?: string | null;
}

export interface WorldDetails {
    name: string;
    theme_color: string;
    participants: WorldParticipant[];
}

export interface WorldsResponse {
    worlds: Record<string, WorldDetails>;
}

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

export interface Squad {
    id: number;
    name: string;
    icon: string;
    color: string;
    invite_code: string | null;
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

export type BeerCallJobStatus = 'pending' | 'running' | 'succeeded' | 'rejected' | 'failed';

export interface BeerCallJobResult {
    id: string;
    status: BeerCallJobStatus;
    reject_reason?: string | null;
}
