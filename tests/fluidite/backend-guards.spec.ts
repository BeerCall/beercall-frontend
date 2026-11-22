import { randomUUID } from 'node:crypto';
import { test, expect } from './base';
import { assertReleaseIsolation } from './releaseIsolation';
import {
    captureUsers,
    cleanupAperosByNames,
    deleteUsersByUsernames,
    lastJsonLine,
    restoreActiveAperos,
    restoreUsers,
    runPython,
    suspendCompetingActiveAperos,
} from './backendState';

type Api = import('@playwright/test').APIRequestContext;

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=', 'base64');
const PASSWORD = 'E2eGuards2026!';
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

interface ParticipantSeed {
    user_id: number;
    state: 'JOINED' | 'DECLINED';
    excuse?: string;
    photo_path?: string;
}

interface AperoOptions {
    name: string;
    squadId?: number;
    creatorId?: number;
    status?: 'ACTIVE' | 'ENDED' | 'SCHEDULED';
    /** Apéro encore marqué ACTIVE alors que sa fenêtre de 4 h est dépassée. */
    endedInPast?: boolean;
    participants?: ParticipantSeed[];
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

function createApero(options: AperoOptions): number {
    const status = options.status ?? 'ACTIVE';
    const times = status === 'SCHEDULED'
        ? {started: 'None', ended: 'None', scheduled: 'now + timedelta(hours=2)'}
        : status === 'ENDED' || options.endedInPast
            ? {started: 'now - timedelta(hours=5)', ended: 'now - timedelta(hours=1)', scheduled: 'None'}
            : {started: 'now', ended: 'now + timedelta(hours=4)', scheduled: 'None'};
    const output = runPython(`
from datetime import datetime, timezone, timedelta
from db.database import SessionLocal
from models.apero import Apero, AperoParticipant, AperoStatus, ParticipationStatus
db = SessionLocal()
try:
    now = datetime.now(timezone.utc)
    apero = Apero(
        squad_id=${options.squadId ?? 2}, creator_id=${options.creatorId ?? 1},
        location_name=${JSON.stringify(options.name)},
        latitude=48.8566, longitude=2.3522,
        status=AperoStatus.${status},
        scheduled_for=${times.scheduled},
        started_at=${times.started},
        ended_at=${times.ended},
    )
    db.add(apero)
    db.flush()
    for item in ${JSON.stringify(options.participants ?? [])}:
        db.add(AperoParticipant(
            apero_id=apero.id, user_id=item['user_id'],
            status=ParticipationStatus[item['state']],
            excuse=item.get('excuse'),
            photo_path=item.get('photo_path'),
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

/** Job en attente d'upload : jamais réclamé par le worker, il ne sert qu'à l'idempotence. */
function seedUploadingJob(jobId: string, idempotencyKey: string, locationName: string): void {
    runPython(`
import uuid
from db.database import SessionLocal
from models.beer_call_job import BeerCallJob, BeerCallJobStatus
db = SessionLocal()
try:
    db.add(BeerCallJob(
        id=uuid.UUID('${jobId}'), creator_id=1, squad_id=2, idempotency_key='${idempotencyKey}',
        status=BeerCallJobStatus.UPLOADING, latitude=48.8566, longitude=2.3522,
        location_name=${JSON.stringify(locationName)},
    ))
    db.commit()
    print('JOB_SEEDED')
finally:
    db.close()
`);
}

function deleteJobs(jobIds: string[]): void {
    if (jobIds.length === 0) return;
    runPython(`
import uuid
from db.database import SessionLocal
from models.beer_call_job import BeerCallJob
db = SessionLocal()
try:
    db.query(BeerCallJob).filter(BeerCallJob.id.in_([${jobIds.map((id) => `uuid.UUID('${id}')`).join(',')}])).delete(synchronize_session=False)
    db.commit()
    print('JOBS_DELETED')
finally:
    db.close()
`);
}

/** Retire commentaires et événements d'un apéro avant la suppression de l'apéro. */
function deleteCommentsForApero(name: string): void {
    runPython(`
from db.database import SessionLocal
from models.apero import Apero
from models.photo_comment import ProofPhotoComment
from models.realtime_event import RealtimeEvent
db = SessionLocal()
try:
    ids = [apero.id for apero in db.query(Apero).filter(Apero.location_name == ${JSON.stringify(name)}).all()]
    if ids:
        db.query(ProofPhotoComment).filter(ProofPhotoComment.apero_id.in_(ids)).delete(synchronize_session=False)
        for event in db.query(RealtimeEvent).filter(RealtimeEvent.squad_id == 2).all():
            if event.payload.get('type') == 'PHOTO_COMMENT' and event.payload.get('beer_call_id') in ids:
                db.delete(event)
    db.commit()
    print('COMMENTS_DELETED')
finally:
    db.close()
`);
}

async function createTempUser(request: Api, username: string): Promise<Tokens> {
    const response = await request.post('/api/auth/signup/', {
        data: {username, password: PASSWORD, avatar: userOneAvatar()},
    });
    expect(response.status(), `signup ${username}: ${await response.text()}`).toBe(200);
    const body = await response.json() as {access_token: string; refresh_token: string};
    return {accessToken: body.access_token, refreshToken: body.refresh_token};
}

function primeDeclineCounters(username: string): number {
    const output = runPython(`
import json
from db.database import SessionLocal
from models.user import User
db = SessionLocal()
try:
    user = db.query(User).filter(User.username == ${JSON.stringify(username)}).one()
    user.consecutive_piscine = 4
    user.consecutive_declines = 4
    db.commit()
    print(json.dumps({'id': user.id}))
finally:
    db.close()
`);
    return (JSON.parse(lastJsonLine(output)) as {id: number}).id;
}

function badgesOf(userId: number): string[] {
    const output = runPython(`
import json
from db.database import SessionLocal
from models.gamification import user_badges
db = SessionLocal()
try:
    rows = db.execute(user_badges.select().where(user_badges.c.user_id == ${userId})).all()
    print(json.dumps(sorted(row.badge_id for row in rows)))
finally:
    db.close()
`);
    return JSON.parse(lastJsonLine(output)) as string[];
}

/** Skin disponible non porté par le compte 1, pour tester les garde-fous catalogue. */
function pickSpareSkin(): string {
    const output = runPython(`
import json
from db.database import SessionLocal
from models.user import User
from models.gamification import Skin
db = SessionLocal()
try:
    user = db.query(User).filter(User.id == 1).one()
    used = [value for value in (user.avatar_config or {}).values() if isinstance(value, str)]
    skin = db.query(Skin).filter(Skin.available.is_(True), ~Skin.id.in_(used)).order_by(Skin.id).first()
    print(json.dumps({'id': skin.id if skin else None}))
finally:
    db.close()
`);
    return (JSON.parse(lastJsonLine(output)) as {id: string | null}).id ?? '';
}

function setSkinAvailability(skinId: string, available: boolean): void {
    runPython(`
from db.database import SessionLocal
from models.gamification import Skin
db = SessionLocal()
try:
    db.query(Skin).filter(Skin.id == ${JSON.stringify(skinId)}).update(
        {Skin.available: ${available ? 'True' : 'False'}}, synchronize_session=False)
    db.commit()
    print('SKIN_UPDATED')
finally:
    db.close()
`);
}

test.describe('Backend — garde-fous HTTP', () => {
    test.beforeAll(({baseURL}) => {
        assertReleaseIsolation(baseURL);
    });

    test('Squads : ticket WebSocket, création et idempotence', async ({ request }) => {
        const users = captureUsers([1]);
        const suspended = suspendCompetingActiveAperos(2);
        const key = randomUUID();
        const jobId = randomUUID();
        let jobSeeded = false;
        const activeName = `E2E guard active ${stamp()}`;
        try {
            seedUploadingJob(jobId, key, `E2E seeded job ${stamp()}`);
            jobSeeded = true;
            const user = await login(request, 'FluiditeDemo', 'FluiditeTest2026!');

            expect((await request.post('/api/squads/999999/ws-ticket', {headers: auth(user)})).status()).toBe(404);
            expect((await request.post('/api/squads/3/ws-ticket', {headers: auth(user)})).status()).toBe(403);

            const beerCall = {
                multipart: {
                    file: {name: 'e2e.png', mimeType: 'image/png', buffer: PNG},
                    latitude: '48.8566',
                    longitude: '2.3522',
                    location_name: `E2E guard create ${stamp()}`,
                },
            };
            expect((await request.post('/api/squads/999999/beer-calls/', {
                headers: {...auth(user), 'Idempotency-Key': randomUUID()}, ...beerCall,
            })).status()).toBe(404);
            expect((await request.post('/api/squads/3/beer-calls/', {
                headers: {...auth(user), 'Idempotency-Key': randomUUID()}, ...beerCall,
            })).status()).toBe(403);

            const conflict = await request.post('/api/squads/2/beer-calls/', {
                headers: {...auth(user), 'Idempotency-Key': key},
                multipart: {...beerCall.multipart, location_name: `E2E guard conflict ${stamp()}`},
            });
            expect(conflict.status()).toBe(409);

            createApero({name: activeName, participants: [{user_id: 4, state: 'JOINED'}]});
            const alreadyActive = await request.post('/api/squads/2/beer-calls/', {
                headers: {...auth(user), 'Idempotency-Key': randomUUID()},
                ...beerCall,
            });
            expect(alreadyActive.status()).toBe(400);

            // Membre sans apéro en cours : c'est la proximité de celui du créateur
            // précédent qui refuse la création.
            const neighbor = await login(request, 'FluiditeUser_10', 'FluiditeTest2026!');
            expect((await request.post('/api/squads/2/beer-calls/', {
                headers: {...auth(neighbor), 'Idempotency-Key': randomUUID()},
                ...beerCall,
            })).status()).toBe(400);
        } finally {
            try {
                cleanupAperosByNames([activeName]);
            } finally {
                try {
                    if (jobSeeded) deleteJobs([jobId]);
                } finally {
                    try {
                        restoreUsers(users);
                        expect(captureUsers([1])).toEqual(users);
                    } finally {
                        restoreActiveAperos(suspended);
                    }
                }
            }
        }
    });

    test('Squads : adhésion, réponse, programmation et démarrage refusés', async ({ request }) => {
        const suspended = suspendCompetingActiveAperos(2);
        const username = `E2Eguard${stamp()}`;
        const names = {
            outsider: `E2E guard outsider ${stamp()}`,
            decline: `E2E guard decline ${stamp()}`,
            nearby: `E2E guard nearby ${stamp()}`,
            scheduled: `E2E guard scheduled ${stamp()}`,
            expired: `E2E guard expired ${stamp()}`,
        };
        try {
            const temp = await createTempUser(request, username);
            const outsiderApero = createApero({
                name: names.outsider, squadId: 3, creatorId: 3,
                participants: [{user_id: 3, state: 'JOINED'}],
            });

            expect((await request.post('/api/squads/join', {
                headers: auth(temp), data: {invite_code: inviteCode(2)},
            })).status()).toBe(200);
            expect((await request.post('/api/squads/join', {
                headers: auth(temp), data: {invite_code: inviteCode(2)},
            })).status()).toBe(400);

            const joinPhoto = {
                multipart: {file: {name: 'e2e.png', mimeType: 'image/png', buffer: PNG}, lat: '48.8566', lon: '2.3522'},
            };
            expect((await request.post('/api/squads/2/beer-calls/bc_999999/join/', {
                headers: auth(temp), ...joinPhoto,
            })).status()).toBe(404);
            expect((await request.post(`/api/squads/3/beer-calls/bc_${outsiderApero}/join/`, {
                headers: auth(temp), ...joinPhoto,
            })).status()).toBe(403);
            expect((await request.post(`/api/squads/3/beer-calls/bc_${outsiderApero}/decline/`, {
                headers: auth(temp), data: {excuse: 'pas ma squad'},
            })).status()).toBe(403);
            expect((await request.post('/api/squads/2/beer-calls/bc_999999/decline/', {
                headers: auth(temp), data: {excuse: 'introuvable'},
            })).status()).toBe(404);

            const future = new Date(Date.now() + 3_600_000).toISOString();
            expect((await request.post('/api/squads/999999/scheduled-beer-calls/', {
                headers: auth(temp),
                data: {location_name: names.scheduled, latitude: 48.8566, longitude: 2.3522, scheduled_for: future},
            })).status()).toBe(404);
            expect((await request.post('/api/squads/3/scheduled-beer-calls/', {
                headers: auth(temp),
                data: {location_name: names.scheduled, latitude: 48.8566, longitude: 2.3522, scheduled_for: future},
            })).status()).toBe(403);

            expect((await request.post('/api/squads/999999/beer-calls/bc_1/start/', {
                headers: auth(temp), multipart: {file: {name: 'e2e.png', mimeType: 'image/png', buffer: PNG}, latitude: '48.8566', longitude: '2.3522'},
            })).status()).toBe(404);
            expect((await request.post(`/api/squads/3/beer-calls/bc_${outsiderApero}/start/`, {
                headers: auth(temp), multipart: {file: {name: 'e2e.png', mimeType: 'image/png', buffer: PNG}, latitude: '48.8566', longitude: '2.3522'},
            })).status()).toBe(403);
            expect((await request.post('/api/squads/2/beer-calls/bc_999999/start/', {
                headers: auth(temp), multipart: {file: {name: 'e2e.png', mimeType: 'image/png', buffer: PNG}, latitude: '48.8566', longitude: '2.3522'},
            })).status()).toBe(404);

            // Déclin avec excuse : les séries sont amorcées pour déclencher NAGEUR et CASANIER.
            const declineApero = createApero({name: names.decline, participants: [{user_id: 4, state: 'JOINED'}]});
            const tempId = primeDeclineCounters(username);
            expect((await request.post(`/api/squads/2/beer-calls/bc_${declineApero}/decline/`, {
                headers: auth(temp), data: {excuse: 'E2E série piscine'},
            })).status()).toBe(200);
            expect(badgesOf(tempId)).toEqual(expect.arrayContaining(['CASANIER', 'NAGEUR']));

            // Un apéro actif à moins de 500 m bloque le démarrage du programmé.
            createApero({name: names.nearby, participants: [{user_id: 4, state: 'JOINED'}]});
            const scheduledApero = createApero({
                name: names.scheduled, status: 'SCHEDULED', participants: [{user_id: 1, state: 'JOINED'}],
            });
            expect((await request.post(`/api/squads/2/beer-calls/bc_${scheduledApero}/start/`, {
                headers: auth(temp), multipart: {file: {name: 'e2e.png', mimeType: 'image/png', buffer: PNG}, latitude: '48.8566', longitude: '2.3522'},
            })).status()).toBe(400);

            // Lecture de squad : un apéro ACTIVE hors fenêtre bascule en ENDED.
            const expiredApero = createApero({
                name: names.expired, endedInPast: true, participants: [{user_id: 4, state: 'JOINED'}],
            });
            const details = await request.get('/api/squads/2', {headers: auth(temp)});
            expect(details.status()).toBe(200);
            const body = await details.json() as {
                active_beer_call: Array<{id: string; status: string}>;
                past_beer_calls: Array<{id: string; status: string}>;
            };
            expect(body.active_beer_call.map((item) => item.id)).not.toContain(`bc_${expiredApero}`);
            expect(body.past_beer_calls).toContainEqual(
                expect.objectContaining({id: `bc_${expiredApero}`, status: 'ended'}),
            );
        } finally {
            try {
                deleteUsersByUsernames([username]);
            } finally {
                try {
                    cleanupAperosByNames(Object.values(names));
                } finally {
                    restoreActiveAperos(suspended);
                }
            }
        }
    });

    test('Commentaires photo : accès, preuve absente et suppression', async ({ request }) => {
        const username = `E2Ecomment${stamp()}`;
        const aperoName = `E2E guard comments ${stamp()}`;
        const photoPath = `uploads/aperos/e2e-guard-${stamp()}.png`;
        try {
            const user = await login(request, 'FluiditeDemo', 'FluiditeTest2026!');
            const temp = await createTempUser(request, username);
            expect((await request.post('/api/squads/join', {
                headers: auth(temp), data: {invite_code: inviteCode(2)},
            })).status()).toBe(200);

            const aperoId = createApero({
                name: aperoName,
                participants: [
                    {user_id: 1, state: 'JOINED'},
                    {user_id: 4, state: 'JOINED', photo_path: photoPath},
                ],
            });
            const comments = (owner: string) => `/api/squads/2/beer-calls/bc_${aperoId}/photos/${owner}/comments`;

            expect((await request.get('/api/squads/999999/beer-calls/bc_1/photos/u_4/comments', {
                headers: auth(user),
            })).status()).toBe(404);
            expect((await request.get('/api/squads/3/beer-calls/bc_1/photos/u_4/comments', {
                headers: auth(user),
            })).status()).toBe(403);
            expect((await request.get('/api/squads/2/beer-calls/bc_999999/photos/u_4/comments', {
                headers: auth(user),
            })).status()).toBe(404);
            expect((await request.get(comments('u_999999'), {headers: auth(user)})).status()).toBe(404);
            expect((await request.post(comments('u_999999'), {
                headers: auth(user), data: {content: 'preuve absente'},
            })).status()).toBe(404);

            const created = await request.post(comments('u_4'), {
                headers: auth(temp), data: {content: 'Commentaire étranger'},
            });
            expect(created.status()).toBe(201);
            const commentId = (await created.json() as {id: number}).id;

            expect((await request.delete(`/api/squads/2/beer-calls/bc_${aperoId}/comments/${commentId}`, {
                headers: auth(user),
            })).status()).toBe(403);
            expect((await request.delete(`/api/squads/2/beer-calls/bc_${aperoId}/comments/999999`, {
                headers: auth(user),
            })).status()).toBe(404);
            expect((await request.delete(`/api/squads/2/beer-calls/bc_${aperoId}/comments/${commentId}`, {
                headers: auth(temp),
            })).status()).toBe(204);
        } finally {
            try {
                deleteCommentsForApero(aperoName);
            } finally {
                try {
                    deleteUsersByUsernames([username]);
                } finally {
                    cleanupAperosByNames([aperoName]);
                }
            }
        }
    });

    test('Jeux : apéro absent, inactif, squad étrangère et Bar incomplet', async ({ request }) => {
        const names = {
            ended: `E2E guard game ended ${stamp()}`,
            outsider: `E2E guard game outsider ${stamp()}`,
            missing: `E2E guard game missing ${stamp()}`,
            alone: `E2E guard game alone ${stamp()}`,
        };
        try {
            const user = await login(request, 'FluiditeDemo', 'FluiditeTest2026!');
            const gameAction = {headers: auth(user), data: {action: 'next'}};

            expect((await request.post('/api/aperos/999999/game/start', {headers: auth(user)})).status()).toBe(404);
            expect((await request.get('/api/aperos/999999/game/state', {headers: auth(user)})).status()).toBe(404);
            expect((await request.post('/api/aperos/999999/game/action', gameAction)).status()).toBe(404);

            const endedApero = createApero({
                name: names.ended, status: 'ENDED', participants: [{user_id: 1, state: 'JOINED'}],
            });
            expect((await request.post(`/api/aperos/${endedApero}/game/start`, {headers: auth(user)})).status()).toBe(409);

            const outsiderApero = createApero({
                name: names.outsider, squadId: 3, creatorId: 3,
                participants: [{user_id: 3, state: 'JOINED'}],
            });
            expect((await request.post(`/api/aperos/${outsiderApero}/game/start`, {headers: auth(user)})).status()).toBe(403);

            const missingApero = createApero({name: names.missing, participants: [{user_id: 4, state: 'JOINED'}]});
            expect((await request.post(`/api/aperos/${missingApero}/game/start`, {headers: auth(user)})).status()).toBe(403);

            const aloneApero = createApero({name: names.alone, participants: [{user_id: 1, state: 'JOINED'}]});
            expect((await request.post(`/api/aperos/${aloneApero}/game/start`, {headers: auth(user)})).status()).toBe(400);
            expect((await request.get(`/api/aperos/${aloneApero}/game/state`, {headers: auth(user)})).status()).toBe(404);
            expect((await request.post(`/api/aperos/${aloneApero}/game/action`, gameAction)).status()).toBe(404);
        } finally {
            cleanupAperosByNames(Object.values(names));
        }
    });

    test('Profil et catalogue : rafraîchissement et articles indisponibles', async ({ request }) => {
        const username = `E2Eprofile${stamp()}`;
        const ghostUsername = `E2Eghost${stamp()}`;
        const unavailableUsername = `E2Eunavailable${stamp()}`;
        const spareSkin = pickSpareSkin();
        expect(spareSkin, 'Le catalogue de recette doit contenir un article témoin disponible').toBeTruthy();
        let skinFlipped = false;
        try {
            const user = await login(request, 'FluiditeDemo', 'FluiditeTest2026!');

            expect((await request.get('/api/health/live')).status()).toBe(200);
            expect((await request.get('/api/auth/profile/u_1/', {headers: auth(user)})).status()).toBe(200);
            expect((await request.post('/api/auth/refresh/', {form: {refresh_token: 'not-a-jwt'}})).status()).toBe(401);

            const ghost = await createTempUser(request, ghostUsername);
            deleteUsersByUsernames([ghostUsername]);
            expect((await request.post('/api/auth/refresh/', {form: {refresh_token: ghost.refreshToken}})).status()).toBe(401);

            const unavailableAvatar = {...userOneAvatar(), head: spareSkin};
            setSkinAvailability(spareSkin, false);
            skinFlipped = true;
            expect((await request.post('/api/auth/signup/', {
                data: {username: unavailableUsername, password: PASSWORD, avatar: unavailableAvatar},
            })).status()).toBe(409);
            expect((await request.post('/api/auth/buy/', {
                headers: auth(user), data: {item_id: spareSkin},
            })).status()).toBe(409);
            expect((await request.put('/api/auth/equip/', {
                headers: auth(user), data: unavailableAvatar,
            })).status()).toBe(409);
        } finally {
            try {
                if (skinFlipped) setSkinAvailability(spareSkin, true);
            } finally {
                deleteUsersByUsernames([username, ghostUsername, unavailableUsername]);
            }
        }
    });
});
