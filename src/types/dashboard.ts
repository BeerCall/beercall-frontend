import type { AvatarSprites } from './avatar';

export type { BeerCall, SquadDetails } from './api';

export interface Profile {
    username?: string;
    avatar?: Record<string, unknown>; // assuming it's a generic config object for AvatarCanvas
    /** B04 — sprites 2D de la tenue courante, si l'API les expose. */
    avatar_sprites?: AvatarSprites;
}
