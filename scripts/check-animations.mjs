import { readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

const HEX_64 = /^[0-9a-f]{64}$/;
const PACKS = new Set(['idle', 'deferred']);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateClipEntry(entry, index) {
  assert(entry && typeof entry === 'object', `Clip #${index} du manifeste invalide.`);
  assert(typeof entry.id === 'string' && entry.id.length > 0, `Clip #${index}: id manquant.`);
  assert(typeof entry.name === 'string' && entry.name.trim().length > 0, `Clip #${index}: nom manquant.`);
  assert(typeof entry.loop === 'boolean', `Clip ${entry.name}: boucle non booléenne.`);
  assert(typeof entry.duration === 'number' && Number.isFinite(entry.duration) && entry.duration > 0,
    `Clip ${entry.name}: durée invalide (${entry.duration}).`);
  assert(PACKS.has(entry.pack), `Clip ${entry.name}: pack invalide (${entry.pack}).`);
  assert(typeof entry.sourceSha256 === 'string' && HEX_64.test(entry.sourceSha256),
    `Clip ${entry.name}: sourceSha256 invalide.`);
  assert(entry.thumbnails && typeof entry.thumbnails === 'object',
    `Clip ${entry.name}: vignettes manquantes.`);
  for (const gender of ['Men', 'Women']) {
    const value = entry.thumbnails[gender];
    assert(value === null || (typeof value === 'string' && value.startsWith('/animations/')),
      `Clip ${entry.name}: vignette ${gender} invalide.`);
  }
  return entry;
}

function validateManifestStructure(manifest) {
  assert(manifest && typeof manifest === 'object', 'Manifeste invalide.');
  assert(manifest.formatVersion === 2, `FormatVersion invalide: attendu 2, reçu ${manifest.formatVersion}`);
  assert(typeof manifest.threeVersion === 'string' && manifest.threeVersion.length > 0, 'threeVersion manquante.');
  assert(Array.isArray(manifest.clips) && manifest.clips.length > 0, 'Le manifeste doit contenir des clips.');
  assert(manifest.critical && typeof manifest.critical === 'object', 'Section critical manquante.');
  assert(manifest.deferred && typeof manifest.deferred === 'object', 'Section deferred manquante.');

  const ids = new Set();
  const names = new Set();
  const entries = manifest.clips.map((entry, index) => {
    validateClipEntry(entry, index);
    assert(!ids.has(entry.id), `Identifiant de clip dupliqué: ${entry.id}.`);
    assert(!names.has(entry.name), `Nom de clip dupliqué: ${entry.name}.`);
    ids.add(entry.id);
    names.add(entry.name);
    return entry;
  });

  assert(names.has('Idle'), 'Le manifeste doit contenir le clip Idle.');
  const idleEntries = entries.filter(entry => entry.name === 'Idle');
  assert(idleEntries.length === 1, `Le clip Idle doit être unique, ${idleEntries.length} trouvé(s).`);
  assert(idleEntries[0].pack === 'idle', 'Idle doit appartenir au pack critique.');

  const criticalNames = entries.filter(entry => entry.pack === 'idle').map(entry => entry.name);
  const deferredNames = entries.filter(entry => entry.pack === 'deferred').map(entry => entry.name);
  assert(criticalNames.length === 1 && criticalNames[0] === 'Idle',
    `Le pack critique doit contenir uniquement Idle, reçu ${JSON.stringify(criticalNames)}.`);
  assert(deferredNames.length > 0, 'Le pack différé ne peut pas être vide.');

  const criticalClips = manifest.critical.clips;
  const deferredClips = manifest.deferred.clips;
  assert(Array.isArray(criticalClips), 'critical.clips doit être un tableau.');
  assert(Array.isArray(deferredClips), 'deferred.clips doit être un tableau.');
  assert(criticalClips.length === criticalNames.length && criticalNames.every(name => criticalClips.includes(name)),
    'critical.clips ne correspond pas aux clips du pack critique.');
  assert(deferredClips.length === deferredNames.length && deferredNames.every(name => deferredClips.includes(name)),
    'deferred.clips ne correspond pas aux clips du pack différé.');
  assert(!deferredClips.includes('Idle'), 'deferred.clips ne doit pas contenir Idle.');

  return { entries, criticalNames, deferredNames };
}

function validatePackShape(pack, expectedType, expectedNames, durations) {
  assert(pack && typeof pack === 'object', `Pack ${expectedType} invalide.`);
  assert(pack.pack === expectedType, `Type de pack invalide: attendu ${expectedType}, reçu ${pack.pack}.`);
  assert(pack.formatVersion === 2, `FormatVersion du pack ${expectedType} invalide.`);
  assert(Array.isArray(pack.clips), `Pack ${expectedType}: clips manquants.`);
  assert(pack.clips.length === expectedNames.length,
    `Pack ${expectedType}: ${pack.clips.length} clips au lieu de ${expectedNames.length}.`);

  const seen = new Set();
  for (const clip of pack.clips) {
    assert(clip && typeof clip === 'object' && typeof clip.name === 'string',
      `Pack ${expectedType}: clip invalide.`);
    assert(expectedNames.includes(clip.name), `Pack ${expectedType}: clip inattendu ${clip.name}.`);
    assert(!seen.has(clip.name), `Pack ${expectedType}: clip dupliqué ${clip.name}.`);
    seen.add(clip.name);
    assert(Array.isArray(clip.tracks) && clip.tracks.length > 0,
      `Pack ${expectedType}: clip ${clip.name} sans pistes.`);
    const expectedDuration = durations.get(clip.name);
    assert(typeof clip.duration === 'number' && Math.abs(clip.duration - expectedDuration) < 1e-6,
      `Pack ${expectedType}: durée de ${clip.name} différente du manifeste.`);
  }
  for (const name of expectedNames) {
    assert(seen.has(name), `Pack ${expectedType}: clip manquant ${name}.`);
  }
}

/**
 * Valide le manifeste v2 et les deux packs d'animation publiés dans public/animations.
 * Aucune liste de noms, aucun compte et aucun ordre ne sont codés en dur.
 * Fonctionne sans backend sibling (autonome dans CI/Docker).
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

  const { entries, criticalNames, deferredNames } = validateManifestStructure(manifest);
  const durations = new Map(entries.map(entry => [entry.name, entry.duration]));

  const loadPack = async (meta, expectedType, expectedNames) => {
    assert(meta && typeof meta === 'object', `Section ${expectedType} invalide.`);
    assert(meta.name === expectedType, `Nom du pack ${expectedType} invalide: ${meta.name}.`);
    assert(typeof meta.file === 'string' && meta.file === `${expectedType}.${meta.sha256}.json`,
      `Nom de fichier du pack ${expectedType} incohérent.`);
    assert(typeof meta.url === 'string' && meta.url === `/animations/${meta.file}`,
      `URL du pack ${expectedType} invalide.`);
    assert(typeof meta.sha256 === 'string' && HEX_64.test(meta.sha256),
      `Hash du pack ${expectedType} invalide.`);
    assert(Number.isSafeInteger(meta.byteLength) && meta.byteLength > 0,
      `Taille du pack ${expectedType} invalide.`);

    let buffer;
    try {
      buffer = await readFile(join(dir, meta.file));
    } catch (err) {
      throw new Error(`Pack ${expectedType} introuvable (${meta.file}): ${err.message}`);
    }

    const actualHash = sha256Hex(buffer);
    assert(actualHash === meta.sha256,
      `Hash du pack ${expectedType} non conforme: attendu ${meta.sha256}, calculé ${actualHash}`);
    assert(buffer.byteLength === meta.byteLength,
      `Taille du pack ${expectedType} non conforme: attendu ${meta.byteLength}, mesuré ${buffer.byteLength}`);

    let pack;
    try {
      pack = JSON.parse(buffer.toString('utf8'));
    } catch (err) {
      throw new Error(`Pack ${expectedType} JSON invalide: ${err.message}`);
    }
    validatePackShape(pack, expectedType, expectedNames, durations);

    return { meta, buffer, hash: actualHash };
  };

  const critical = await loadPack(manifest.critical, 'idle', criticalNames);
  const deferred = await loadPack(manifest.deferred, 'deferred', deferredNames);

  return {
    valid: true,
    manifestPath,
    criticalFile: critical.meta.file,
    criticalBytes: critical.buffer.byteLength,
    criticalHash: critical.hash,
    deferredFile: deferred.meta.file,
    deferredBytes: deferred.buffer.byteLength,
    deferredHash: deferred.hash,
    totalClips: entries.length,
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
