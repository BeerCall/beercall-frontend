import { describe, it, expect } from 'vitest';
import { bodyKeyFor, normalizePersonId, toSnapPeople } from './toSnapPeople';
import type { MemberLocation } from '../../types/api';
import type { AvatarSprites } from '../../types/avatar';

const sprites = (over: Partial<AvatarSprites> = {}): AvatarSprites => ({
    hash: 'h1',
    head_url: '/head.webp',
    portrait_url: '/portrait.webp',
    body_url: '/body.webp',
    pending: false,
    status: 'ready',
    ...over,
});

const member = (over: Partial<MemberLocation> = {}): MemberLocation => ({
    user_id: 1,
    username: 'Alice',
    latitude: 48.85,
    longitude: 2.35,
    located_at: '2026-11-01T10:00:00Z',
    avatar_sprites: sprites(),
    ...over,
});

const now = new Date('2026-11-01T10:02:00Z').getTime();

describe('normalizePersonId / bodyKeyFor', () => {
    it('normalise u_12 et 12 vers le même identifiant', () => {
        expect(normalizePersonId('u_12')).toBe('12');
        expect(normalizePersonId(12)).toBe('12');
        expect(normalizePersonId(' 12 ')).toBe('12');
    });

    it('publie body:<hash> seulement pour un sprite prêt', () => {
        expect(bodyKeyFor(sprites({ hash: 'abc' }), 'Alice').key).toBe('body:abc');
        expect(bodyKeyFor(sprites({ hash: 'abc', status: 'pending' }), 'Alice').key).toBe('initial:A');
        expect(bodyKeyFor(sprites({ hash: 'abc', status: 'missing' }), 'Alice').key).toBe('initial:A');
        expect(bodyKeyFor(sprites({ hash: 'abc', status: 'failed' }), 'Alice').key).toBe('initial:A');
    });

    it('utilise ? pour un nom vide', () => {
        expect(bodyKeyFor(null, '').key).toBe('initial:?');
    });
});

describe('toSnapPeople', () => {
    it('ne duplique pas u_12 et 12', () => {
        const people = toSnapPeople({
            members: [member({ user_id: 12 }), member({ user_id: 'u_12', username: 'Doublon' })],
            now,
        });
        expect(people).toHaveLength(1);
        expect(people[0].id).toBe('12');
        expect(people[0].name).toBe('Alice');
    });

    it('sans squad ni soi, ne renvoie personne', () => {
        expect(toSnapPeople({ members: [], now })).toEqual([]);
    });

    it('partage l’image pour un même hash de tenue', () => {
        const people = toSnapPeople({
            members: [
                member({ user_id: 1, avatar_sprites: sprites({ hash: 'same' }) }),
                member({ user_id: 2, avatar_sprites: sprites({ hash: 'same' }) }),
            ],
            now,
        });
        expect(people[0].bodyKey).toBe('body:same');
        expect(people[1].bodyKey).toBe('body:same');
    });

    it('utilise la position live de soi et le libellé maintenant', () => {
        const people = toSnapPeople({
            members: [],
            self: { id: 7, username: 'Moi', avatar_sprites: sprites({ hash: 'me' }) },
            selfLocation: {
                userLocation: { lat: 48.9, lng: 2.4 }, acquiredAt: now,
                hasSessionFix: true, locationStatus: 'available',
            },
            now,
        });
        expect(people).toHaveLength(1);
        expect(people[0].coordinates).toEqual([2.4, 48.9]);
        expect(people[0].since).toBe('maintenant');
    });

    it('sans fix live, garde la dernière position serveur de soi', () => {
        const people = toSnapPeople({
            members: [member({ user_id: 7, username: 'Moi', latitude: 48.7, longitude: 2.2 })],
            self: { id: 7, username: 'Moi' },
            selfLocation: {
                userLocation: { lat: 48.9, lng: 2.4 }, acquiredAt: now,
                hasSessionFix: false, locationStatus: 'idle',
            },
            now,
        });
        expect(people).toHaveLength(1);
        expect(people[0].coordinates).toEqual([2.2, 48.7]);
        expect(people[0].since).not.toBe('maintenant');
    });

    it('ne ressuscite jamais un soi depuis le cache seul', () => {
        const people = toSnapPeople({
            members: [],
            self: { id: 7, username: 'Moi' },
            selfLocation: {
                userLocation: { lat: 48.9, lng: 2.4 }, acquiredAt: now,
                hasSessionFix: false, locationStatus: 'idle',
            },
            now,
        });
        expect(people).toEqual([]);
    });

    it('conserve un membre dont la tenue est pending en initiale', () => {
        const people = toSnapPeople({
            members: [member({ avatar_sprites: sprites({ status: 'pending', pending: true }) })],
            now,
        });
        expect(people[0].bodyKey).toBe('initial:A');
        expect(people[0].bodyUrl).toBeNull();
    });
});
