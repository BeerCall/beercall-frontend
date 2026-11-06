import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

export function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

const HEX_64 = /^[0-9a-f]{64}$/;
const PACKS = new Set(['idle', 'deferred']);
const THUMBNAIL_WIDTH = 192;
const THUMBNAIL_HEIGHT = 192;
const THUMBNAIL_BORDER = 4;

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
    assert(value && typeof value === 'object', `Clip ${entry.name}: vignette ${gender} manquante.`);
    assert(typeof value.url === 'string'
      && value.url.startsWith('/animations/thumbnails/')
      && value.url.endsWith('.webp')
      && !value.url.includes('..'),
      `Clip ${entry.name}: URL de vignette ${gender} invalide (${value.url}).`);
    assert(typeof value.sha256 === 'string' && HEX_64.test(value.sha256),
      `Clip ${entry.name}: sha256 de vignette ${gender} invalide.`);
    assert(Number.isSafeInteger(value.bytes) && value.bytes > 0,
      `Clip ${entry.name}: taille de vignette ${gender} invalide.`);
    assert(value.width === THUMBNAIL_WIDTH && value.height === THUMBNAIL_HEIGHT,
      `Clip ${entry.name}: dimensions de vignette ${gender} invalides (${value.width}x${value.height}).`);
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

export async function checkThumbnailFile(dir, thumbnail, clipName, gender) {
  const relativeUrl = thumbnail.url.replace(/^\/animations\//, '');
  const filePath = join(dir, relativeUrl);
  let buffer;
  try {
    buffer = await readFile(filePath);
  } catch (err) {
    throw new Error(`Vignette ${gender} de ${clipName} introuvable (${filePath}): ${err.message}`);
  }

  const actualHash = sha256Hex(buffer);
  assert(actualHash === thumbnail.sha256,
    `Vignette ${gender} de ${clipName}: sha256 non conforme (attendu ${thumbnail.sha256}, calculé ${actualHash}).`);
  assert(buffer.byteLength === thumbnail.bytes,
    `Vignette ${gender} de ${clipName}: ${buffer.byteLength} octets au lieu de ${thumbnail.bytes}.`);

  const meta = await sharp(buffer).metadata();
  assert(meta.width === THUMBNAIL_WIDTH && meta.height === THUMBNAIL_HEIGHT,
    `Vignette ${gender} de ${clipName}: dimensions ${meta.width}x${meta.height}.`);
  assert(meta.hasAlpha, `Vignette ${gender} de ${clipName}: canal alpha manquant.`);

  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert(info.channels === 4, `Vignette ${gender} de ${clipName}: canaux inattendus (${info.channels}).`);
  const { width, height, channels } = info;
  const alphaAt = (x, y) => data[(y * width + x) * channels + 3];

  // Anti-rognage : les 4 px du bord doivent être entièrement transparents.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inside = x >= THUMBNAIL_BORDER && x < width - THUMBNAIL_BORDER
        && y >= THUMBNAIL_BORDER && y < height - THUMBNAIL_BORDER;
      if (inside) continue;
      if (alphaAt(x, y) !== 0) {
        throw new Error(`Vignette ${gender} de ${clipName}: rognage détecté à (${x},${y}) dans la marge de ${THUMBNAIL_BORDER} px.`);
      }
    }
  }

  // Remplissage linéaire : plus grande dimension de la bbox visible / 192.
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alphaAt(x, y) === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  assert(maxX >= 0, `Vignette ${gender} de ${clipName}: aucun pixel visible.`);
  const fill = Math.max(maxX - minX + 1, maxY - minY + 1) / Math.max(width, height);
  return { fill, bytes: buffer.byteLength };
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

  // Un clip retiré ne doit laisser ni pack haché ni vignette orpheline.
  const referencedPacks = new Set([manifest.critical.file, manifest.deferred.file]);
  for (const name of await readdir(dir)) {
    if (/^(idle|deferred)\.[a-f0-9]{64}\.json$/.test(name) && !referencedPacks.has(name)) {
      throw new Error(`Pack orphelin dans ${dir}: ${name}`);
    }
  }
  const referencedThumbnails = new Set();
  for (const entry of entries) {
    for (const gender of ['Men', 'Women']) {
      const url = entry.thumbnails[gender]?.url;
      if (url) referencedThumbnails.add(url.split('/').pop());
    }
  }
  let thumbnailFiles = [];
  try {
    thumbnailFiles = await readdir(join(dir, 'thumbnails'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  for (const name of thumbnailFiles) {
    if (name !== '.gitkeep' && !referencedThumbnails.has(name)) {
      throw new Error(`Vignette orpheline dans ${dir}/thumbnails: ${name}`);
    }
  }

  let thumbnailCount = 0;
  let thumbnailBytes = 0;
  let fillMin = Infinity;
  let fillMax = 0;
  for (const entry of entries) {
    for (const gender of ['Men', 'Women']) {
      const result = await checkThumbnailFile(dir, entry.thumbnails[gender], entry.name, gender);
      thumbnailCount += 1;
      thumbnailBytes += result.bytes;
      fillMin = Math.min(fillMin, result.fill);
      fillMax = Math.max(fillMax, result.fill);
    }
  }

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
    thumbnailCount,
    thumbnailBytes,
    fillMin,
    fillMax,
  };
}

// Exécution directe CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const result = await checkAnimations();
    console.log(`[animations:check] Manifest et ${result.totalClips} animations vérifiés avec succès.`);
    console.log(`  - Pack critique: ${result.criticalFile} (${result.criticalBytes} octets, sha256: ${result.criticalHash.slice(0, 16)}...)`);
    console.log(`  - Pack différé:  ${result.deferredFile} (${result.deferredBytes} octets, sha256: ${result.deferredHash.slice(0, 16)}...)`);
    console.log(`  - Vignettes: ${result.thumbnailCount} (${result.thumbnailBytes} octets, remplissage ${(result.fillMin * 100).toFixed(1)} % - ${(result.fillMax * 100).toFixed(1)} %)`);
    process.exit(0);
  } catch (err) {
    console.error(`[animations:check] ERREUR: ${err.message}`);
    process.exit(1);
  }
}
