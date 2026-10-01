export interface BeerCall {
    id: string;
    longitude: number;
    latitude: number;
    has_responded?: boolean;
    started_at?: string;
    scheduled_for?: string;
    location_name?: string;
    participants_count?: number;
    // Any other fields that might be used
}

export interface SquadDetails {
    name?: string;
    color?: string;
    invite_code?: string;
    active_beer_call?: BeerCall[];
    scheduled_beer_calls?: BeerCall[];
    past_beer_calls?: BeerCall[];
}

export interface Profile {
    username?: string;
    avatar?: Record<string, unknown>; // assuming it's a generic config object for AvatarCanvas
}
