import { http, HttpResponse } from 'msw';

export const handlers = [
    // --- Auth ---
    http.post('*/auth/signup/', () => {
        return HttpResponse.json({
            id: 'newuser1',
            username: 'NewUser',
            access_token: 'fake-jwt-token'
        });
    }),
    http.post('*/auth/token/', async ({ request }) => {
        const text = await request.text();
        const params = new URLSearchParams(text);
        
        if (params.get('username') === 'validUser' && params.get('password') === 'validPass') {
            return HttpResponse.json({
                access_token: 'fake-jwt-token',
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
            ]
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
];