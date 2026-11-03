import { describe, it, expect, vi } from 'vitest';
import {
    SnapIconRegistry,
    type SnapIconAdapters,
    type SnapImageMap,
} from './avatarIcons';
import type { SnapPerson } from './types';

function fakeMap(): SnapImageMap & { images: Map<string, unknown>; adds: Array<{ id: string; pixelRatio?: number }> } {
    const images = new Map<string, unknown>();
    const adds: Array<{ id: string; pixelRatio?: number }> = [];
    return {
        images,
        adds,
        hasImage: (id) => images.has(id),
        addImage: (id, image, options) => {
            images.set(id, image);
            adds.push({ id, pixelRatio: options?.pixelRatio });
        },
        removeImage: (id) => { images.delete(id); },
    };
}

const image = () => ({}) as ImageData;
const bitmap = () => ({ close: vi.fn() }) as unknown as ImageBitmap;

function adapters(over: Partial<SnapIconAdapters> = {}): SnapIconAdapters {
    return {
        loadBody: vi.fn(async () => bitmap()),
        makeInitial: vi.fn(() => image()),
        makeBase: vi.fn(() => image()),
        makePill: vi.fn(() => image()),
        close: vi.fn(),
        ...over,
    };
}

const person = (over: Partial<SnapPerson> = {}): SnapPerson => ({
    id: '1',
    bodyKey: 'body:h',
    bodyUrl: '/body.webp',
    hash: 'h',
    name: 'Alice',
    since: 'maintenant',
    coordinates: [2, 48],
    ...over,
});

describe('SnapIconRegistry', () => {
    it('ne charge qu’une fois un corps partagé par plusieurs membres', async () => {
        const map = fakeMap();
        const a = adapters();
        const registry = new SnapIconRegistry(map, a);
        await registry.ensure([
            person({ id: '1' }),
            person({ id: '2' }),
            person({ id: '3' }),
        ], ['Alice · maintenant']);
        expect(a.loadBody).toHaveBeenCalledTimes(1);
        expect(map.images.has('body:h')).toBe(true);
        expect(map.images.has('avatar-base')).toBe(true);
        expect(map.adds.find((entry) => entry.id === 'avatar-base')?.pixelRatio).toBe(2);
    });

    it('inscrit une initiale sans requête quand le corps manque', async () => {
        const map = fakeMap();
        const a = adapters();
        const registry = new SnapIconRegistry(map, a);
        await registry.ensure([person({ bodyKey: 'initial:A', bodyUrl: null })]);
        expect(a.loadBody).not.toHaveBeenCalled();
        expect(a.makeInitial).toHaveBeenCalledWith('A');
        expect(map.images.has('initial:A')).toBe(true);
    });

    it('une erreur de sprite produit une initiale, pas une disparition', async () => {
        const map = fakeMap();
        const a = adapters({ loadBody: vi.fn(async () => { throw new Error('404'); }) });
        const registry = new SnapIconRegistry(map, a);
        await registry.ensure([person()]);
        expect(map.images.has('body:h')).toBe(true);
        expect(a.makeInitial).toHaveBeenCalled();
    });

    it('ignore un chargement devenu obsolète après changement de style', async () => {
        const map = fakeMap();
        let resolve!: (value: ImageBitmap) => void;
        const stale = bitmap();
        const a = adapters({ loadBody: vi.fn(() => new Promise<ImageBitmap>((done) => { resolve = done; })) });
        const registry = new SnapIconRegistry(map, a);

        const job = registry.ensure([person()]);
        registry.invalidate();
        resolve(stale);
        await job;

        expect(map.images.has('body:h')).toBe(false);
        expect(a.close).toHaveBeenCalledWith(stale);
    });

    it('réinscrit les images après un rechargement de style', async () => {
        const map = fakeMap();
        const a = adapters();
        const registry = new SnapIconRegistry(map, a);
        await registry.ensure([person()]);
        map.removeImage?.('body:h');
        registry.invalidate();
        await registry.ensure([person()]);
        expect(a.loadBody).toHaveBeenCalledTimes(2);
        expect(map.images.has('body:h')).toBe(true);
    });

    it('prune retire les anciennes images seulement après mise à jour', async () => {
        const map = fakeMap();
        const registry = new SnapIconRegistry(map, adapters());
        await registry.ensure([person({ bodyKey: 'body:old', hash: 'old' })]);
        expect(map.images.has('body:old')).toBe(true);

        await registry.ensure([person({ bodyKey: 'body:new', hash: 'new', bodyUrl: '/new.webp' })]);
        // Toujours présente tant que prune n'est pas appelé.
        expect(map.images.has('body:old')).toBe(true);
        registry.prune();
        expect(map.images.has('body:old')).toBe(false);
        expect(map.images.has('body:new')).toBe(true);
        expect(map.images.has('avatar-base')).toBe(true);
    });

    it('dispose empêche toute nouvelle inscription', async () => {
        const map = fakeMap();
        const registry = new SnapIconRegistry(map, adapters());
        registry.dispose();
        await registry.ensure([person()]);
        expect(map.images.size).toBe(0);
    });
});
