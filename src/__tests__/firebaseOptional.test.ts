import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
    initializeApp: vi.fn(() => ({ name: 'test-app' })),
    getMessaging: vi.fn(() => ({ app: 'test-app' })),
    getDatabase: vi.fn(() => ({ app: 'test-app' })),
    ref: vi.fn((_db: unknown, path: string) => ({ path })),
}));

vi.mock('firebase/app', () => ({ initializeApp: sdk.initializeApp }));
vi.mock('firebase/messaging', () => ({ getMessaging: sdk.getMessaging }));
vi.mock('firebase/database', () => ({ getDatabase: sdk.getDatabase, ref: sdk.ref }));

const keys = ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'STORAGE_BUCKET', 'MESSAGING_SENDER_ID', 'APP_ID', 'DATABASE_URL'];
function configure() {
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-only-key');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project');
    vi.stubEnv('VITE_FIREBASE_APP_ID', 'test-app');
    vi.stubEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', '123');
    vi.stubEnv('VITE_FIREBASE_DATABASE_URL', 'https://test-project.firebaseio.com');
}

describe('Firebase optionnel', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        for (const key of keys) vi.stubEnv(`VITE_FIREBASE_${key}`, '');
    });
    afterEach(() => vi.unstubAllEnvs());

    it('ne démarre aucun SDK sans configuration', async () => {
        const firebase = await import('../lib/firebase');
        expect(firebase.messaging).toBeNull();
        expect(firebase.db).toBeNull();
        expect(sdk.initializeApp).not.toHaveBeenCalled();
        expect(sdk.getMessaging).not.toHaveBeenCalled();
        expect(sdk.getDatabase).not.toHaveBeenCalled();
        expect(() => firebase.squadChatRef('42')).toThrow('Firebase n’est pas configuré');
        expect(() => firebase.beerCallChatRef('42', 'bc_1')).toThrow('Firebase n’est pas configuré');
        expect(sdk.ref).not.toHaveBeenCalled();
    });

    it('tolère une configuration partielle', async () => {
        vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project');
        const firebase = await import('../lib/firebase');
        expect(firebase.db).toBeNull();
        expect(firebase.messaging).toBeNull();
        expect(sdk.initializeApp).not.toHaveBeenCalled();
    });

    it('initialise les intégrations configurées et conserve les chemins du chat', async () => {
        configure();
        const firebase = await import('../lib/firebase');
        expect(sdk.initializeApp).toHaveBeenCalledOnce();
        expect(sdk.getMessaging).toHaveBeenCalledOnce();
        expect(sdk.getDatabase).toHaveBeenCalledWith({ name: 'test-app' }, 'https://test-project.firebaseio.com');
        expect(firebase.squadChatRef('42')).toEqual({ path: 'squads/42/messages' });
        expect(firebase.beerCallChatRef('42', 'bc_1')).toEqual({ path: 'squads/42/beer-calls/bc_1/messages' });
    });

    it('désactive seulement le chat si son URL manque', async () => {
        configure();
        vi.stubEnv('VITE_FIREBASE_DATABASE_URL', '');
        const firebase = await import('../lib/firebase');
        expect(firebase.messaging).not.toBeNull();
        expect(firebase.db).toBeNull();
        expect(sdk.getDatabase).not.toHaveBeenCalled();
    });

    it('désactive seulement les notifications si leur identifiant manque', async () => {
        configure();
        vi.stubEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', '');
        const firebase = await import('../lib/firebase');
        expect(firebase.db).not.toBeNull();
        expect(firebase.messaging).toBeNull();
        expect(sdk.getMessaging).not.toHaveBeenCalled();
    });
});
