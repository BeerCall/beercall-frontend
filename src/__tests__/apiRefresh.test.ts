import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';
import { api } from '../lib/api';
import { useUserStore } from '../store/useUserStore';
import { saveTokens, getAccessToken, getRefreshToken } from '../lib/authTokens';

describe('Axios interceptor - refresh and single-flight retry (T03)', () => {
    beforeEach(() => {
        localStorage.clear();
        useUserStore.setState({ isAuthenticated: true, username: 'testuser' });
        saveTokens({ accessToken: 'initial-access', refreshToken: 'initial-refresh' });
    });

    it('401 credentials -> refresh -> 200 replay with new token', async () => {
        let refreshCalled = 0;
        let protectedCalls = 0;
        let capturedAuthHeader: string | null = null;
        let capturedContentType: string | null = null;
        let capturedRequestBody = '';

        server.use(
            http.post('*/auth/refresh/', async ({ request }) => {
                refreshCalled++;
                capturedContentType = request.headers.get('Content-Type');
                capturedRequestBody = await request.text();
                return HttpResponse.json({
                    access_token: 'refreshed-access',
                    refresh_token: 'refreshed-refresh',
                    token_type: 'bearer',
                });
            }),
            http.get('*/test-protected', ({ request }) => {
                protectedCalls++;
                capturedAuthHeader = request.headers.get('Authorization');
                if (protectedCalls === 1) {
                    return HttpResponse.json(
                        { detail: 'Could not validate credentials' },
                        { status: 401 }
                    );
                }
                return HttpResponse.json({ ok: true, data: 'secure-data' });
            })
        );

        const res = await api.get('/test-protected');
        expect(res.data).toEqual({ ok: true, data: 'secure-data' });
        expect(refreshCalled).toBe(1);
        expect(protectedCalls).toBe(2);
        expect(capturedContentType).toContain('application/x-www-form-urlencoded');
        expect(capturedRequestBody).toBe('refresh_token=initial-refresh');
        expect(capturedAuthHeader).toBe('Bearer refreshed-access');
        expect(getAccessToken()).toBe('refreshed-access');
        expect(getRefreshToken()).toBe('refreshed-refresh');
        expect(useUserStore.getState().isAuthenticated).toBe(true);
    });

    it('401 with a different detail -> does NOT refresh, propagates original error', async () => {
        let refreshCalled = 0;

        server.use(
            http.post('*/auth/refresh/', () => {
                refreshCalled++;
                return HttpResponse.json({ access_token: 'new-acc', refresh_token: 'new-ref' });
            }),
            http.get('*/test-business-401', () => {
                return HttpResponse.json(
                    { detail: 'Not a member of this squad' },
                    { status: 401 }
                );
            })
        );

        await expect(api.get('/test-business-401')).rejects.toMatchObject({
            response: {
                status: 401,
                data: { detail: 'Not a member of this squad' },
            },
        });

        expect(refreshCalled).toBe(0);
        expect(getAccessToken()).toBe('initial-access');
        expect(getRefreshToken()).toBe('initial-refresh');
        expect(useUserStore.getState().isAuthenticated).toBe(true);
    });

    it('5 concurrent calls sharing a single flight refresh', async () => {
        let refreshCalled = 0;
        let callCounts = 0;

        server.use(
            http.post('*/auth/refresh/', async () => {
                refreshCalled++;
                // Small delay to ensure all 5 calls hit in-flight
                await new Promise((resolve) => setTimeout(resolve, 50));
                return HttpResponse.json({
                    access_token: 'single-flight-acc',
                    refresh_token: 'single-flight-ref',
                });
            }),
            http.get('*/test-concurrent', ({ request }) => {
                callCounts++;
                const auth = request.headers.get('Authorization');
                if (auth !== 'Bearer single-flight-acc') {
                    return HttpResponse.json(
                        { detail: 'Could not validate credentials' },
                        { status: 401 }
                    );
                }
                return HttpResponse.json({ ok: true });
            })
        );

        const results = await Promise.all([
            api.get('/test-concurrent'),
            api.get('/test-concurrent'),
            api.get('/test-concurrent'),
            api.get('/test-concurrent'),
            api.get('/test-concurrent'),
        ]);

        expect(refreshCalled).toBe(1);
        expect(callCounts).toBe(10);
        results.forEach((r) => expect(r.data).toEqual({ ok: true }));
        expect(getAccessToken()).toBe('single-flight-acc');
        expect(getRefreshToken()).toBe('single-flight-ref');
    });

    it('refresh 401 failure -> cleans up tokens and logs out user', async () => {
        server.use(
            http.post('*/auth/refresh/', () => {
                return HttpResponse.json(
                    { detail: 'Refresh token invalide ou expiré' },
                    { status: 401 }
                );
            }),
            http.get('*/test-expired-refresh', () => {
                return HttpResponse.json(
                    { detail: 'Could not validate credentials' },
                    { status: 401 }
                );
            })
        );

        await expect(api.get('/test-expired-refresh')).rejects.toMatchObject({
            response: { status: 401 },
        });

        expect(getAccessToken()).toBeNull();
        expect(getRefreshToken()).toBeNull();
        expect(useUserStore.getState().isAuthenticated).toBe(false);
    });

    it('refresh network / 500 failure -> keeps session intact and rejects without logout', async () => {
        server.use(
            http.post('*/auth/refresh/', () => {
                return HttpResponse.json(
                    { detail: 'Internal server error' },
                    { status: 500 }
                );
            }),
            http.get('*/test-500-recovery', () => {
                return HttpResponse.json(
                    { detail: 'Could not validate credentials' },
                    { status: 401 }
                );
            })
        );

        await expect(api.get('/test-500-recovery')).rejects.toMatchObject({
            response: { status: 401 },
        });

        // Tokens and session must be preserved for later retry
        expect(getAccessToken()).toBe('initial-access');
        expect(getRefreshToken()).toBe('initial-refresh');
        expect(useUserStore.getState().isAuthenticated).toBe(true);
    });

    it('does NOT loop: a second 401 after replay is terminal and logs out', async () => {
        let refreshCalled = 0;

        server.use(
            http.post('*/auth/refresh/', () => {
                refreshCalled++;
                return HttpResponse.json({
                    access_token: 'new-acc',
                    refresh_token: 'new-ref',
                });
            }),
            http.get('*/test-no-loop', () => {
                // Always return 401 credentials even with refreshed token
                return HttpResponse.json(
                    { detail: 'Could not validate credentials' },
                    { status: 401 }
                );
            })
        );

        await expect(api.get('/test-no-loop')).rejects.toMatchObject({
            response: { status: 401 },
        });

        expect(refreshCalled).toBe(1);
        expect(getAccessToken()).toBeNull();
        expect(getRefreshToken()).toBeNull();
        expect(useUserStore.getState().isAuthenticated).toBe(false);
    });

    it('refuses to store refreshed tokens or resume if user logged out while refresh in flight', async () => {
        let finishRefresh!: () => void;
        const refreshHold = new Promise<void>((resolve) => {
            finishRefresh = resolve;
        });

        server.use(
            http.post('*/auth/refresh/', async () => {
                await refreshHold;
                return HttpResponse.json({
                    access_token: 'late-acc',
                    refresh_token: 'late-ref',
                });
            }),
            http.get('*/test-logout-race', () => {
                return HttpResponse.json(
                    { detail: 'Could not validate credentials' },
                    { status: 401 }
                );
            })
        );

        const requestPromise = api.get('/test-logout-race');

        // User logs out while refresh is in flight
        useUserStore.getState().logout();
        expect(useUserStore.getState().isAuthenticated).toBe(false);

        // Complete refresh
        finishRefresh();

        await expect(requestPromise).rejects.toBeDefined();

        expect(getAccessToken()).toBeNull();
        expect(getRefreshToken()).toBeNull();
        expect(useUserStore.getState().isAuthenticated).toBe(false);
    });

    it('legacy session with access token only -> 401 credentials triggers immediate cleanup and logout without refresh', async () => {
        localStorage.clear();
        localStorage.setItem('token', 'legacy-only-access');
        useUserStore.setState({ isAuthenticated: true, username: 'legacyuser' });

        let refreshCalled = 0;
        server.use(
            http.post('*/auth/refresh/', () => {
                refreshCalled++;
                return HttpResponse.json({ access_token: 'new', refresh_token: 'new' });
            }),
            http.get('*/test-legacy-only', () => {
                return HttpResponse.json(
                    { detail: 'Could not validate credentials' },
                    { status: 401 }
                );
            })
        );

        await expect(api.get('/test-legacy-only')).rejects.toMatchObject({
            response: { status: 401 },
        });

        expect(refreshCalled).toBe(0);
        expect(getAccessToken()).toBeNull();
        expect(getRefreshToken()).toBeNull();
        expect(useUserStore.getState().isAuthenticated).toBe(false);
    });
});
