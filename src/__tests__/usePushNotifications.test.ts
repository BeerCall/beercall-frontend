import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePushNotifications } from '../hooks/usePushNotifications';

const mocks = vi.hoisted(() => ({
    messaging: Promise.resolve({}) as Promise<object | null> | null,
    getToken: vi.fn(async () => 'test-token'),
    put: vi.fn(async () => ({})),
}));
vi.mock('../lib/firebase', () => ({ get messaging() { return mocks.messaging; } }));
vi.mock('firebase/messaging', () => ({ getToken: mocks.getToken }));
vi.mock('../lib/api', () => ({ api: { put: mocks.put } }));
vi.mock('../store/useUserStore', () => ({ useUserStore: (selector: (state: { isAuthenticated: boolean }) => boolean) => selector({ isAuthenticated: true }) }));

describe('optional push notifications', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.messaging = Promise.resolve({});
    });
    afterEach(() => vi.unstubAllGlobals());

    it('renders and declines subscription when Notification is absent', async () => {
        vi.stubGlobal('Notification', undefined);
        const { result } = renderHook(() => usePushNotifications());
        await expect(result.current.subscribeToNotifications()).resolves.toBe(false);
        expect(mocks.getToken).not.toHaveBeenCalled();
    });

    it('does not request permission when Firebase is unconfigured', async () => {
        mocks.messaging = null;
        const requestPermission = vi.fn();
        vi.stubGlobal('Notification', { permission: 'default', requestPermission });
        const { result } = renderHook(() => usePushNotifications());
        await expect(result.current.subscribeToNotifications()).resolves.toBe(false);
        expect(requestPermission).not.toHaveBeenCalled();
    });

    it('does not retrieve a token when the SDK reports unsupported', async () => {
        mocks.messaging = Promise.resolve(null);
        vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn(async () => 'granted') });
        const { result } = renderHook(() => usePushNotifications());
        await expect(result.current.subscribeToNotifications()).resolves.toBe(false);
        expect(mocks.getToken).not.toHaveBeenCalled();
    });

    it('restores the token after support detection and the service worker are ready', async () => {
        const instance = { app: 'supported' };
        mocks.messaging = Promise.resolve(instance);
        const registration = { scope: 'test' };
        vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve(registration) } });
        vi.stubGlobal('Notification', { permission: 'granted' });
        renderHook(() => usePushNotifications());
        await waitFor(() => expect(mocks.put).toHaveBeenCalledWith('/auth/push-token/', { token: 'test-token' }));
        expect(mocks.getToken).toHaveBeenCalledWith(instance, expect.objectContaining({ serviceWorkerRegistration: registration }));
    });
});
