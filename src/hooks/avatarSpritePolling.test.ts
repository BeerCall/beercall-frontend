import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
    createSpritePollingPolicy,
    extractSprites,
    isPendingSprite,
    spriteSignature,
    type SpriteQueryLike,
    type SpriteView,
} from './avatarSpritePolling';
import { useDocumentVisible } from './useDocumentVisible';

const profileQuery = (sprites: SpriteView): SpriteQueryLike => ({
    state: { data: { avatar_sprites: sprites } },
});

const arrayQuery = (sprites: Array<SpriteView | undefined>): SpriteQueryLike => ({
    state: { data: sprites.map((s) => ({ avatar_sprites: s })) },
});

const pending = (over: Partial<SpriteView> = {}): SpriteView => ({
    hash: 'abc',
    pending: true,
    status: 'pending',
    head_url: null,
    portrait_url: null,
    body_url: null,
    ...over,
});

describe('isPendingSprite', () => {
    it('reconnait pending via status ou booleen', () => {
        expect(isPendingSprite({ status: 'pending' })).toBe(true);
        expect(isPendingSprite({ pending: true })).toBe(true);
        expect(isPendingSprite({ status: 'ready' })).toBe(false);
        expect(isPendingSprite({ status: 'failed' })).toBe(false);
        expect(isPendingSprite({ status: 'disabled' })).toBe(false);
        expect(isPendingSprite(undefined)).toBe(false);
    });
});

describe('extractSprites', () => {
    it('gere profil, liste et absence', () => {
        expect(extractSprites({ avatar_sprites: { hash: 'a' } })).toEqual([{ hash: 'a' }]);
        expect(extractSprites([{ avatar_sprites: { hash: 'a' } }, {}])).toEqual([{ hash: 'a' }]);
        expect(extractSprites(undefined)).toEqual([]);
        expect(extractSprites({})).toEqual([]);
    });
});

describe('spriteSignature', () => {
    it('ignore les champs non pertinents et suit le hash', () => {
        expect(spriteSignature([{ hash: 'h', status: 'pending' }])).toBe(
            spriteSignature([{ hash: 'h', status: 'pending' }]),
        );
        expect(spriteSignature([{ hash: 'h', status: 'pending' }])).not.toBe(
            spriteSignature([{ hash: 'other', status: 'pending' }]),
        );
    });
});

describe('createSpritePollingPolicy', () => {
    it('ne poll pas sans tenue pending', () => {
        const policy = createSpritePollingPolicy({ now: () => 0 });
        expect(policy(profileQuery({ hash: 'a', status: 'ready', pending: false }))).toBe(false);
        expect(policy(arrayQuery([{ hash: 'a', status: 'failed' }]))).toBe(false);
        expect(policy(profileQuery(undefined as unknown as SpriteView))).toBe(false);
    });

    it('accelere pendant 30 s puis ralentit, et s arrete apres 5 min', () => {
        let clock = 1_000;
        const policy = createSpritePollingPolicy({ now: () => clock });
        const query = profileQuery(pending());

        expect(policy(query)).toBe(2000);
        clock += 29_000;
        expect(policy(query)).toBe(2000);
        clock += 2_000; // elapsed 31 s
        expect(policy(query)).toBe(10_000);
        clock += 268_000; // elapsed 299 s
        expect(policy(query)).toBe(10_000);
        clock += 2_000; // elapsed 301 s > 300 s
        expect(policy(query)).toBe(false);
    });

    it('ouvre sa propre fenetre pour une nouvelle tenue', () => {
        let clock = 5_000;
        const policy = createSpritePollingPolicy({ now: () => clock });
        expect(policy(profileQuery(pending({ hash: 'a' })))).toBe(2000);
        clock += 120_000;
        expect(policy(profileQuery(pending({ hash: 'a' })))).toBe(10_000);
        // Nouvelle tenue : la fenetre repart au debut.
        expect(policy(profileQuery(pending({ hash: 'b' })))).toBe(2000);
    });

    it('ne poll pas quand la surface est masquee ou desactivee', () => {
        let active = false;
        const policy = createSpritePollingPolicy({ now: () => 0, isActive: () => active });
        expect(policy(profileQuery(pending()))).toBe(false);
        active = true;
        expect(policy(profileQuery(pending()))).toBe(2000);
    });

    it('oublie la fenetre quand la tenue redevient non pending', () => {
        let clock = 0;
        const policy = createSpritePollingPolicy({ now: () => clock });
        expect(policy(profileQuery(pending()))).toBe(2000);
        clock += 100_000;
        expect(policy(profileQuery({ hash: 'abc', status: 'ready', pending: false }))).toBe(false);
        // Retour a pending apres une reponse : nouvelle fenetre rapide.
        expect(policy(profileQuery(pending()))).toBe(2000);
    });
});

describe('useDocumentVisible', () => {
    afterEach(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    });

    it('suit visibilitychange via un abonnement', () => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
        const { result } = renderHook(() => useDocumentVisible());
        expect(result.current).toBe(true);

        act(() => {
            Object.defineProperty(document, 'hidden', { configurable: true, value: true });
            document.dispatchEvent(new Event('visibilitychange'));
        });
        expect(result.current).toBe(false);

        act(() => {
            Object.defineProperty(document, 'hidden', { configurable: true, value: false });
            document.dispatchEvent(new Event('visibilitychange'));
        });
        expect(result.current).toBe(true);
    });
});
