import axios, { type InternalAxiosRequestConfig } from 'axios';
import { useUserStore } from '../store/useUserStore';
import { getAccessToken, getRefreshToken, saveTokens, clearTokens } from './authTokens';

declare module 'axios' {
    export interface InternalAxiosRequestConfig {
        _isRetry?: boolean;
    }
}

export const MODELS_URL = '/models';

export const api = axios.create({
    baseURL: '/api',
    headers: {
        'Content-Type': 'application/json',
    },
});

export const refreshClient = axios.create({
    baseURL: '/api',
    timeout: 10000,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

let refreshPromise: Promise<string | null> | null = null;

function isAuthUrl(url?: string): boolean {
    if (!url) return false;
    return url.includes('/auth/token/') || url.includes('/auth/signup/') || url.includes('/auth/refresh/');
}

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config as InternalAxiosRequestConfig | undefined;
        const status = error.response?.status;
        const detail = error.response?.data?.detail;

        // Déclencher le refresh uniquement sur expiration du token d'accès ("Could not validate credentials")
        if (
            status === 401 &&
            detail === 'Could not validate credentials' &&
            originalRequest &&
            !isAuthUrl(originalRequest.url)
        ) {
            // Un second 401 après replay est terminal
            if (originalRequest._isRetry) {
                console.warn('🔒 Replay 401 terminal. Déconnexion forcée.');
                clearTokens();
                useUserStore.getState().logout();
                return Promise.reject(error);
            }

            const currentRefreshToken = getRefreshToken();
            // Absence de refresh token (ex. session héritée avec accès seul expiré)
            if (!currentRefreshToken) {
                console.warn('🔒 Aucun refresh token disponible. Déconnexion forcée.');
                clearTokens();
                useUserStore.getState().logout();
                return Promise.reject(error);
            }

            if (!refreshPromise) {
                const startUser = useUserStore.getState().username;
                const startRefreshToken = currentRefreshToken;

                refreshPromise = (async () => {
                    try {
                        const params = new URLSearchParams();
                        params.append('refresh_token', startRefreshToken);

                        const res = await refreshClient.post<{ access_token: string; refresh_token: string }>(
                            '/auth/refresh/',
                            params,
                            {
                                headers: {
                                    'Content-Type': 'application/x-www-form-urlencoded',
                                },
                            }
                        );

                        // Refuser de sauvegarder si logout ou changement de compte pendant l'appel
                        const currentUser = useUserStore.getState().username;
                        const latestRefreshToken = getRefreshToken();
                        if (
                            !useUserStore.getState().isAuthenticated ||
                            currentUser !== startUser ||
                            latestRefreshToken !== startRefreshToken
                        ) {
                            return null;
                        }

                        if (res.data?.access_token && res.data?.refresh_token) {
                            const saved = saveTokens({
                                access_token: res.data.access_token,
                                refresh_token: res.data.refresh_token,
                            });
                            if (saved) {
                                return res.data.access_token;
                            }
                        }

                        clearTokens();
                        useUserStore.getState().logout();
                        return null;
                    } catch (refreshErr: unknown) {
                        const axiosErr = refreshErr as { response?: { status?: number } };
                        // Sur refresh 401 : échec définitif, nettoyage et déconnexion
                        if (axiosErr.response?.status === 401) {
                            clearTokens();
                            useUserStore.getState().logout();
                        }
                        // Sur panne réseau / 5xx : garder la session intacte
                        return null;
                    } finally {
                        refreshPromise = null;
                    }
                })();
            }

            const newAccessToken = await refreshPromise;
            if (!newAccessToken) {
                return Promise.reject(error);
            }

            originalRequest._isRetry = true;
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
            return api(originalRequest);
        }

        return Promise.reject(error);
    }
);
