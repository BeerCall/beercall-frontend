export const ACCESS_TOKEN_KEY = 'token';
export const REFRESH_TOKEN_KEY = 'refresh_token';

export type TokenPair =
    | { accessToken: string; refreshToken: string }
    | { access_token: string; refresh_token: string };

/**
 * Persists an access token and refresh token pair in localStorage.
 * Rejects incomplete pairs without performing partial writes.
 */
export function saveTokens(tokens: TokenPair): boolean {
    const access = 'access_token' in tokens ? tokens.access_token : tokens.accessToken;
    const refresh = 'refresh_token' in tokens ? tokens.refresh_token : tokens.refreshToken;

    if (
        typeof access !== 'string' ||
        typeof refresh !== 'string' ||
        access.trim() === '' ||
        refresh.trim() === ''
    ) {
        return false;
    }

    localStorage.setItem(ACCESS_TOKEN_KEY, access);
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
    return true;
}

/**
 * Returns the access token if present and non-empty.
 * Supports legacy single-access-token logins.
 */
export function getAccessToken(): string | null {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    return token && token.trim() !== '' ? token : null;
}

/**
 * Returns the refresh token if present and non-empty.
 */
export function getRefreshToken(): string | null {
    const token = localStorage.getItem(REFRESH_TOKEN_KEY);
    return token && token.trim() !== '' ? token : null;
}

/**
 * Clears both access and refresh tokens from storage.
 * Does not remove unrelated preferences or stored keys.
 */
export function clearTokens(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
}
