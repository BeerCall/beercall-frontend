import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import maplibregl from 'maplibre-gl';

import { MapSection } from '../components/Dashboard/MapSection';
import { mapMockControl } from '../../setupTests';

const defaultProps: Parameters<typeof MapSection>[0] = {
    mapRef: { current: null },
    userLocation: { lat: 48.8566, lng: 2.3522 },
    isNightMode: false,
    canCreateFromLocation: true,
    visible: true,
    active: true,
    squadDetails: null,
    profile: { id: 1, username: 'test', avatar: {} } as unknown as Parameters<typeof MapSection>[0]['profile'],
    handleMapPointerDown: vi.fn(),
    cancelLongPress: vi.fn(),
    handleMapPointerMove: vi.fn(),
    handleManualRecenter: vi.fn(),
    handleBeerCallClick: vi.fn(),
    openCamera: vi.fn(),
    setIsWorldsModalOpen: vi.fn(),
    people: [],
};

describe('P0 — la carte utilise la vraie bibliothèque MapLibre, hors lease', () => {
    it('fournit à react-map-gl la vraie classe maplibregl.Map (aucun double, aucune sous-classe de lease)', async () => {
        render(<MapSection {...defaultProps} />);

        await waitFor(() => expect(mapMockControl.latestProps).not.toBeNull());

        const mapLib = mapMockControl.latestProps?.mapLib as typeof maplibregl | undefined;
        expect(mapLib).toBe(maplibregl);
        expect(mapLib?.Map).toBe(maplibregl.Map);
    });

    it("logge l'erreur MapLibre au lieu de l'avaler silencieusement", async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        render(<MapSection {...defaultProps} />);

        await waitFor(() => expect(mapMockControl.latestProps).not.toBeNull());

        const boom = new Error('boom maplibre');
        act(() => {
            (mapMockControl.latestProps?.onError as ((event: unknown) => void) | undefined)?.({ error: boom });
        });

        expect(consoleError).toHaveBeenCalled();
        const [label, payload] = consoleError.mock.calls.at(-1) ?? [];
        expect(String(label)).toContain('MapSection');
        expect(payload).toMatchObject({ error: boom });

        consoleError.mockRestore();
    });
});
