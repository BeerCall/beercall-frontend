import { test, expect } from './base';
import { execFileSync } from 'node:child_process';
import { loginAs } from './contextTracker';

const BACKEND_CONTAINER = process.env.FLUIDITE_BACKEND_CONTAINER || 'beercall-fluidite-night-backend-1';

function runPython(script: string): string {
    return execFileSync('docker', ['exec', '-i', BACKEND_CONTAINER, 'python', '-'], {
        input: script,
        encoding: 'utf8',
    });
}

function snapshotUserOne(): string {
    return runPython(`
import json
from db.database import SessionLocal
from models.user import User
from models.gamification import user_skins
db = SessionLocal()
try:
    user = db.query(User).filter(User.id == 1).one()
    skins = [row.skin_id for row in db.execute(user_skins.select().where(user_skins.c.user_id == 1))]
    print('SNAPSHOT=' + json.dumps({
        'capsules': user.capsules,
        'avatar_config': user.avatar_config,
        'avatar_config_hash': user.avatar_config_hash,
        'avatar_sprite_hash': user.avatar_sprite_hash,
        'avatar_render_status': user.avatar_render_status,
        'skins': skins,
    }))
finally:
    db.close()
`).match(/SNAPSHOT=(.*)/s)?.[1] ?? '';
}

function restoreUserOne(snapshot: string): void {
    runPython(`
import json
from db.database import SessionLocal
from models.user import User
from models.gamification import user_skins
snapshot = json.loads(r'''${snapshot}''')
db = SessionLocal()
try:
    user = db.query(User).filter(User.id == 1).one()
    user.capsules = snapshot['capsules']
    user.avatar_config = snapshot['avatar_config']
    user.avatar_config_hash = snapshot['avatar_config_hash']
    user.avatar_sprite_hash = snapshot['avatar_sprite_hash']
    user.avatar_render_status = snapshot['avatar_render_status']
    db.execute(user_skins.delete().where(user_skins.c.user_id == 1))
    for skin_id in snapshot['skins']:
        db.execute(user_skins.insert().values(user_id=1, skin_id=skin_id))
    db.commit()
    print('RESTORED')
finally:
    db.close()
`);
}

test('Profile : Trophées, achat gratuit, équipement et sauvegarde avec restauration', async ({ page, request }) => {
    const snapshot = snapshotUserOne();
    try {
        await loginAs(page, request, 'FluiditeDemo');
        await page.goto('/profile');
        await expect(page.getByRole('button', {name: 'Vestiaire', exact: true})).toBeVisible({timeout: 20_000});

        await page.getByRole('button', {name: 'Trophées', exact: true}).click();
        await expect(page.getByText(/Mes Trophées/)).toBeVisible({timeout: 10_000});
        await page.getByRole('button', {name: 'Vestiaire', exact: true}).click();
        await expect(page.getByRole('heading', {name: 'Vestiaire'})).toBeVisible({timeout: 10_000});

        // Achat d'un article gratuit dans l'onglet Tête.
        // Cibler le vrai bouton d'achat, pas la carte `div[role=button]` qui
        // contient aussi le texte « Gratuit ».
        const free = page.locator('button').filter({hasText: 'Gratuit'}).first();
        await expect(free).toBeVisible({timeout: 20_000});
        // La barre sticky peut recouvrir le bouton : on déclenche son handler
        // sans dépendre de l'empilement visuel.
        await free.evaluate((button) => (button as HTMLButtonElement).click());
        await expect(page.getByRole('heading', {name: 'Confirmation'})).toBeVisible({timeout: 10_000});
        await page.getByRole('button', {name: 'Acheter', exact: true}).click();
        await expect(page.getByText(/Achat validé/)).toBeVisible({timeout: 15_000});
        await expect(page.getByRole('heading', {name: 'Confirmation'})).toHaveCount(0, {timeout: 15_000});

        // Équiper l'article acheté puis sauvegarder la tenue.
        const owned = page.locator('div[role="button"]').filter({hasText: /Possédé|Équipé/}).first();
        await expect(owned).toBeVisible({timeout: 20_000});
        await owned.evaluate((card) => (card as HTMLElement).click());
        const save = page.getByRole('button', {name: /SAUVEGARDER LE STYLE/});
        await expect(save).toBeVisible({timeout: 10_000});
        await save.click();
        await expect(page.getByText(/Tenue sauvegardée/)).toBeVisible({timeout: 15_000});
    } finally {
        restoreUserOne(snapshot);
    }
});
