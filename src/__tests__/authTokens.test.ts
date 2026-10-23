import { describe, it, expect, beforeEach } from 'vitest';
import {
    saveTokens,
    getAccessToken,
    getRefreshToken,
    clearTokens,
    ACCESS_TOKEN_KEY,
    REFRESH_TOKEN_KEY,
} from '../lib/authTokens';
import { useUserStore } from '../store/useUserStore';

describe('authTokens and session persistence', () => {
    beforeEach(() => {
        localStorage.clear();
        useUserStore.setState({ isAuthenticated: false, username: null });
    });

    it('saves and reads token pairs using camelCase and snake_case signatures', () => {
        expect(saveTokens({ accessToken: 'acc-1', refreshToken: 'ref-1' })).toBe(true);
        expect(getAccessToken()).toBe('acc-1');
        expect(getRefreshToken()).toBe('ref-1');
        expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('acc-1');
        expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('ref-1');

        expect(saveTokens({ access_token: 'acc-2', refresh_token: 'ref-2' })).toBe(true);
        expect(getAccessToken()).toBe('acc-2');
        expect(getRefreshToken()).toBe('ref-2');
    });

    it('rejects incomplete pairs without performing partial writes', () => {
        // Preset tokens to check they are not partially overwritten
        localStorage.setItem(ACCESS_TOKEN_KEY, 'initial-access');
        localStorage.setItem(REFRESH_TOKEN_KEY, 'initial-refresh');

        // Missing/empty refresh
        const res1 = saveTokens({ accessToken: 'new-access', refreshToken: '' });
        expect(res1).toBe(false);
        expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('initial-access');
        expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('initial-refresh');

        // Missing/empty access
        const res2 = saveTokens({ access_token: '   ', refresh_token: 'new-refresh' });
        expect(res2).toBe(false);
        expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('initial-access');
        expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('initial-refresh');
    });

    it('supports reading legacy single access token', () => {
        localStorage.setItem(ACCESS_TOKEN_KEY, 'legacy-token');
        expect(getAccessToken()).toBe('legacy-token');
        expect(getRefreshToken()).toBeNull();
    });

    it('clears tokens without removing other stored preferences', () => {
        saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
        localStorage.setItem('theme_preference', 'dark');

        clearTokens();

        expect(getAccessToken()).toBeNull();
        expect(getRefreshToken()).toBeNull();
        expect(localStorage.getItem('theme_preference')).toBe('dark');
    });

    it('logout from useUserStore clears auth tokens and resets user state without wiping other storage', () => {
        saveTokens({ accessToken: 'acc-live', refreshToken: 'ref-live' });
        localStorage.setItem('user_app_setting', 'enabled');

        useUserStore.getState().login('Alice');
        expect(useUserStore.getState().isAuthenticated).toBe(true);
        expect(useUserStore.getState().username).toBe('Alice');

        useUserStore.getState().logout();

        expect(useUserStore.getState().isAuthenticated).toBe(false);
        expect(useUserStore.getState().username).toBeNull();
        expect(getAccessToken()).toBeNull();
        expect(getRefreshToken()).toBeNull();
        expect(localStorage.getItem('user_app_setting')).toBe('enabled');
    });
});
