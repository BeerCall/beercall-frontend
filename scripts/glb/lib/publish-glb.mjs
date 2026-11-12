/**
 * A04 — Chaîne de publication d'un GLB, partagée pièces/accessoires/décors.
 *
 * Ordre imposé : merge des primitives par matériau → (resize décors) → weld →
 * WebP qualité 90 → Meshopt EN DERNIER (l'encodeur WebP désérialise le GLB et
 * perdrait EXT_meshopt_compression s'il tournait après le compresseur).
 *
 * Depuis `scripts/glb/lib`, la racine du projet est `../../../` (beercall-frontend),
 * pas `../../` : le CLI gltf-transform est celui du frontend.
 */
import { spawnSync } from 'node:child_process';
import { rmSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergePrimitivesByMaterial } from './merge-primitives.mjs';

export const root = fileURLToPath(new URL('../../../', import.meta.url));
const cli = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'gltf-transform.cmd' : 'gltf-transform');

function run(args) {
    let result = spawnSync(cli, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
    if (result.status !== 0) {
        // Windows rapporte parfois un échec transitoire pendant la libération
        // d'un handle ; une reprise propre suffit.
        result = spawnSync(cli, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
    }
    if (result.status !== 0) throw new Error(`gltf-transform ${args[0]} a échoué (code ${result.status})`);
}

/**
 * Publie `input` vers `output` avec la chaîne P14b.
 * @param {{webp?: boolean, resizeMax?: number|null}} [options]
 * @returns {Promise<{before:number, after:number, joinedGroups:number}>}
 */
export async function publishGlb(input, output, { webp = true, resizeMax = null } = {}) {
    const merged = `${output}.merged.glb`;
    const resized = `${output}.resized.glb`;
    const welded = `${output}.welded.glb`;
    const temporary = `${output}.webp.glb`;
    const stagedOutput = `${output}.staged.glb`;
    try {
        const counts = await mergePrimitivesByMaterial(input, merged);
        let current = merged;
        if (resizeMax) {
            run(['resize', current, resized, '--width', String(resizeMax), '--height', String(resizeMax)]);
            current = resized;
        }
        run(['weld', current, welded]);
        current = welded;
        if (webp) {
            run(['webp', current, temporary, '--quality', '90']);
            current = temporary;
        }
        run(['meshopt', current, stagedOutput]);
        // Ne publie qu'un fichier complet : un échec laisse l'ancien asset intact.
        renameSync(stagedOutput, output);
        return counts;
    } finally {
        for (const file of [merged, resized, welded, temporary, stagedOutput]) rmSync(file, { force: true });
    }
}
