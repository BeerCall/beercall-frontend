import { http, HttpResponse } from 'msw';

export const handlers = [
    // --- Auth ---
    http.post('*/auth/signup/', () => {
        return HttpResponse.json({
            id: 'newuser1',
            username: 'NewUser',
            access_token: 'fake-jwt-token',
            refresh_token: 'fake-refresh-token'
        });
    }),
    http.put('*/auth/location/', () => {
        return new HttpResponse(null, { status: 204 });
    }),
    http.post('*/auth/token/', async ({ request }) => {
        const text = await request.text();
        const params = new URLSearchParams(text);
        
        if (params.get('username') === 'validUser' && params.get('password') === 'validPass') {
            return HttpResponse.json({
                access_token: 'fake-jwt-token',
                refresh_token: 'fake-refresh-token',
                token_type: 'bearer',
                username: 'validUser'
            });
        }
        return new HttpResponse(
            JSON.stringify({ detail: "Incorrect credentials" }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
    }),

    // --- Profile ---
    http.get('*/auth/profile/', () => {
        return HttpResponse.json({
            id: 'u1',
            username: 'validUser',
            email: 'user@test.com',
            shop_items: [
                { id: 'head1', category: 'head', gender: 'Unisex', name: 'Cap', price: 10, is_owned: true },
                { id: 'body1', category: 'body', gender: 'Women', name: 'T-Shirt', price: 20, is_owned: true },
                { id: 'body2', category: 'body', gender: 'Men', name: 'Shirt', price: 20, is_owned: true }
            ],
            avatar: { head: 'head1', body: 'body1', legs: '', feet: '', accessory: '', gender: 'Men' },
            unlocked_badges: [],
            score: 0,
            caps: 100,
            stats: { aperos_created: 0, aperos_joined: 0, aperos_declined: 0, aperos_missed: 0, fraud_count: 0 }
        });
    }),

    http.get('*/auth/profile/:id/', () => {
        return HttpResponse.json({
            id: '1',
            username: 'validUser',
            email: 'user@test.com',
            shop_items: [],
            avatar: { head: '', body: '', legs: '', feet: '', accessory: '', gender: 'Men' },
            stats: { aperos_created: 0, aperos_joined: 0, aperos_declined: 0, aperos_missed: 0, fraud_count: 0 }
        });
    }),

    http.get('*/auth/connections/', () => {
        return HttpResponse.json([
            {
                id: 'c1',
                username: 'Friend1',
                caps: 10,
                score: 100,
                title: 'Noob',
                avatar: { head: '', body: '', legs: '', feet: '', accessory: '', gender: 'Men' }
            }
        ]);
    }),

    http.get('*/users/me', () => {
        return HttpResponse.json({
            id: 'u1',
            username: 'validUser',
            email: 'user@test.com'
        });
    }),

    // --- Push Token ---
    http.put('*/auth/push-token/', () => {
        return HttpResponse.json({ success: true });
    }),
    
    // --- Squads ---
    http.get('*/squads/me', () => {
        return HttpResponse.json([
            { id: '1', name: 'Test Squad', description: 'Une squad de test', role: 'admin' }
        ]);
    }),

    http.get('*/squads/', () => {
        return HttpResponse.json([
            { id: '1', name: 'Test Squad', description: 'Une squad de test', role: 'admin' }
        ]);
    }),

    http.get('*/models/glb/manifest.json', () => {
        return HttpResponse.json({
            version: 1,
            pipelineVersion: 1,
            generatedAt: '2026-11-02T00:00:00.000Z',
            items: [
                { key: 'decor/bar', url: '/models/glb/v1/decors/_/Bar.hash.glb', sourceId: 'Bar' },
                { key: 'decor/piscine', url: '/models/glb/v1/decors/_/Swimming_pool.hash.glb', sourceId: 'Swimming_pool' },
                { key: 'decor/dodo', url: '/models/glb/v1/decors/_/Floaty_Island.hash.glb', sourceId: 'Floaty_Island' },
                { key: 'men/head/Men_head_Casual_0', url: '/models/glb/v1/pieces/Men/Men_head_Casual_0.glb', sourceId: 'Men_head_Casual_0' },
                { key: 'men/body/Men_body_Casual_0', url: '/models/glb/v1/pieces/Men/Men_body_Casual_0.glb', sourceId: 'Men_body_Casual_0' },
                { key: 'men/legs/Men_legs_Casual_0', url: '/models/glb/v1/pieces/Men/Men_legs_Casual_0.glb', sourceId: 'Men_legs_Casual_0' },
                { key: 'men/feet/Men_feet_Casual_0', url: '/models/glb/v1/pieces/Men/Men_feet_Casual_0.glb', sourceId: 'Men_feet_Casual_0' },
            ],
        });
    }),

    http.get('*/models/glb/v1/*', () => {
        return new HttpResponse(new ArrayBuffer(8), {
            status: 200,
            headers: { 'Content-Type': 'model/gltf-binary' },
        });
    }),

    http.get('*/squads/:id/member-locations', () => {
        return HttpResponse.json([]);
    }),

    http.get('*/squads/:id', ({ params }) => {
        const { id } = params;
        return HttpResponse.json({
            id,
            name: 'Test Squad Details',
            description: 'Détails',
            join_code: 'CODE123',
            members: [],
            active_beercalls: [],
            scheduled_beercalls: []
        });
    }),

    http.post('*/squads/', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
            id: '2',
            name: (typeof body?.name === 'string') ? body.name : 'New Squad',
            description: (typeof body?.description === 'string') ? body.description : '',
            join_code: 'NEWCODE'
        });
    }),
    http.get('*/aperos/:id/game/state', () => {
        return HttpResponse.json({ state: 'waiting', players: {} });
    }),
];