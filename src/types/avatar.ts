export type AvatarPart = string | null;

export interface AvatarConfig {
    head?: AvatarPart;
    body?: AvatarPart;
    legs?: AvatarPart;
    feet?: AvatarPart;
    accessory?: AvatarPart;
    animation?: string | null;
    gender?: 'Men' | 'Women' | 'Unisex';
    [key: string]: unknown;
}

export interface AvatarTransform {
    position?: [number, number, number];
    scale?: [number, number, number];
    rotation?: [number, number, number];
}

/**
 * B04 — Sprites serveur d'une tenue. `status` est optionnel côté front pour
 * tolérer un ancien backend ; le backend A07 l'envoie toujours.
 */
export interface AvatarSprites {
    hash: string | null;
    head_url: string | null;
    portrait_url: string | null;
    body_url: string | null;
    pending: boolean;
    status?: 'missing' | 'pending' | 'ready' | 'failed' | 'disabled';
}
