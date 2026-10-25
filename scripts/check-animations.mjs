import { readFile, access } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const EXPECTED_SOURCE_HASH = 'b455d642cd874130c3aba3ae03b207cc67c1817af3881cfbc3877e0921748d6e';

export const EXPECTED_CLIPS = [
  'Punch_Right',
  'Idle_Gun',
  'Sword_Slash',
  'Punch_Left',
  'Idle_Gun_Pointing',
  'Idle_Gun_Shoot',
  'Interact',
  'Idle_Neutral',
  'Kick_Left',
  'HitRecieve_2',
  'Run_Back',
  'Idle_Sword',
  'Run_Right',
  'Wave',
  'Kick_Right',
  'HitRecieve',
  'Run',
  'Gun_Shoot',
  'Walk',
  'Sitting',
  'Death',
  'Roll',
  'Run_Shoot',
  'Run_Left',
  'Idle',
];

export function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Valide le manifeste et les deux packs d'animation publiés dans public/animations.
 * Fonctionne sans backend sibling (autonome dans CI/Docker).
 * Conforme REV-03/07 : exige les deux packs référencés par le manifeste courant,
 * sans interdire la présence d'anciennes générations dans le dossier.
 */
export async function checkAnimations(animationsDir) {
  const dir = animationsDir || resolve(dirname(fileURLToPath(import.meta.url)), '../public/animations');
  const manifestPath = join(dir, 'manifest.json');

  let manifestRaw;
  try {
    manifestRaw = await readFile(manifestPath, 'utf8');
  } catch (err) {
    throw new Error(`Manifest introuvable dans ${manifestPath}: ${err.message}`);
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch (err) {
    throw new Error(`Manifest JSON invalide: ${err.message}`);
  }

  if (manifest.formatVersion !== 1) {
    throw new Error(`FormatVersion invalide: attendu 1, reçu ${manifest.formatVersion}`);
  }

  if (manifest.sourceHash !== EXPECTED_SOURCE_HASH) {
    throw new Error(`SourceHash invalide dans le manifest: ${manifest.sourceHash}`);
  }

  if (!Array.isArray(manifest.clips) || manifest.clips.length !== 25) {
    throw new Error(`Nombre de clips dans le manifest invalide: attendu 25, reçu ${manifest.clips?.length}`);
  }

  const clipSet = new Set(manifest.clips);
  for (const name of EXPECTED_CLIPS) {
    if (!clipSet.has(name)) {
      throw new Error(`Clip attendu manquant dans le manifest: ${name}`);
    }
  }

  if (!manifest.critical || typeof manifest.critical !== 'object') {
    throw new Error('Section critical manquante dans le manifest');
  }

  if (!manifest.deferred || typeof manifest.deferred !== 'object') {
    throw new Error('Section deferred manquante dans le manifest');
  }

  // Contrôle du pack critique (Idle)
  const criticalPath = join(dir, manifest.critical.file);
  let criticalBuf;
  try {
    criticalBuf = await readFile(criticalPath);
  } catch (err) {
    throw new Error(`Pack critique introuvable (${manifest.critical.file}): ${err.message}`);
  }

  const criticalActualHash = sha256Hex(criticalBuf);
  if (criticalActualHash !== manifest.critical.sha256) {
    throw new Error(`Hash du pack critique non conforme: attendu ${manifest.critical.sha256}, calculé ${criticalActualHash}`);
  }
  if (criticalBuf.byteLength !== manifest.critical.byteLength) {
    throw new Error(`Taille du pack critique non conforme: attendu ${manifest.critical.byteLength}, mesuré ${criticalBuf.byteLength}`);
  }
  if (!manifest.critical.clips?.includes('Idle')) {
    throw new Error('Le pack critique doit contenir le clip Idle');
  }

  // Contrôle du pack différé (24 clips restants)
  const deferredPath = join(dir, manifest.deferred.file);
  let deferredBuf;
  try {
    deferredBuf = await readFile(deferredPath);
  } catch (err) {
    throw new Error(`Pack différé introuvable (${manifest.deferred.file}): ${err.message}`);
  }

  const deferredActualHash = sha256Hex(deferredBuf);
  if (deferredActualHash !== manifest.deferred.sha256) {
    throw new Error(`Hash du pack différé non conforme: attendu ${manifest.deferred.sha256}, calculé ${deferredActualHash}`);
  }
  if (deferredBuf.byteLength !== manifest.deferred.byteLength) {
    throw new Error(`Taille du pack différé non conforme: attendu ${manifest.deferred.byteLength}, mesuré ${deferredBuf.byteLength}`);
  }
  if (!Array.isArray(manifest.deferred.clips) || manifest.deferred.clips.length !== 24) {
    throw new Error(`Nombre de clips dans le pack différé non conforme: attendu 24, reçu ${manifest.deferred.clips?.length}`);
  }

  return {
    valid: true,
    manifestPath,
    criticalFile: manifest.critical.file,
    criticalBytes: criticalBuf.byteLength,
    criticalHash: criticalActualHash,
    deferredFile: manifest.deferred.file,
    deferredBytes: deferredBuf.byteLength,
    deferredHash: deferredActualHash,
    totalClips: manifest.clips.length,
  };
}

// Exécution directe CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const result = await checkAnimations();
    console.log(`[animations:check] Manifest et ${result.totalClips} animations vérifiés avec succès.`);
    console.log(`  - Pack critique: ${result.criticalFile} (${result.criticalBytes} octets, sha256: ${result.criticalHash.slice(0, 16)}...)`);
    console.log(`  - Pack différé:  ${result.deferredFile} (${result.deferredBytes} octets, sha256: ${result.deferredHash.slice(0, 16)}...)`);
    process.exit(0);
  } catch (err) {
    console.error(`[animations:check] ERREUR: ${err.message}`);
    process.exit(1);
  }
}
