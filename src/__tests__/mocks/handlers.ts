import { http, HttpResponse } from 'msw';

export const handlers = [
    // --- Auth ---
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
            email: 'user@test.com'
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
        const body: any = await request.json();
        return HttpResponse.json({
            id: '2',
            name: body.name || 'New Squad',
            description: body.description || '',
            join_code: 'NEWCODE'
        });
    }),
];