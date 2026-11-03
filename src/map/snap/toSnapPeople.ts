import type {AvatarSprites} from '../../types/avatar';
import type {MemberLocation} from '../../types/api';
import type {SnapPerson} from './types';
import {formatAgo} from '../../utils/formatAgo';

/** B09b — identifiants serveur normalisés : `u_12`, `12` et 12 désignent le même membre. */
export function normalizePersonId(id: string | number | null | undefined): string {
    return String(id ?? '').trim().replace(/^u_/i, '');
}

export function initialOf(name: string | null | undefined): string {
    const first = (name ?? '').trim().charAt(0).toUpperCase();
    return first || '?';
}

/**
 * Clé d'image d'un corps : sprite publié (`body:<hash>`) ou initiale. Une
 * tenue pending/missing/failed/disabled ne bloque jamais le membre.
 */
export function bodyKeyFor(
    sprites: AvatarSprites | null | undefined,
    name: string | null | undefined,
): {key: string; url: string | null; hash: string | null} {
    const settled = Boolean(sprites)
        && sprites!.status !== 'pending'
        && sprites!.status !== 'missing'
        && sprites!.status !== 'failed'
        && sprites!.status !== 'disabled'
        && sprites!.pending !== true;
    if (settled && sprites?.body_url) {
        const hash = sprites.hash ?? sprites.body_url;
        return {key: `body:${hash}`, url: sprites.body_url, hash};
    }
    return {key: `initial:${initialOf(name)}`, url: null, hash: null};
}

export interface SnapSelfProfile {
    id?: string | number | null;
    username?: string | null;
    avatar_sprites?: AvatarSprites | null;
}

export interface SnapLocationState {
    userLocation: { lat: number; lng: number } | null;
    acquiredAt: number | null;
    hasSessionFix: boolean;
    locationStatus: string;
}

export interface ToSnapPeopleInput {
    members: readonly MemberLocation[];
    self?: SnapSelfProfile | null;
    selfLocation?: SnapLocationState | null;
    now?: number;
}

/**
 * Adapte les données serveur + soi en personnes Snap.
 *
 * - La position live n'est utilisée que si `hasSessionFix` et statut
 *   `available` ; sinon on garde la dernière position serveur de soi.
 * - Aucun soi n'est fabriqué depuis le cache localStorage : sans fix live ni
 *   ligne serveur, rien n'est ajouté.
 * - Un même hash de tenue partage la même image (`body:<hash>`).
 */
export function toSnapPeople(input: ToSnapPeopleInput): SnapPerson[] {
    const now = input.now ?? Date.now();
    const byId = new Map<string, SnapPerson>();

    for (const member of input.members) {
        const id = normalizePersonId(member.user_id);
        if (!id || byId.has(id)) continue;
        const body = bodyKeyFor(member.avatar_sprites, member.username);
        byId.set(id, {
            id,
            bodyKey: body.key,
            bodyUrl: body.url,
            hash: body.hash,
            name: member.username,
            since: member.located_at ? formatAgo(member.located_at, now) : 'date inconnue',
            coordinates: [member.longitude, member.latitude],
        });
    }

    const selfId = normalizePersonId(input.self?.id ?? input.self?.username);
    if (input.self && selfId) {
        const live = input.selfLocation;
        const canUseLive = Boolean(
            live
            && live.hasSessionFix
            && live.locationStatus === 'available'
            && live.userLocation
            && Number.isFinite(live.userLocation.lat)
            && Number.isFinite(live.userLocation.lng),
        );
        const server = byId.get(selfId);
        const body = input.self.avatar_sprites
            ? bodyKeyFor(input.self.avatar_sprites, input.self.username)
            : null;
        const coordinates: [number, number] | null = canUseLive && live?.userLocation
            ? [live.userLocation.lng, live.userLocation.lat]
            : server?.coordinates ?? null;

        // Ni fix live ni position serveur : ne jamais ressusciter le cache seul.
        if (coordinates) {
            byId.set(selfId, {
                id: selfId,
                bodyKey: body?.key ?? server?.bodyKey ?? `initial:${initialOf(input.self.username)}`,
                bodyUrl: body ? body.url : server?.bodyUrl ?? null,
                hash: body ? body.hash : server?.hash ?? null,
                name: input.self.username ?? server?.name ?? 'Moi',
                since: canUseLive ? 'maintenant' : server?.since ?? 'date inconnue',
                coordinates,
            });
        }
    }

    return [...byId.values()];
}
