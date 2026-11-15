/**
 * 14c-1 — qualification E2E isolée du regroupement visuel des apéros.
 *
 * Toutes les fixtures (squads, apéros, participations) sont synthétiques et
 * créées dans la base jetable de recette. La garde `assertReleaseIsolation`
 * s'exécute avant la moindre écriture SQL ou mutation.
 *
 * Vérifie : compteur d'apéros (jamais de participants), groupe au dézoom,
 * séparation au zoom, expansion sans action métier, feuille des inséparables
 * (focus, Échap, sélection des trois actions), mise à jour/retrait à chaud,
 * changement de squad, confidentialité inter-squads, carte tournée, petit
 * viewport, réduction des animations, appui long et gestes de carte.
 */

import { test, expect, type Page } from './base';
import type { Locator } from '@playwright/test';
import { loginAs } from './contextTracker';
import { lastJsonLine, runPython } from './backendState';
import { assertReleaseIsolation } from './releaseIsolation';

const PREFIX = 'E2E Groupes';
const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=',
    'base64',
);
/** Centre de la grappe « Proche » (deux apéros séparés de ~0,001° de longitude). */
const NEAR_CENTER: [number, number] = [2.6005, 48.6];
/** Centre de la grappe « Serre » (trois apéros exactement confondus). */
const SAME_CENTER: [number, number] = [2.605, 48.605];
/** Centre des apéros de la squad D (mise à jour à chaud). */
const HOT_CENTER: [number, number] = [2.61, 48.61];
/** Centres décalés vers le sud : sur un écran de 568 px, la barre basse masque
 * le centre de la carte ; les marqueurs sont ainsi cliquables plus haut. */
const SMALL_SAME_CENTER: [number, number] = [2.605, 48.6005];
const SMALL_NEAR_CENTER: [number, number] = [2.6005, 48.5955];

interface Fixtures {
    a: number;
    b: number;
    c: number;
    d: number;
    a1: number;
    a2: number;
    a3: number;
    a4: number;
    a5: number;
    b1: number;
    c1: number;
    d1: number;
    d2: number;
}

let fixtures: Fixtures;
let isolationConfirmed = false;

function parseMarker<T>(output: string, marker: string): T {
    const line = lastJsonLine(output);
    const match = line.match(new RegExp(`^${marker}=(.*)$`));
    if (!match) throw new Error(`Marqueur ${marker} absent: ${output}`);
    return JSON.parse(match[1]) as T;
}

/**
 * Recrée les quatre squads synthétiques et leurs apéros. Le nettoyage par
 * préfixe rend le seed idempotent après une campagne interrompue.
 */
function seedFixtures(): Fixtures {
    const output = runPython(`
import json
from datetime import datetime, timedelta, timezone
from db.database import SessionLocal
from models.squad import Squad
from models.user import User
from models.apero import Apero, AperoStatus, AperoParticipant, ParticipationStatus

PREFIX = ${JSON.stringify(PREFIX)}

def wipe(db):
    for existing in db.query(Squad).filter(Squad.name.like(PREFIX + "%")).all():
        for item in db.query(Apero).filter(Apero.squad_id == existing.id).all():
            db.query(AperoParticipant).filter(
                AperoParticipant.apero_id == item.id,
            ).delete(synchronize_session=False)
            db.delete(item)
        existing.members.clear()
        db.delete(existing)
    db.flush()

db = SessionLocal()
try:
    wipe(db)
    now = datetime.now(timezone.utc)
    demo = db.query(User).filter_by(username="FluiditeDemo").one()
    outsider = db.query(User).filter_by(username="FluiditeOutsider").one()
    joiners = db.query(User).filter(User.username.in_(
        ["FluiditeUser_1", "FluiditeUser_2", "FluiditeUser_3", "FluiditeUser_4"])).all()
    assert len(joiners) == 4, "Les participants synthétiques du seed sont absents"

    def make_squad(name, code, members):
        squad = Squad(name=name, icon="beer", color="#FFCC00", invite_code=code)
        squad.members = list(members)
        db.add(squad)
        db.flush()
        return squad

    a = make_squad(PREFIX + " A", "E2EGPA", [demo])
    b = make_squad(PREFIX + " B", "E2EGPB", [demo])
    c = make_squad(PREFIX + " C", "E2EGPC", [outsider])
    d = make_squad(PREFIX + " D", "E2EGPD", [demo])

    def make_apero(squad, name, latitude, longitude, status, creator,
                   started=None, scheduled=None, ended=None):
        item = Apero(squad_id=squad.id, creator_id=creator.id, location_name=name,
                     latitude=latitude, longitude=longitude, status=status,
                     started_at=started, scheduled_for=scheduled, ended_at=ended)
        db.add(item)
        db.flush()
        return item

    a1 = make_apero(a, "E2E Proche A1", 48.6000, 2.6000, AperoStatus.ACTIVE, demo,
                    started=now - timedelta(minutes=30))
    a2 = make_apero(a, "E2E Proche A2", 48.6000, 2.6010, AperoStatus.ACTIVE, demo,
                    started=now - timedelta(minutes=25))
    a3 = make_apero(a, "E2E Serre Actif", 48.6050, 2.6050, AperoStatus.ACTIVE, demo,
                    started=now - timedelta(minutes=20))
    a4 = make_apero(a, "E2E Serre Programme", 48.6050, 2.6050, AperoStatus.SCHEDULED, demo,
                    scheduled=now + timedelta(hours=3))
    a5 = make_apero(a, "E2E Serre Passe", 48.6050, 2.6050, AperoStatus.ENDED, demo,
                    started=now - timedelta(hours=3), ended=now - timedelta(hours=2))
    for joiner in joiners:
        db.add(AperoParticipant(apero_id=a3.id, user_id=joiner.id,
                                status=ParticipationStatus.JOINED))
    b1 = make_apero(b, "E2E Squad B", 48.6050, 2.6050, AperoStatus.ACTIVE, demo,
                    started=now - timedelta(minutes=15))
    c1 = make_apero(c, "E2E Cache C", 48.6050, 2.6050, AperoStatus.ACTIVE, outsider,
                    started=now - timedelta(minutes=10))
    d1 = make_apero(d, "E2E Chaud A", 48.6100, 2.6100, AperoStatus.ACTIVE, demo,
                    started=now - timedelta(minutes=20))
    d2 = make_apero(d, "E2E Chaud B", 48.6100, 2.6100, AperoStatus.ACTIVE, demo,
                    started=now - timedelta(minutes=20))
    db.commit()
    print("FIXTURES=" + json.dumps({
        "a": a.id, "b": b.id, "c": c.id, "d": d.id,
        "a1": a1.id, "a2": a2.id, "a3": a3.id, "a4": a4.id, "a5": a5.id,
        "b1": b1.id, "c1": c1.id, "d1": d1.id, "d2": d2.id,
    }))
finally:
    db.close()
`);
    return parseMarker<Fixtures>(output, 'FIXTURES');
}

function cleanupFixtures(): void {
    runPython(`
from db.database import SessionLocal
from models.squad import Squad
from models.apero import Apero, AperoParticipant

PREFIX = ${JSON.stringify(PREFIX)}

db = SessionLocal()
try:
    for existing in db.query(Squad).filter(Squad.name.like(PREFIX + "%")).all():
        for item in db.query(Apero).filter(Apero.squad_id == existing.id).all():
            db.query(AperoParticipant).filter(
                AperoParticipant.apero_id == item.id,
            ).delete(synchronize_session=False)
            db.delete(item)
        existing.members.clear()
        db.delete(existing)
    db.commit()
    print("CLEANED")
finally:
    db.close()
`);
}

interface AperoRow {
    id: number;
    latitude: number;
    longitude: number;
    status: string;
}

function aperoRows(ids: number[]): AperoRow[] {
    const output = runPython(`
import json
from db.database import SessionLocal
from models.apero import Apero
db = SessionLocal()
try:
    rows = db.query(Apero).filter(Apero.id.in_(${JSON.stringify(ids)})).all()
    print("ROWS=" + json.dumps([
        {"id": row.id, "latitude": row.latitude, "longitude": row.longitude,
         "status": row.status.name} for row in rows
    ]))
finally:
    db.close()
`);
    return parseMarker<AperoRow[]>(output, 'ROWS');
}

function joinedParticipants(aperoId: number): number {
    const output = runPython(`
import json
from db.database import SessionLocal
from models.apero import AperoParticipant, ParticipationStatus
db = SessionLocal()
try:
    count = db.query(AperoParticipant).filter(
        AperoParticipant.apero_id == ${aperoId},
        AperoParticipant.status == ParticipationStatus.JOINED,
    ).count()
    print("JOINED=" + json.dumps(count))
finally:
    db.close()
`);
    return parseMarker<number>(output, 'JOINED');
}

function endApero(aperoId: number): void {
    runPython(`
from datetime import datetime, timezone
from db.database import SessionLocal
from models.apero import Apero, AperoStatus
db = SessionLocal()
try:
    item = db.query(Apero).filter(Apero.id == ${aperoId}).one()
    item.status = AperoStatus.ENDED
    item.ended_at = datetime.now(timezone.utc)
    db.commit()
    print("ENDED")
finally:
    db.close()
`);
}

function insertHotApero(squadId: number, name: string): number {
    const output = runPython(`
import json
from datetime import datetime, timedelta, timezone
from db.database import SessionLocal
from models.user import User
from models.apero import Apero, AperoStatus
db = SessionLocal()
try:
    demo = db.query(User).filter_by(username="FluiditeDemo").one()
    item = Apero(squad_id=${squadId}, creator_id=demo.id, location_name=${JSON.stringify(name)},
                 latitude=48.6100, longitude=2.6100, status=AperoStatus.ACTIVE,
                 started_at=datetime.now(timezone.utc) - timedelta(minutes=5))
    db.add(item)
    db.commit()
    print("HOT=" + json.dumps({"id": item.id}))
finally:
    db.close()
`);
    return parseMarker<{ id: number }>(output, 'HOT').id;
}

function deleteAperosByName(like: string): void {
    runPython(`
from db.database import SessionLocal
from models.apero import Apero, AperoParticipant
db = SessionLocal()
try:
    rows = db.query(Apero).filter(Apero.location_name.like(${JSON.stringify(like)})).all()
    for item in rows:
        db.query(AperoParticipant).filter(
            AperoParticipant.apero_id == item.id,
        ).delete(synchronize_session=False)
        db.delete(item)
    db.commit()
    print("DELETED")
finally:
    db.close()
`);
}

async function waitForMap(page: Page): Promise<void> {
    await page.waitForFunction(
        () => Boolean((window as { __beercallMap?: unknown }).__beercallMap),
        undefined,
        { timeout: 30_000 },
    );
    await expect(page.locator('.maplibregl-canvas').first()).toBeVisible({ timeout: 20_000 });
}

async function openSquad(page: Page, squadId: number): Promise<void> {
    await page.goto(`/squad/${squadId}`);
    await expect(page.locator('[data-bottom-nav]')).toBeVisible({ timeout: 30_000 });
    await waitForMap(page);
    // Les totems et le nom de squad dépendent de la même réponse : attendre
    // l'identité évite de cliquer sur une carte encore vide sur une page froide.
    await expect(page.locator('[data-dashboard-identity] h2')).toBeVisible({ timeout: 30_000 });
}

async function focusMap(
    page: Page,
    center: [number, number],
    zoom: number,
    bearing = 0,
): Promise<void> {
    await page.evaluate(({ center, zoom, bearing }) => {
        const map = (window as unknown as {
            __beercallMap?: {
                jumpTo: (options: {
                    center: [number, number];
                    zoom: number;
                    bearing: number;
                }) => void;
            };
        }).__beercallMap;
        if (!map) throw new Error('Carte MapLibre absente');
        // Deux sauts : le second garantit un événement de zoom même si la
        // valeur initiale était déjà le bucket visé.
        map.jumpTo({ center, zoom: Math.max(0, zoom - 0.5), bearing });
        map.jumpTo({ center, zoom, bearing });
    }, { center, zoom, bearing });
    await expect.poll(() => mapZoom(page), { timeout: 10_000 }).toBeGreaterThan(zoom - 0.01);
}

async function mapZoom(page: Page): Promise<number> {
    return page.evaluate(() => {
        const map = (window as unknown as { __beercallMap?: { getZoom: () => number } })
            .__beercallMap;
        if (!map) throw new Error('Carte MapLibre absente');
        return map.getZoom();
    });
}

async function mapCenter(page: Page): Promise<{ lng: number; lat: number }> {
    return page.evaluate(() => {
        const map = (window as unknown as {
            __beercallMap?: { getCenter: () => { lng: number; lat: number } };
        }).__beercallMap;
        if (!map) throw new Error('Carte MapLibre absente');
        const center = map.getCenter();
        return { lng: center.lng, lat: center.lat };
    });
}

async function revalidate(page: Page): Promise<void> {
    // La couche écoute `online` et invalide les requêtes actives : vraie
    // revalidation React Query, sans rechargement de document.
    await page.evaluate(() => {
        window.dispatchEvent(new Event('online'));
    });
}

async function reloadSentinel(page: Page): Promise<void> {
    await page.evaluate(() => {
        (window as unknown as { __e2eNoReload?: string }).__e2eNoReload = 'kept';
    });
}

async function sentinelValue(page: Page): Promise<string | undefined> {
    return page.evaluate(
        () => (window as unknown as { __e2eNoReload?: string }).__e2eNoReload,
    );
}

function activeSingles(page: Page) {
    // Les proxies individuels actifs exposent un attribut stable, indépendant
    // du rendu visuel des totems.
    return page.locator('.maplibregl-marker [data-apero-marker="single"][data-apero-status="active"]');
}

async function waitForTotemHit(page: Page, x: number, y: number): Promise<void> {
    await expect.poll(() => page.evaluate(({x, y}) => {
        const map = (window as unknown as {
            __beercallMap?: {
                queryRenderedFeatures?: (point: [number, number], options?: {layers?: string[]}) => unknown[];
            };
        }).__beercallMap;
        if (!map?.queryRenderedFeatures) return 0;
        try {
            return map.queryRenderedFeatures([x, y], {layers: ['apero-totems']}).length;
        } catch {
            return 0;
        }
    }, {x, y}), {timeout: 20_000}).toBeGreaterThan(0);
}

async function tapTotem(page: Page, target: Locator): Promise<void> {
    const box = await target.boundingBox();
    if (!box) throw new Error('Totem non mesurable');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await waitForTotemHit(page, x, y);
    await page.mouse.click(x, y);
}

test.describe('14c — regroupement visuel des apéros', () => {
    test.beforeAll(() => {
        isolationConfirmed = false;
        assertReleaseIsolation(process.env.FLUIDITE_BASE_URL);
        isolationConfirmed = true;
        fixtures = seedFixtures();
    });

    test.afterAll(() => {
        // Playwright exécute aussi afterAll quand beforeAll a échoué : aucune
        // écriture n'est autorisée si la garde n'a jamais accepté cette pile.
        if (!isolationConfirmed) return;
        assertReleaseIsolation(process.env.FLUIDITE_BASE_URL);
        cleanupFixtures();
    });

    test('Compteur d\'apéros, groupe au dézoom et séparation au zoom sans action métier', async ({
        page,
        request,
    }) => {
        await loginAs(page, request, 'FluiditeDemo');
        await openSquad(page, fixtures.a);
        await focusMap(page, NEAR_CENTER, 14);

        const groupTwo = page.locator('button[aria-label^="2 apéros regroupés"]');
        const groupThree = page.locator('button[aria-label^="3 apéros regroupés"]');
        await expect(groupTwo).toBeVisible();
        await expect(groupThree).toBeVisible();

        const label = (await groupThree.getAttribute('aria-label')) ?? '';
        expect(label.startsWith('3 apéros regroupés.')).toBe(true);
        expect(label).not.toMatch(/^4 apéros/);
        expect(label).toContain('Dont actif, programmé et passé.');
        // Le compteur affiché est celui des apéros, pas des participants.
        expect(joinedParticipants(fixtures.a3)).toBe(4);

        const zoomBefore = await mapZoom(page);
        await tapTotem(page, groupTwo);
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(page.getByRole('heading', { name: 'Appel aux armes !' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Fermer les mondes' })).toHaveCount(0);
        await expect(page.getByRole('heading', { name: "Programmer l'Apéro" })).toHaveCount(0);
        await expect.poll(() => mapZoom(page), { timeout: 10_000 })
            .toBeGreaterThan(zoomBefore + 0.25);

        await expect(groupTwo).toHaveCount(0);
        const singles = activeSingles(page);
        await expect(singles).toHaveCount(2);

        const opened: string[] = [];
        for (let index = 0; index < 2; index += 1) {
            await tapTotem(page, singles.nth(index));
            const heading = page.getByRole('heading', { name: 'Appel aux armes !' });
            await expect(heading).toBeVisible();
            const modal = heading.locator('xpath=../..');
            const location = modal.getByRole('heading', {
                level: 3,
                name: /^E2E Proche A[12]$/,
            });
            await expect(location).toBeVisible();
            opened.push((await location.textContent())?.trim() ?? '');
            await heading.locator('xpath=..').getByRole('button').click();
            await expect(heading).toHaveCount(0);
        }
        expect(opened.sort()).toEqual(['E2E Proche A1', 'E2E Proche A2']);
    });

    test('Groupe inséparable : feuille, focus, Échap et trois actions individuelles', async ({
        page,
        request,
    }) => {
        await loginAs(page, request, 'FluiditeDemo');
        await openSquad(page, fixtures.a);
        await expect(page.getByRole('button', { name: 'Me recentrer' })).toBeVisible({
            timeout: 30_000,
        });
        await focusMap(page, SAME_CENTER, 14);

        const rows = aperoRows([fixtures.a3, fixtures.a4, fixtures.a5]);
        expect(rows).toHaveLength(3);
        const points = new Set(rows.map((row) => `${row.latitude},${row.longitude}`));
        expect(points.size).toBe(1);

        const groupThree = page.locator('button[aria-label^="3 apéros regroupés"]');
        await expect(groupThree).toHaveAttribute('aria-label', /Appuyer pour choisir un apéro\./);
        await tapTotem(page, groupThree);

        const dialog = page.getByRole('dialog', { name: 'Apéros au même endroit' });
        await expect(dialog).toBeVisible();
        const close = dialog.getByRole('button', { name: 'Fermer' });
        await expect(close).toBeFocused();
        const members = dialog.locator('ul li button');
        await expect(members).toHaveCount(3);
        await expect(members.nth(0)).toContainText('E2E Serre Actif');
        await expect(members.nth(0)).toContainText("Voir l'apéro");
        await expect(members.nth(1)).toContainText('E2E Serre Programme');
        await expect(members.nth(1)).toContainText('Participer');
        await expect(members.nth(2)).toContainText('E2E Serre Passe');
        await expect(members.nth(2)).toContainText('Voir le monde');

        // Piège de focus : depuis « Fermer », Shift+Tab atteint le dernier membre.
        await page.keyboard.press('Shift+Tab');
        await expect(members.nth(2)).toBeFocused();
        // Échap ferme et rend le focus au déclencheur.
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(groupThree).toBeFocused();

        // 1/3 — apéro actif sans participation : Appel aux armes.
        await tapTotem(page, groupThree);
        await expect(dialog).toBeVisible();
        await members.nth(0).click();
        await expect(dialog).toHaveCount(0);
        const respond = page.getByRole('heading', { name: 'Appel aux armes !' });
        await expect(respond).toBeVisible();
        await expect(respond.locator('xpath=../..').getByRole('heading', {
            level: 3,
            name: 'E2E Serre Actif',
        })).toBeVisible();
        await respond.locator('xpath=..').getByRole('button').click();
        await expect(respond).toHaveCount(0);

        // 2/3 — apéro programmé : appareil photo, puis démarrage conservé.
        await tapTotem(page, groupThree);
        await expect(dialog).toBeVisible();
        const chooser = page.waitForEvent('filechooser');
        await members.nth(1).click();
        await (await chooser).setFiles({ name: 'e2e.png', mimeType: 'image/png', buffer: PNG });
        await expect(dialog).toHaveCount(0);
        const start = page.getByRole('heading', { name: "Démarrer l'Apéro" });
        await expect(start).toBeVisible({ timeout: 20_000 });
        await expect(start.locator('xpath=../..').getByPlaceholder('Ex: Bar Le Central...'))
            .toHaveValue('E2E Serre Programme');
        await start.locator('xpath=..').getByRole('button').click();
        await expect(start).toHaveCount(0);

        // 3/3 — apéro passé : Les 3 Mondes.
        await tapTotem(page, groupThree);
        await expect(dialog).toBeVisible();
        await members.nth(2).click();
        await expect(dialog).toHaveCount(0);
        const worlds = page.getByRole('button', { name: 'Fermer les mondes' });
        await expect(worlds).toBeVisible({ timeout: 20_000 });
        await expect(page.getByRole('heading', { name: 'Les 3 Mondes' })).toBeVisible();
        await worlds.click();
        await expect(worlds).toHaveCount(0);
    });

    test('Mise à jour et retrait à chaud, puis recomposition, sans rechargement', async ({
        page,
        request,
    }) => {
        await loginAs(page, request, 'FluiditeDemo');
        await openSquad(page, fixtures.d);
        await focusMap(page, HOT_CENTER, 14);
        await reloadSentinel(page);

        const groupTwo = page.locator('button[aria-label^="2 apéros regroupés"]');
        await expect(groupTwo).toBeVisible();
        await tapTotem(page, groupTwo);
        const dialog = page.getByRole('dialog', { name: 'Apéros au même endroit' });
        await expect(dialog).toBeVisible();
        const members = dialog.locator('ul li button');
        await expect(members).toHaveCount(2);
        await expect(members.nth(0)).toContainText("Voir l'apéro");

        // Mise à jour à chaud : le membre devient passé, la feuille ouverte suit.
        endApero(fixtures.d1);
        await revalidate(page);
        await expect(members).toHaveCount(2, { timeout: 20_000 });
        await expect(members.nth(1)).toContainText('E2E Chaud A');
        await expect(members.nth(1)).toContainText('Passé');
        await expect(members.nth(1)).toContainText('Voir le monde');
        await expect(members.nth(0)).toContainText('E2E Chaud B');
        await expect(members.nth(0)).toContainText("Voir l'apéro");

        // Retrait à chaud : le membre supprimé quitte la feuille ouverte.
        deleteAperosByName('E2E Chaud B');
        await revalidate(page);
        await expect(members).toHaveCount(1, { timeout: 20_000 });
        await expect(members.nth(0)).toContainText('E2E Chaud A');

        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);

        // Ajout à chaud : la pastille recompte les apéros sans rechargement.
        insertHotApero(fixtures.d, 'E2E Chaud C');
        await revalidate(page);
        await expect(groupTwo).toBeVisible({ timeout: 20_000 });
        await expect(groupTwo).toHaveAttribute(
            'aria-label',
            /^2 apéros regroupés\..*Dont actif et passé\./,
        );
        expect(await sentinelValue(page)).toBe('kept');

        // Tout retirer ferme le groupe et la feuille restée sans membre.
        await tapTotem(page, groupTwo);
        await expect(dialog).toBeVisible();
        await expect(members).toHaveCount(2);
        deleteAperosByName('E2E Chaud %');
        await revalidate(page);
        await expect(dialog).toHaveCount(0, { timeout: 20_000 });
        await expect(page.locator('.maplibregl-marker')).toHaveCount(0, { timeout: 20_000 });
        await expect(page.locator('button[aria-label*="apéros regroupés"]')).toHaveCount(0);

        insertHotApero(fixtures.d, 'E2E Chaud Solo');
        await revalidate(page);
        await expect(page.locator('.maplibregl-marker')).toHaveCount(1, { timeout: 20_000 });
        await expect(activeSingles(page)).toHaveCount(1);
        await expect(dialog).toHaveCount(0);
        expect(await sentinelValue(page)).toBe('kept');
    });

    test('Changement de squad : la feuille ne survit pas et les groupes suivent', async ({
        page,
        request,
    }) => {
        await loginAs(page, request, 'FluiditeDemo');
        await page.goto('/dashboard');
        await expect(page.locator('[data-bottom-nav]')).toBeVisible({ timeout: 30_000 });
        await reloadSentinel(page);

        await page.getByRole('button', { name: 'E2E Groupes A', exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`/squad/${fixtures.a}$`));
        await waitForMap(page);
        await focusMap(page, SAME_CENTER, 14);

        const groupThree = page.locator('button[aria-label^="3 apéros regroupés"]');
        await expect(groupThree).toBeVisible();
        await tapTotem(page, groupThree);
        const dialog = page.getByRole('dialog', { name: 'Apéros au même endroit' });
        await expect(dialog).toBeVisible();

        // Sortie de route sans rechargement : la couche inactive démonte la feuille.
        await page.goBack();
        await expect(page).toHaveURL(/\/dashboard$/);
        await expect(dialog).toHaveCount(0);
        expect(await sentinelValue(page)).toBe('kept');

        await page.goForward();
        await expect(page).toHaveURL(new RegExp(`/squad/${fixtures.a}$`));
        await expect(dialog).toHaveCount(0);
        await waitForMap(page);
        await focusMap(page, SAME_CENTER, 14);
        await expect(page.locator('button[aria-label^="3 apéros regroupés"]')).toBeVisible();

        // Changement de squad dans l'application : plus aucune donnée de A.
        await page.getByRole('button', { name: 'E2E Groupes B', exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`/squad/${fixtures.b}$`));
        await waitForMap(page);
        await expect(dialog).toHaveCount(0);
        await expect(page.getByText('E2E Serre Actif')).toHaveCount(0);
        await expect(page.locator('button[aria-label*="apéros regroupés"]')).toHaveCount(0);
        await expect(activeSingles(page)).toHaveCount(1);
        expect(await sentinelValue(page)).toBe('kept');
    });

    test('Confidentialité inter-squads : les apéros d\'une squad non rejointe restent inaccessibles', async ({
        page,
        request,
    }) => {
        const session = await loginAs(page, request, 'FluiditeDemo');
        const headers = { Authorization: `Bearer ${session.accessToken}` };

        const denied = await request.get(`/api/squads/${fixtures.c}`, { headers });
        expect(denied.status()).toBe(403);
        const listed = await request.get('/api/squads/', { headers });
        expect(listed.ok()).toBeTruthy();
        const squads = (await listed.json()) as Array<{ id: number }>;
        expect(squads.some((squad) => squad.id === fixtures.c)).toBe(false);

        await openSquad(page, fixtures.a);
        await focusMap(page, SAME_CENTER, 14);
        await expect(page.locator('button[aria-label^="3 apéros regroupés"]')).toBeVisible();
        await expect(page.getByText('E2E Cache C')).toHaveCount(0);

        await page.goto(`/squad/${fixtures.c}`);
        await expect(page.getByText(/Accès à cette squad refusé|Squad introuvable/))
            .toBeVisible({ timeout: 20_000 });
        await expect(page.getByText('E2E Cache C')).toHaveCount(0);
        await expect(page.locator('button[aria-label*="apéros regroupés"]')).toHaveCount(0);
        await expect(page.locator('.maplibregl-marker')).toHaveCount(0);
    });

    test.describe('Carte tournée, petit viewport et animations réduites', () => {
        test.use({ viewport: { width: 320, height: 568 } });

        test('Groupe, séparation et feuille restent utilisables', async ({ page, request }) => {
            await page.emulateMedia({ reducedMotion: 'reduce' });
            await loginAs(page, request, 'FluiditeDemo');
            await openSquad(page, fixtures.a);
            expect(await page.evaluate(
                () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
            )).toBe(true);
            await focusMap(page, SMALL_SAME_CENTER, 14, 40);

            // Feuille des inséparables sur carte tournée et écran étroit.
            const groupThree = page.locator('button[aria-label^="3 apéros regroupés"]');
            await expect(groupThree).toBeVisible();
            await tapTotem(page, groupThree);
            const dialog = page.getByRole('dialog', { name: 'Apéros au même endroit' });
            await expect(dialog).toBeVisible();
            const box = await dialog.boundingBox();
            expect(box?.width ?? 0).toBeLessThanOrEqual(320);
            await expect(dialog.locator('ul li button')).toHaveCount(3);
            await page.keyboard.press('Escape');
            await expect(dialog).toHaveCount(0);

            // Expansion sans action métier, même avec réduction des animations.
            await focusMap(page, SMALL_NEAR_CENTER, 14, 40);
            const groupTwo = page.locator('button[aria-label^="2 apéros regroupés"]');
            await expect(groupTwo).toBeVisible();
            await tapTotem(page, groupTwo);
            await expect(page.getByRole('dialog')).toHaveCount(0);
            await expect.poll(() => mapZoom(page), { timeout: 10_000 }).toBeGreaterThan(14.25);
            await expect(groupTwo).toHaveCount(0);
            await expect(activeSingles(page)).toHaveCount(2);
        });
    });

    test('Non-régression : appui long, gestes de carte et avatars', async ({ page, request }, testInfo) => {
        await loginAs(page, request, 'FluiditeDemo');
        await openSquad(page, fixtures.a);
        await focusMap(page, SAME_CENTER, 14);

        // Avatars : la source Snap existe toujours, aucun SafeAvatar sur la carte.
        expect(await page.evaluate(() => {
            const map = (window as unknown as {
                __beercallMap?: { getSource?: (id: string) => unknown };
            }).__beercallMap;
            return Boolean(map?.getSource?.('snap-people'));
        })).toBe(true);
        await expect(page.locator('[data-testid="safe-avatar"]')).toHaveCount(0);

        // Appui long sur un groupe : aucune création programmée.
        const groupThree = page.locator('button[aria-label^="3 apéros regroupés"]');
        await expect(groupThree).toBeVisible();
        const box = await groupThree.boundingBox();
        if (!box) throw new Error('Groupe non mesurable');
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        await waitForTotemHit(page, x, y);
        const zoomBefore = await mapZoom(page);
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.waitForTimeout(900);
        await expect(page.getByRole('heading', { name: "Programmer l'Apéro" })).toHaveCount(0);
        expect(await mapZoom(page)).toBeCloseTo(zoomBefore, 5);
        await page.mouse.up();

        // Le relâchement reste l'action de groupe : la feuille s'ouvre.
        const dialog = page.getByRole('dialog', { name: 'Apéros au même endroit' });
        await expect(dialog).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);

        // Appui long hors marqueur : la création programmée est conservée.
        await page.evaluate((center) => {
            const map = (window as unknown as {
                __beercallMap?: { fire: (type: string, event: unknown) => void };
            }).__beercallMap;
            if (!map) throw new Error('Carte MapLibre absente');
            map.fire('mousedown', {
                point: { x: 380, y: 200 },
                lngLat: { lng: center[0], lat: center[1], toArray: () => center },
                originalEvent: { target: document.body, touches: undefined },
            });
        }, SAME_CENTER);
        const schedule = page.getByRole('heading', { name: "Programmer l'Apéro" });
        await expect(schedule).toBeVisible({ timeout: 10_000 });
        await schedule.locator('xpath=..').getByRole('button').click();
        await expect(schedule).toHaveCount(0);

        // Pan et zoom conservés avec la couche de groupes montée.
        const canvas = page.locator('.maplibregl-canvas').first();
        const mapBox = await canvas.boundingBox();
        if (!mapBox) throw new Error('Carte non mesurable');
        const centerBefore = await mapCenter(page);
        const panX = mapBox.x + mapBox.width * 0.25;
        const panY = mapBox.y + 200;
        await page.mouse.move(panX, panY);
        await page.mouse.down();
        await page.mouse.move(panX + 60, panY + 40, { steps: 6 });
        await page.mouse.up();
        await expect.poll(async () => {
            const after = await mapCenter(page);
            return Math.abs(after.lng - centerBefore.lng) + Math.abs(after.lat - centerBefore.lat);
        }, { timeout: 10_000 }).toBeGreaterThan(0);

        const zoomBeforeWheel = await mapZoom(page);
        // Point haut de la carte : la barre basse (timeline + dock) ne doit pas
        // intercepter la molette.
        await page.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + 160);
        await page.mouse.wheel(0, -300);
        await expect.poll(() => mapZoom(page), { timeout: 10_000 })
            .toBeGreaterThan(zoomBeforeWheel);
        await expect.poll(
            () => page.locator('button[aria-label*="apéros regroupés"]').count(),
            { timeout: 10_000 },
        ).toBeGreaterThan(0);

        // Vrai recouvrement : déplacer un apéro synthétique sous un avatar,
        // sans modifier les personnes ni les sources/caches du frontend.
        await focusMap(page, [2.3522, 48.8566], 20);
        const readAvatar = () => page.evaluate(() => {
            const map = (window as unknown as {__beercallMap?: {
                queryRenderedFeatures: (point: undefined, options: {layers: string[]}) => Array<{
                    properties?: {id?: string; size?: number}; geometry?: {coordinates?: number[]};
                }>;
            }}).__beercallMap;
            const actor = map?.queryRenderedFeatures(undefined, {layers: ['snap-avatars']})
                .find((feature) => Number(feature.properties?.size) === 1 && feature.geometry?.coordinates?.length === 2);
            return actor ? {id: String(actor.properties?.id), coordinates: actor.geometry!.coordinates! as [number, number]} : null;
        });
        await expect.poll(readAvatar, {timeout: 20_000}).not.toBeNull();
        const avatar = await readAvatar();
        if (!avatar) throw new Error('Avatar individuel absent pour le contrôle de priorité');
        runPython(`
from db.database import SessionLocal
from models.apero import Apero
db = SessionLocal()
try:
    item = db.query(Apero).filter(Apero.id == ${fixtures.a1}).one()
    item.longitude = ${avatar.coordinates[0]}
    item.latitude = ${avatar.coordinates[1]}
    db.commit()
finally:
    db.close()
`);
        await revalidate(page);
        const hit = await page.evaluate((coordinates) => {
            const map = (window as unknown as {__beercallMap?: {
                project: (coordinates: [number, number]) => {x: number; y: number};
                getStyle: () => {layers: Array<{id: string}>};
            }}).__beercallMap;
            if (!map) throw new Error('Carte absente');
            const layers = map.getStyle().layers.map((layer) => layer.id);
            if (layers.indexOf('apero-totems') >= layers.indexOf('snap-avatars')) throw new Error('Totems devant les avatars');
            const projected = map.project(coordinates);
            return {x: projected.x, y: projected.y - 35};
        }, avatar.coordinates);
        await waitForTotemHit(page, hit.x, hit.y);
        const expectedProfile = await page.evaluate(({x, y}) => {
            const map = (window as unknown as {__beercallMap?: {
                queryRenderedFeatures: (point: [number, number], options: {layers: string[]}) => Array<{properties?: {id?: string; size?: number}}>;
            }}).__beercallMap;
            const actor = map?.queryRenderedFeatures([x, y], {layers: ['snap-avatars']})[0];
            return Number(actor?.properties?.size) === 1 ? String(actor?.properties?.id) : null;
        }, hit);
        expect(expectedProfile, 'Un avatar individuel doit recevoir le tap de recouvrement').not.toBeNull();
        await page.screenshot({path: testInfo.outputPath('avatar-priority.png')});
        await page.mouse.click(hit.x, hit.y);
        await expect(page).toHaveURL(new RegExp(`/profile/${expectedProfile}$`));
        await expect(page.getByRole('heading', {name: 'Appel aux armes !'})).toHaveCount(0);
    });
});
