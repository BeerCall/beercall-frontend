/**
 * B02 — Politique de polling des sprites d'avatar.
 *
 * Compatible `refetchInterval` React Query v5 : la fonction reçoit l'objet
 * `Query` (pas directement les données). Elle ne boucle que tant qu'une tenue
 * est `pending` et dans une fenêtre bornée par signature, sans compteur remis à
 * zéro à chaque `dataUpdatedAt`.
 */
import type { Query } from '@tanstack/react-query';

export interface SpriteView {
    hash?: string | null;
    head_url?: string | null;
    portrait_url?: string | null;
    body_url?: string | null;
    pending?: boolean;
    status?: string | null;
}

export type SpriteQueryLike = { state: { data: unknown } };

const FAST_MS = 2_000;
const SLOW_MS = 10_000;
const FAST_WINDOW_MS = 30_000;
const WINDOW_MS = 300_000;

export function isPendingSprite(sprite: SpriteView | null | undefined): boolean {
    if (!sprite) return false;
    if (sprite.status === 'pending') return true;
    if (sprite.status === 'failed' || sprite.status === 'disabled') return false;
    return sprite.pending === true;
}

/** Signature stable des tenues pending : IDs et champs visuels, jamais l'animation. */
export function spriteSignature(sprites: SpriteView[]): string {
    return sprites
        .map((sprite) => [
            sprite.hash ?? '',
            sprite.status ?? '',
            sprite.head_url ?? '',
            sprite.portrait_url ?? '',
            sprite.body_url ?? '',
        ].join('~'))
        .join('|');
}

/** Extrait les sprites d'une donnée de profil, de liste de connexions ou d'un tableau. */
export function extractSprites(data: unknown): SpriteView[] {
    if (Array.isArray(data)) {
        return data
            .map((entry) => (entry as { avatar_sprites?: SpriteView } | null | undefined)?.avatar_sprites)
            .filter((sprite): sprite is SpriteView => Boolean(sprite));
    }
    if (data && typeof data === 'object' && 'avatar_sprites' in data) {
        const sprite = (data as { avatar_sprites?: SpriteView }).avatar_sprites;
        return sprite ? [sprite] : [];
    }
    return [];
}

export interface SpritePollingOptions {
    windowMs?: number;
    fastMs?: number;
    slowMs?: number;
    fastWindowMs?: number;
    now?: () => number;
    /** `false` quand la surface est masquée ou désactivée. */
    isActive?: () => boolean;
}

export type SpritePollingPolicy = (query: SpriteQueryLike) => number | false;

export function createSpritePollingPolicy(options: SpritePollingOptions = {}): SpritePollingPolicy {
    const windowMs = options.windowMs ?? WINDOW_MS;
    const fastMs = options.fastMs ?? FAST_MS;
    const slowMs = options.slowMs ?? SLOW_MS;
    const fastWindowMs = options.fastWindowMs ?? FAST_WINDOW_MS;
    const now = options.now ?? (() => Date.now());
    const isActive = options.isActive ?? (() => true);

    let signature = '';
    let startedAt = 0;
    let started = false;

    return (query: SpriteQueryLike): number | false => {
        if (!isActive()) return false;
        const sprites = extractSprites(query.state.data);
        const pending = sprites.filter(isPendingSprite);
        if (pending.length === 0) {
            // Plus rien à suivre : oublier la fenêtre pour qu'un prochain
            // passage à `pending` reparte sur une fenêtre fraîche.
            signature = '';
            started = false;
            return false;
        }

        const current = spriteSignature(pending);
        const t = now();
        if (!started || current !== signature) {
            signature = current;
            startedAt = t;
            started = true;
        }
        const elapsed = t - startedAt;
        if (elapsed > windowMs) return false;
        return elapsed < fastWindowMs ? fastMs : slowMs;
    };
}

export type KnownQuery = Query<unknown, unknown, unknown, readonly unknown[]>;
