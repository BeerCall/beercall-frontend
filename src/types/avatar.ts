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
