import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { SnapPerson } from '../../map/snap/types';
import type { SnapAvatarLayerProps } from './SnapAvatarLayer';
import { UpdatePump } from '../../map/snap/updatePump';

const registryMock = vi.hoisted(() => ({
    ensure: vi.fn(async () => {}),
    prune: vi.fn(),
    invalidate: vi.fn(),
    dispose: vi.fn(),
}));

vi.mock('../../map/snap/avatarIcons', () => ({
    SnapIconRegistry: class {
        ensure = registryMock.ensure;
        prune = registryMock.prune;
        invalidate = registryMock.invalidate;
        dispose = registryMock.dispose;
    },
}));

const control = vi.hoisted(() => ({
    map: null as unknown,
    source: { setData: vi.fn() },
}));

vi.mock('react-map-gl/maplibre', async () => {
    const react = await import('react');
    return {
        Source: ({ children }: { children: React.ReactNode }) =>
            react.createElement('div', { 'data-testid': 'snap-source' }, children),
        Layer: ({ id }: { id: string }) => react.createElement('div', { 'data-layer': id }),
        useMap: () => ({ current: { getMap: () => control.map } }),
    };
});

interface FakeMap {
    images: Map<string, unknown>;
    hasImage: (id: string) => boolean;
    addImage: (id: string, image: unknown) => void;
    removeImage: (id: string) => void;
    getSource: (id: string) => { setData: (data: unknown, options?: boolean) => void };
    on: (event: string, layerOrHandler: unknown, handler?: unknown) => void;
    off: (event: string, layerOrHandler: unknown, handler?: unknown) => void;
    getZoom: () => number;
    easeTo: ReturnType<typeof vi.fn>;
    emit: (event: string, layer: string | null, payload: unknown) => void;
}

function createMap(): FakeMap {
    const listeners = new Map<string, Set<(payload: unknown) => void>>();
    const keyOf = (event: string, layer: string | null) => `${event}:${layer ?? ''}`;
    const map: FakeMap = {
        images: new Map(),
        hasImage: (id) => map.images.has(id),
        addImage: (id, image) => { map.images.set(id, image); },
        removeImage: (id) => { map.images.delete(id); },
        getSource: () => control.source,
        on: (event, layerOrHandler, handler) => {
            const layer = typeof layerOrHandler === 'string' ? layerOrHandler : null;
            const callback = (typeof layerOrHandler === 'function' ? layerOrHandler : handler) as (payload: unknown) => void;
            const key = keyOf(event, layer);
            if (!listeners.has(key)) listeners.set(key, new Set());
            listeners.get(key)!.add(callback);
        },
        off: (event, layerOrHandler, handler) => {
            const layer = typeof layerOrHandler === 'string' ? layerOrHandler : null;
            const callback = (typeof layerOrHandler === 'function' ? layerOrHandler : handler) as (payload: unknown) => void;
            listeners.get(keyOf(event, layer))?.delete(callback);
        },
        getZoom: () => 16,
        easeTo: vi.fn(),
        emit: (event, layer, payload) => {
            listeners.get(keyOf(event, layer))?.forEach((callback) => callback(payload));
        },
    };
    return map;
}

const person = (over: Partial<SnapPerson> = {}): SnapPerson => ({
    id: 'a',
    bodyKey: 'initial:A',
    bodyUrl: null,
    hash: null,
    name: 'Alice',
    since: 'maintenant',
    coordinates: [2.35, 48.85],
    ...over,
});

async function loadSnapAvatarLayer(props: SnapAvatarLayerProps) {
    const { SnapAvatarLayer } = await import('./SnapAvatarLayer');
    return render(<SnapAvatarLayer {...props} />);
}

describe('SnapAvatarLayer', () => {
    let map: FakeMap;
    beforeEach(() => {
        vi.clearAllMocks();
        map = createMap();
        control.map = map;
        control.source.setData.mockClear();
        registryMock.ensure.mockImplementation(async () => {});
    });

    it('monte une source GeoJSON et exactement trois layers Snap', async () => {
        await loadSnapAvatarLayer({ people: [person()] });
        const source = screen.getByTestId('snap-source');
        expect(source).not.toBeNull();
        expect(source.querySelectorAll('[data-layer]')).toHaveLength(3);
        expect(source.querySelector('[data-layer="snap-bases"]')).not.toBeNull();
        expect(source.querySelector('[data-layer="snap-avatars"]')).not.toBeNull();
        expect(source.querySelector('[data-layer="snap-labels"]')).not.toBeNull();
    });

    it('pousse les bases, corps et pastilles dans la source', async () => {
        await act(async () => {
            await loadSnapAvatarLayer({ people: [person({ id: 'a' }), person({ id: 'b', name: 'Bob' })] });
        });
        expect(control.source.setData).toHaveBeenCalled();
        const data = control.source.setData.mock.calls.at(-1)?.[0] as { features: Array<{ properties: { kind: string } }> };
        expect(data.features.filter((feature) => feature.properties.kind === 'base')).toHaveLength(1);
        expect(data.features.filter((feature) => feature.properties.kind === 'avatar')).toHaveLength(2);
        expect(data.features.filter((feature) => feature.properties.kind === 'label')).toHaveLength(1);
    });

    it('deux updates rapides ne gardent qu’un setData en vol (pompe)', async () => {
        let release: () => void = () => {};
        const send = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
        const pump = new UpdatePump<number>(send);
        pump.push(1);
        pump.push(2);
        pump.push(3);
        expect(send).toHaveBeenCalledTimes(1);
        expect(send).toHaveBeenCalledWith(1);
        expect(pump.metrics.maxInFlight).toBe(1);
        expect(pump.metrics.coalesced).toBe(2);
        release();
        await Promise.resolve();
        await Promise.resolve();
        expect(send).toHaveBeenLastCalledWith(3);
        expect(pump.metrics.maxInFlight).toBe(1);
    });

    it('n’écrit rien après démontage pendant un chargement d’images', async () => {
        let resolveEnsure: () => void = () => {};
        registryMock.ensure.mockImplementation(() => new Promise<void>((resolve) => { resolveEnsure = resolve; }));
        const view = await loadSnapAvatarLayer({ people: [person()] });
        view.unmount();
        resolveEnsure();
        await act(async () => { await Promise.resolve(); });
        expect(control.source.setData).not.toHaveBeenCalled();
    });

    it('réinitialise images et pompe au rechargement de style', async () => {
        await act(async () => { await loadSnapAvatarLayer({ people: [person()] }); });
        const before = control.source.setData.mock.calls.length;
        await act(async () => {
            map.emit('style.load', null, {});
            await Promise.resolve();
        });
        expect(registryMock.invalidate).toHaveBeenCalled();
        expect(control.source.setData.mock.calls.length).toBeGreaterThanOrEqual(before + 1);
    });

    it('tap sur un groupe : zoom + 1 et annulation de l’appui long', async () => {
        const onSelectUser = vi.fn();
        const onClusterClick = vi.fn();
        await loadSnapAvatarLayer({ people: [person()], onSelectUser, onClusterClick });
        await act(async () => {
            map.emit('click', 'snap-avatars', {
                features: [{ properties: { cluster: 'group-a-2', members: '["a","b"]' }, geometry: { coordinates: [2.35, 48.85] } }],
                lngLat: { lng: 2.35, lat: 48.85 },
            });
        });
        expect(onClusterClick).toHaveBeenCalledTimes(1);
        expect(onSelectUser).not.toHaveBeenCalled();
        expect(map.easeTo).toHaveBeenCalledWith({ center: [2.35, 48.85], zoom: 17, duration: 400 });
    });

    it('tap sur un individu : ouvre son profil', async () => {
        const onSelectUser = vi.fn();
        await loadSnapAvatarLayer({ people: [person()], onSelectUser });
        await act(async () => {
            map.emit('click', 'snap-avatars', {
                features: [{ properties: { cluster: 'a', members: '["a"]', id: 'a' } }],
            });
        });
        expect(onSelectUser).toHaveBeenCalledWith('a');
    });
});
