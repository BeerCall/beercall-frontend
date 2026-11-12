import { createElement, type ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useLocationStore } from '../store/useLocationStore';
import {
    haversineMeters,
    shouldSendLocation,
    useLocationSync,
    type LocationSyncSnapshot,
} from './useLocationSync';

vi.mock('../lib/api', () => ({ api: { put: vi.fn() } }));

const base: LocationSyncSnapshot = {
    visible: true,
    hasSessionFix: true,
    status: 'available',
    lat: 48.85,
    lng: 2.35,
    accuracy: 20,
    now: 1_000_000,
    lastSuccessAt: null,
    lastSent: null,
};

const at = (patch: Partial<LocationSyncSnapshot>): LocationSyncSnapshot => ({ ...base, ...patch });

describe('haversineMeters', () => {
    it('vaut 0 au même point et ~111 m pour 0,001° de latitude', () => {
        expect(haversineMeters({ lat: 48.85, lng: 2.35 }, { lat: 48.85, lng: 2.35 })).toBe(0);
        expect(haversineMeters({ lat: 48.85, lng: 2.35 }, { lat: 48.851, lng: 2.35 })).toBeCloseTo(111.19, 0);
    });
});

describe('shouldSendLocation', () => {
    it('envoie le premier fix valide', () => {
        expect(shouldSendLocation(base)).toBe(true);
    });

    it('refuse cache seul, statut non available, coordonnées non finies', () => {
        expect(shouldSendLocation(at({ hasSessionFix: false }))).toBe(false);
        expect(shouldSendLocation(at({ status: 'denied' }))).toBe(false);
        expect(shouldSendLocation(at({ lat: Number.NaN }))).toBe(false);
        expect(shouldSendLocation(at({ lng: Number.POSITIVE_INFINITY }))).toBe(false);
    });

    it('refuse masqué, précision > 500 m, mais accepte 500 m', () => {
        expect(shouldSendLocation(at({ visible: false }))).toBe(false);
        expect(shouldSendLocation(at({ accuracy: 501 }))).toBe(false);
        expect(shouldSendLocation(at({ accuracy: 500 }))).toBe(true);
    });

    it('ignore 10 s puis 50 m, envoie à 61 s et 60 m', () => {
        const success = at({ lastSuccessAt: 1_000_000, lastSent: { lat: 48.85, lng: 2.35 } });
        expect(shouldSendLocation(at({ ...success, now: 1_010_000 }))).toBe(false);
        expect(shouldSendLocation(at({ ...success, now: 1_061_000 }))).toBe(false);
        expect(shouldSendLocation(at({
            ...success,
            now: 1_061_000,
            lat: 48.85054,
            lastSent: { lat: 48.85, lng: 2.35 },
        }))).toBe(true);
    });

    it('heartbeat 5 min visible même sans déplacement', () => {
        const success = at({ lastSuccessAt: 1_000_000, lastSent: { lat: 48.85, lng: 2.35 } });
        expect(shouldSendLocation(at({ ...success, now: 1_299_999 }))).toBe(false);
        expect(shouldSendLocation(at({ ...success, now: 1_300_000 }))).toBe(true);
    });

    it('retour visible : envoie après 60 s, pas avant', () => {
        const success = at({ lastSuccessAt: 1_000_000, lastSent: { lat: 48.85, lng: 2.35 } });
        expect(shouldSendLocation(at({ ...success, now: 1_061_000, resumed: true }))).toBe(true);
        expect(shouldSendLocation(at({ ...success, now: 1_030_000, resumed: true }))).toBe(false);
    });
});

const wrapper = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children);
};

describe('useLocationSync', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.mocked(api.put).mockReset().mockResolvedValue({ data: {} });
        useLocationStore.setState({
            userLocation: { lat: 48.85, lng: 2.35 },
            accuracy: 20,
            hasSessionFix: true,
            locationStatus: 'available',
            isTracking: true,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        useLocationStore.setState({
            userLocation: null, acquiredAt: null, accuracy: null,
            hasSessionFix: false, locationStatus: 'idle', isTracking: false,
        });
    });

    it('envoie le premier fix valide immédiatement', async () => {
        renderHook(() => useLocationSync(), { wrapper: wrapper() });
        await act(async () => { await Promise.resolve(); });
        expect(api.put).toHaveBeenCalledTimes(1);
        expect(api.put).toHaveBeenCalledWith('/auth/location/', { latitude: 48.85, longitude: 2.35, accuracy: 20 });
    });

    it('ne demande pas la permission GPS', async () => {
        const getCurrentPosition = vi.fn();
        const watchPosition = vi.fn();
        Object.defineProperty(navigator, 'geolocation', {
            configurable: true,
            value: { getCurrentPosition, watchPosition, clearWatch: vi.fn() },
        });
        renderHook(() => useLocationSync(), { wrapper: wrapper() });
        await act(async () => { await Promise.resolve(); });
        expect(getCurrentPosition).not.toHaveBeenCalled();
        expect(watchPosition).not.toHaveBeenCalled();
    });

    it('n’envoie rien quand désactivé', async () => {
        renderHook(() => useLocationSync(false), { wrapper: wrapper() });
        await act(async () => { await Promise.resolve(); });
        expect(api.put).not.toHaveBeenCalled();
    });

    it('ne heartbeat pas caché et reprend au retour après 60 s', async () => {
        const descriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
        let hidden = false;
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
        try {
            renderHook(() => useLocationSync(), { wrapper: wrapper() });
            await act(async () => { await Promise.resolve(); });
            expect(api.put).toHaveBeenCalledTimes(1);

            hidden = true;
            act(() => { document.dispatchEvent(new Event('visibilitychange')); });
            await act(async () => { vi.advanceTimersByTime(300_000); await Promise.resolve(); });
            expect(api.put).toHaveBeenCalledTimes(1);

            hidden = false;
            act(() => { document.dispatchEvent(new Event('visibilitychange')); });
            await act(async () => { vi.advanceTimersByTime(15_000); await Promise.resolve(); });
            expect(api.put).toHaveBeenCalledTimes(2);
        } finally {
            if (descriptor) Object.defineProperty(document, 'hidden', descriptor);
        }
    });

    it('échoue avec un seul retry puis attend avant de réessayer', async () => {
        vi.mocked(api.put).mockReset().mockRejectedValue(new Error('network'));
        renderHook(() => useLocationSync(), { wrapper: wrapper() });
        await act(async () => { await Promise.resolve(); });
        await act(async () => { vi.advanceTimersByTime(2_000); await Promise.resolve(); });
        expect(api.put).toHaveBeenCalledTimes(2);
        await act(async () => { vi.advanceTimersByTime(30_000); await Promise.resolve(); });
        expect(api.put).toHaveBeenCalledTimes(2);
    });
});
