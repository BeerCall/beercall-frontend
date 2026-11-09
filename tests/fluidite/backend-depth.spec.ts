import { randomUUID } from 'node:crypto';
import { test, expect } from './base';
import {
    captureUsers,
    cleanupAperosByNames,
    deleteUsersByUsernames,
    lastJsonLine,
    restoreUsers,
    runPython,
} from './backendState';

type Api = import('@playwright/test').APIRequestContext;

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=', 'base64');
const PASSWORD = 'E2eDepth2026!';
const stamp = () => Date.now().toString(36);

interface Tokens {
    accessToken: string;
    refreshToken: string;
}

interface AvatarConfig {
    head: string;
    body: string;
    legs: string;
    feet: string;
    animation: string;
    accessory?: string | null;
    gender: string;
}

async function login(request: Api, username: string, password: string): Promise<Tokens> {
    const response = await request.post('/api/auth/token/', {form: {username, password}});
    expect(response.ok(), `login ${username}: ${response.status()}`).toBeTruthy();
    const body = await response.json() as {access_token: string; refresh_token: string};
    return {accessToken: body.access_token, refreshToken: body.refresh_token};
}

function auth(tokens: Tokens): Record<string, string> {
    return {Authorization: `Bearer ${tokens.accessToken}`};
}

function userOneAvatar(): AvatarConfig {
    const output = runPython(`
import json
from db.database import SessionLocal
from models.user import User
db = SessionLocal()
try:
    user = db.query(User).filter(User.id == 1).one()
    print(json.dumps(user.avatar_config))
finally:
    db.close()
`);
    return JSON.parse(lastJsonLine(output)) as AvatarConfig;
}

function skinSamples(): {
    unavailable: string | null;
    expensive: string;
    ownedByUserOne: string;
    notInConfig: string;
} {
    const output = runPython(`
import json
from db.database import SessionLocal
from models.user import User
from models.gamification import Skin, user_skins
db = SessionLocal()
try:
    user = db.query(User).filter(User.id == 1).one()
    config_ids = {value for value in (user.avatar_config or {}).values() if isinstance(value, str)}
    owned = [row.skin_id for row in db.execute(
        user_skins.select().where(user_skins.c.user_id == 1)
    )]
    unavailable = db.query(Skin).filter(Skin.available.is_(False)).first()
    expensive = db.query(Skin).order_by(Skin.price_caps.desc()).first()
    not_in_config = db.query(Skin).filter(
        Skin.available.is_(True),
        ~Skin.id.in_(list(config_ids)),
    ).first()
    print(json.dumps({
        'unavailable': unavailable.id if unavailable else None,
        'expensive': expensive.id if expensive else '',
        'ownedByUserOne': owned[0] if owned else '',
        'notInConfig': not_in_config.id if not_in_config else '',
    }))
finally:
    db.close()
`);
    return JSON.parse(lastJsonLine(output)) as {
        unavailable: string | null;
        expensive: string;
        ownedByUserOne: string;
        notInConfig: string;
    };
}

function inviteCode(squadId: number): string {
    const output = runPython(`
from db.database import SessionLocal
from models.squad import Squad
db = SessionLocal()
try:
    print(db.query(Squad).filter(Squad.id == ${squadId}).one().invite_code)
finally:
    db.close()
`);
    return lastJsonLine(output).trim();
}

function createApero(
    name: string,
    status: 'ACTIVE' | 'ENDED',
    participants: Array<{user_id: number; state: 'JOINED' | 'DECLINED'; excuse?: string}>,
): number {
    const output = runPython(`
from datetime import datetime, timezone, timedelta
from db.database import SessionLocal
from models.apero import Apero, AperoParticipant, AperoStatus, ParticipationStatus
db = SessionLocal()
try:
    now = datetime.now(timezone.utc)
    apero = Apero(
        squad_id=2, creator_id=1, location_name=${JSON.stringify(name)},
        latitude=48.8566, longitude=2.3522,
        status=AperoStatus.${status},
        started_at=now,
        ended_at=now - timedelta(hours=1) if '${status}' == 'ENDED' else now + timedelta(hours=4),
    )
    db.add(apero)
    db.flush()
    for item in ${JSON.stringify(participants)}:
        db.add(AperoParticipant(
            apero_id=apero.id, user_id=item['user_id'],
            status=ParticipationStatus[item['state']],
            excuse=item.get('excuse'),
            created_at=now,
        ))
    db.commit()
    print(f'APERO_ID={apero.id}')
finally:
    db.close()
`);
    const match = output.match(/APERO_ID=(\d+)/);
    if (!match) throw new Error(`Création apéro impossible: ${output}`);
    return Number(match[1]);
}

async function createTempUser(request: Api, username: string): Promise<Tokens> {
    const response = await request.post('/api/auth/signup/', {
        data: {username, password: PASSWORD, avatar: userOneAvatar()},
    });
    expect(response.status(), `signup ${username}: ${await response.text()}`).toBe(200);
    const body = await response.json() as {access_token: string; refresh_token: string};
    return {accessToken: body.access_token, refreshToken: body.refresh_token};
}

test.describe('Backend — parcours HTTP profonds', () => {
    test('Users : inscription, profils, boutique, équipement et réglages', async ({ request }) => {
        const users = captureUsers([1]);
        const username = `E2Euser${stamp()}`;
        const skin = skinSamples();
        try {
            const user = await login(request, 'FluiditeDemo', 'FluiditeTest2026!');
            const temp = await createTempUser(request, username);

            const duplicate = await request.post('/api/auth/signup/', {
                data: {username, password: PASSWORD, avatar: userOneAvatar()},
            });
            expect(duplicate.status()).toBe(400);

            if (skin.unavailable) {
                const unavailableAvatar = {...userOneAvatar(), head: skin.unavailable};
                const unavailable = await request.post('/api/auth/signup/', {
                    data: {username: `E2Eunavail${stamp()}`, password: PASSWORD, avatar: unavailableAvatar},
                });
                expect(unavailable.status()).toBe(409);
            }

            const wrongPassword = await request.post('/api/auth/token/', {
                form: {username: 'FluiditeDemo', password: `bad-${stamp()}`},
            });
            expect(wrongPassword.status()).toBe(401);

            const refreshed = await request.post('/api/auth/refresh/', {
                form: {refresh_token: user.refreshToken},
            });
            expect(refreshed.status()).toBe(200);
            const wrongRefresh = await request.post('/api/auth/refresh/', {
                form: {refresh_token: user.accessToken},
            });
            expect(wrongRefresh.status()).toBe(401);

            expect((await request.get('/api/auth/me', {headers: auth(user)})).status()).toBe(200);
            expect((await request.get('/api/auth/profile/', {headers: auth(user)})).status()).toBe(200);
            expect((await request.get('/api/auth/profile/')).status()).toBe(200);
            expect((await request.get('/api/auth/profile/u_4/', {headers: auth(user)})).status()).toBe(200);
            expect((await request.get('/api/auth/profile/not-an-id/', {headers: auth(user)})).status()).toBe(400);
            expect((await request.get('/api/auth/profile/u_999999/', {headers: auth(user)})).status()).toBe(404);
            expect((await request.get('/api/auth/connections/', {headers: auth(user)})).status()).toBe(200);
            expect((await request.get('/api/auth/me')).status()).toBe(401);

            expect((await request.post('/api/auth/buy/', {
                headers: auth(user), data: {item_id: `unknown-${stamp()}`},
            })).status()).toBe(404);
            if (skin.unavailable) {
                expect((await request.post('/api/auth/buy/', {
                    headers: auth(user), data: {item_id: skin.unavailable},
                })).status()).toBe(409);
            }
            expect((await request.post('/api/auth/buy/', {
                headers: auth(user), data: {item_id: skin.ownedByUserOne},
            })).status()).toBe(400);
            expect((await request.post('/api/auth/buy/', {
                headers: auth(temp), data: {item_id: skin.expensive},
            })).status()).toBe(400);

            if (skin.notInConfig) {
                const unowned = {...userOneAvatar(), head: skin.notInConfig};
                expect((await request.put('/api/auth/equip/', {
                    headers: auth(temp), data: unowned,
                })).status()).toBe(403);
            }
            expect((await request.put('/api/auth/equip/', {
                headers: auth(temp), data: userOneAvatar(),
            })).status()).toBe(200);

            expect((await request.post('/api/auth/test-notification/', {headers: auth(temp)})).status()).toBe(200);
            expect((await request.put('/api/auth/push-token/', {
                headers: auth(temp), data: {token: `e2e-push-${stamp()}`},
            })).status()).toBe(200);
            expect((await request.post('/api/auth/test-notification/', {headers: auth(temp)})).status()).toBe(200);
            expect((await request.put('/api/auth/location/', {
                headers: auth(temp), data: {latitude: 48.8566, longitude: 2.3522},
            })).status()).toBe(204);
        } finally {
            deleteUsersByUsernames([username]);
            restoreUsers(users);
            expect(captureUsers([1])).toEqual(users);
        }
    });

    test('Squads : adhésion, détails, ticket WebSocket et mondes', async ({ request }) => {
        const users = captureUsers([1]);
        const username = `E2Esquad${stamp()}`;
        const aperoName = `E2E worlds ${stamp()}`;
        try {
            const user = await login(request, 'FluiditeDemo', 'FluiditeTest2026!');
            const temp = await createTempUser(request, username);

            expect((await request.post('/api/squads/join', {
                headers: auth(temp), data: {invite_code: `bad-${stamp()}`},
            })).status()).toBe(404);
            expect((await request.post('/api/squads/join', {
                headers: auth(temp), data: {invite_code: inviteCode(2)},
            })).status()).toBe(200);

            expect((await request.get('/api/squads/2', {headers: auth(temp)})).status()).toBe(200);
            expect((await request.get('/api/squads/3', {headers: auth(temp)})).status()).toBe(403);
            expect((await request.get('/api/squads/999999', {headers: auth(temp)})).status()).toBe(404);

            const ticket = await request.post('/api/squads/2/ws-ticket', {headers: auth(temp)});
            expect(ticket.status()).toBe(200);
            expect((await ticket.json() as {ticket?: string}).ticket).toBeTruthy();

            expect((await request.get('/api/squads/2/member-locations', {headers: auth(temp)})).status()).toBe(200);
            expect((await request.get('/api/squads/999999/member-locations', {headers: auth(temp)})).status()).toBe(404);
            expect((await request.get('/api/squads/3/member-locations', {headers: auth(temp)})).status()).toBe(403);

            const jobId = '00000000-0000-4000-8000-000000000000';
            expect((await request.get(`/api/squads/999999/beer-calls/jobs/${jobId}`, {headers: auth(temp)})).status()).toBe(404);
            expect((await request.get(`/api/squads/3/beer-calls/jobs/${jobId}`, {headers: auth(temp)})).status()).toBe(403);
            expect((await request.get(`/api/squads/2/beer-calls/jobs/${jobId}`, {headers: auth(temp)})).status()).toBe(404);

            const aperoId = createApero(aperoName, 'ACTIVE', [
                {user_id: 1, state: 'JOINED'},
                {user_id: 4, state: 'DECLINED', excuse: 'E2E worlds'},
            ]);
            // Le compte de test rejoint l'apéro pour alimenter le Bar, while user 4 reste à la Piscine.
            expect((await request.post(`/api/squads/2/beer-calls/bc_${aperoId}/join/`, {
                headers: auth(temp),
                multipart: {
                    file: {name: 'e2e.png', mimeType: 'image/png', buffer: PNG},
                    lat: '48.8566',
                    lon: '2.3522',
                },
            })).status()).toBe(200);
            const worlds = await request.get(`/api/squads/2/beer-calls/bc_${aperoId}/worlds`, {headers: auth(temp)});
            expect(worlds.status()).toBe(200);
            const worldsBody = await worlds.json() as {worlds: Record<string, {participants: unknown[]}>};
            expect(worldsBody.worlds.bar.participants.length).toBeGreaterThanOrEqual(1);
            expect(worldsBody.worlds.piscine.participants.length).toBeGreaterThanOrEqual(1);

            expect((await request.get('/api/squads/2/beer-calls/bc_999999/worlds', {headers: auth(temp)})).status()).toBe(404);
            expect((await request.get(`/api/squads/3/beer-calls/bc_${aperoId}/worlds`, {headers: auth(user)})).status()).toBe(403);
        } finally {
            cleanupAperosByNames([aperoName]);
            deleteUsersByUsernames([username]);
            restoreUsers(users);
            expect(captureUsers([1])).toEqual(users);
        }
    });

    test('Participation et programmation : erreurs, fraude, démarrage', async ({ request }) => {
        const users = captureUsers([1]);
        const username = `E2Epart${stamp()}`;
        const names = {
            join: `E2E join-depth ${stamp()}`,
            decline: `E2E decline-depth ${stamp()}`,
            ended: `E2E ended-depth ${stamp()}`,
            scheduled: `E2E schedule-depth ${stamp()}`,
        };
        try {
            const user = await login(request, 'FluiditeDemo', 'FluiditeTest2026!');
            const temp = await createTempUser(request, username);
            expect((await request.post('/api/squads/join', {
                headers: auth(temp), data: {invite_code: inviteCode(2)},
            })).status()).toBe(200);

            const joinApero = createApero(names.join, 'ACTIVE', [{user_id: 1, state: 'JOINED'}]);
            const farJoin = await request.post(`/api/squads/2/beer-calls/bc_${joinApero}/join/`, {
                headers: auth(temp),
                multipart: {
                    file: {name: 'e2e.png', mimeType: 'image/png', buffer: PNG},
                    lat: '49.0000',
                    lon: '2.3522',
                },
            });
            expect(farJoin.status()).toBe(403);
            expect((await request.post(`/api/squads/2/beer-calls/bc_${joinApero}/join/`, {
                headers: auth(temp),
                multipart: {
                    file: {name: 'e2e.png', mimeType: 'image/png', buffer: PNG},
                    lat: '48.8566',
                    lon: '2.3522',
                },
            })).status()).toBe(200);
            expect((await request.post(`/api/squads/2/beer-calls/bc_${joinApero}/join/`, {
                headers: auth(temp),
                multipart: {
                    file: {name: 'e2e.png', mimeType: 'image/png', buffer: PNG},
                    lat: '48.8566',
                    lon: '2.3522',
                },
            })).status()).toBe(400);
            expect((await request.post(`/api/squads/2/beer-calls/bc_${joinApero}/decline/`, {
                headers: auth(temp), data: {excuse: 'déjà répondu'},
            })).status()).toBe(400);

            const declineApero = createApero(names.decline, 'ACTIVE', [{user_id: 1, state: 'JOINED'}]);
            expect((await request.post(`/api/squads/2/beer-calls/bc_${declineApero}/decline/`, {
                headers: auth(temp), data: {excuse: 'E2E piscine profonde'},
            })).status()).toBe(200);
            expect((await request.post(`/api/squads/2/beer-calls/bc_${declineApero}/decline/`, {
                headers: auth(temp), data: {excuse: 'encore'},
            })).status()).toBe(400);

            const endedApero = createApero(names.ended, 'ENDED', [{user_id: 1, state: 'JOINED'}]);
            expect((await request.post(`/api/squads/2/beer-calls/bc_${endedApero}/join/`, {
                headers: auth(temp),
                multipart: {
                    file: {name: 'e2e.png', mimeType: 'image/png', buffer: PNG},
                    lat: '48.8566',
                    lon: '2.3522',
                },
            })).status()).toBe(409);
            expect((await request.post(`/api/squads/2/beer-calls/bc_${endedApero}/decline/`, {
                headers: auth(temp), data: {excuse: 'trop tard'},
            })).status()).toBe(409);

            cleanupAperosByNames([names.join, names.decline, names.ended]);

            const invalidFile = await request.post('/api/squads/2/beer-calls/', {
                headers: {...auth(user), 'Idempotency-Key': randomUUID()},
                multipart: {
                    file: {name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('not-an-image')},
                    latitude: '48.8566',
                    longitude: '2.3522',
                    location_name: `E2E invalid ${stamp()}`,
                },
            });
            expect(invalidFile.status()).toBe(400);

            const badKey = await request.post('/api/squads/2/beer-calls/', {
                headers: {...auth(user), 'Idempotency-Key': 'not-a-uuid'},
                multipart: {
                    file: {name: 'e2e.png', mimeType: 'image/png', buffer: PNG},
                    latitude: '48.8566',
                    longitude: '2.3522',
                    location_name: `E2E bad-key ${stamp()}`,
                },
            });
            expect(badKey.status()).toBe(422);

            const past = await request.post('/api/squads/2/scheduled-beer-calls/', {
                headers: auth(user),
                data: {
                    location_name: names.scheduled,
                    latitude: 48.8566,
                    longitude: 2.3522,
                    scheduled_for: new Date(Date.now() - 3_600_000).toISOString(),
                },
            });
            expect(past.status()).toBe(400);

            const future = new Date(Date.now() + 3_600_000).toISOString();
            const scheduled = await request.post('/api/squads/2/scheduled-beer-calls/', {
                headers: auth(user),
                data: {location_name: names.scheduled, latitude: 48.8566, longitude: 2.3522, scheduled_for: future},
            });
            expect([200, 201]).toContain(scheduled.status());
            const scheduledBody = await scheduled.json() as {id: number};
            expect(scheduledBody.id).toBeTruthy();

            const duplicateSchedule = await request.post('/api/squads/2/scheduled-beer-calls/', {
                headers: auth(user),
                data: {location_name: names.scheduled, latitude: 48.8566, longitude: 2.3522, scheduled_for: future},
            });
            expect(duplicateSchedule.status()).toBe(400);

            const farStart = await request.post(`/api/squads/2/beer-calls/bc_${scheduledBody.id}/start/`, {
                headers: auth(user),
                multipart: {
                    file: {name: 'e2e.png', mimeType: 'image/png', buffer: PNG},
                    latitude: '49.0000',
                    longitude: '2.3522',
                },
            });
            expect(farStart.status()).toBe(403);

            const started = await request.post(`/api/squads/2/beer-calls/bc_${scheduledBody.id}/start/`, {
                headers: auth(user),
                multipart: {
                    file: {name: 'e2e.png', mimeType: 'image/png', buffer: PNG},
                    latitude: '48.8566',
                    longitude: '2.3522',
                },
            });
            expect([200, 201]).toContain(started.status());

            const restart = await request.post(`/api/squads/2/beer-calls/bc_${scheduledBody.id}/start/`, {
                headers: auth(user),
                multipart: {
                    file: {name: 'e2e.png', mimeType: 'image/png', buffer: PNG},
                    latitude: '48.8566',
                    longitude: '2.3522',
                },
            });
            expect(restart.status()).toBe(409);
        } finally {
            cleanupAperosByNames([names.join, names.decline, names.ended, names.scheduled]);
            deleteUsersByUsernames([username]);
            restoreUsers(users);
            expect(captureUsers([1])).toEqual(users);
        }
    });
});
