export type { BeerCall, SquadDetails } from './api';

export interface Profile {
    username?: string;
    avatar?: Record<string, unknown>; // assuming it's a generic config object for AvatarCanvas
}
