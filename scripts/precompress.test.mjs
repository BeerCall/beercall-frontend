import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  precompress,
  precompressFile,
  isCandidateFile,
  validateDirectorySecurity,
} from './precompress.mjs';

function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

test('isCandidateFile filtre scrupuleusement les extensions et exclut HTML/SW', () => {
  // Extensions candidates
  assert.equal(isCandidateFile('bundle.js'), true);
  assert.equal(isCandidateFile('styles.css'), true);
  assert.equal(isCandidateFile('data.json'), true);
  assert.equal(isCandidateFile('icon.svg'), true);
  assert.equal(isCandidateFile('manifest.webmanifest'), true);

  // Extensions exclues
  assert.equal(isCandidateFile('index.html'), false);
  assert.equal(isCandidateFile('sub/page.html'), false);
  assert.equal(isCandidateFile('bundle.js.gz'), false);
  assert.equal(isCandidateFile('image.png'), false);
  assert.equal(isCandidateFile('model.fbx'), false);

  // Service workers exclus quel que soit le chemin
  assert.equal(isCandidateFile('firebase-messaging-sw.js'), false);
  assert.equal(isCandidateFile('firebase-messaging-sw.mjs'), false);
  assert.equal(isCandidateFile('registerSW.js'), false);
  assert.equal(isCandidateFile('dist/registerSW.js'), false);
  assert.equal(isCandidateFile('sw.js'), false);
  assert.equal(isCandidateFile('path/to/sw.js'), false);
});

test('validateDirectorySecurity refuse les racines étrangères et accepte dist et temp', () => {
  const fakeDist = resolve('C:/Users/Migz3rrr/Delivery/BeerCall/beercall-frontend/dist');
  const tempDir = resolve(tmpdir(), 'precompress-test');

  // Dist et sous-dossiers autorisés
  assert.equal(validateDirectorySecurity(fakeDist, fakeDist), fakeDist);
  assert.equal(validateDirectorySecurity(join(fakeDist, 'assets'), fakeDist), join(fakeDist, 'assets'));

  // Temp autorisé
  assert.equal(validateDirectorySecurity(tempDir, fakeDist), tempDir);

  // Racines système ou dossiers hors périmètre refusés
  assert.throws(
    () => validateDirectorySecurity('C:/Windows', fakeDist),
    /Sécurité : la cible .* est refusée hors de dist\/temp/
  );
  assert.throws(
    () => validateDirectorySecurity(resolve('..'), fakeDist),
    /Sécurité : la cible .* est refusée hors de dist\/temp/
  );
  assert.throws(
    () => validateDirectorySecurity(resolve('src'), fakeDist),
    /Sécurité : la cible .* est refusée hors de dist\/temp/
  );
});

test('Gain vs non-gain : crée .gz uniquement si taille <= 95 % de l’original', async () => {
  const testDir = await mkdtemp(join(tmpdir(), 'precompress-gain-'));

  try {
    // 1. Fichier avec gain significatif (texte répétitif JSON de 20 Ko)
    const compressiblePath = join(testDir, 'large.json');
    const compressibleContent = JSON.stringify({ items: new Array(500).fill({ name: 'BeerCall', active: true }) });
    await writeFile(compressiblePath, compressibleContent, 'utf8');

    // 2. Fichier court sans gain possible (10 octets, gzip header > 20 octets -> ratio > 100%)
    const incompressiblePath = join(testDir, 'tiny.json');
    await writeFile(incompressiblePath, '{"a":1}', 'utf8');

    // 3. Fichier HTML (exclu)
    const htmlPath = join(testDir, 'index.html');
    await writeFile(htmlPath, '<html><body>BeerCall</body></html>', 'utf8');

    // 4. Service Worker (exclu)
    const swPath = join(testDir, 'registerSW.js');
    await writeFile(swPath, 'console.log("sw");', 'utf8');

    const result = await precompress(testDir);

    assert.equal(result.candidates, 2); // large.json et tiny.json
    assert.equal(result.compressedCount, 1); // large.json uniquement
    assert.equal(result.skippedCount, 1); // tiny.json ignoré car seuil 95% non atteint

    // Vérifier existence effective sur disque
    const gzBuf = await readFile(`${compressiblePath}.gz`);
    assert.ok(gzBuf.length <= Buffer.byteLength(compressibleContent) * 0.95);

    // Vérifier absence de .gz pour les fichiers exclus ou sans gain
    await assert.rejects(() => stat(`${incompressiblePath}.gz`));
    await assert.rejects(() => stat(`${htmlPath}.gz`));
    await assert.rejects(() => stat(`${swPath}.gz`));
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});

test('Déterminisme : deux exécutions successives génèrent des octets .gz strictement identiques', async () => {
  const testDir = await mkdtemp(join(tmpdir(), 'precompress-det-'));

  try {
    const filePath = join(testDir, 'code.js');
    const content = 'function test() { return "BeerCall deterministic gzip output"; }\n'.repeat(50);
    await writeFile(filePath, content, 'utf8');

    // Première passe
    const res1 = await precompressFile(filePath);
    assert.equal(res1.compressed, true);
    const gz1 = await readFile(`${filePath}.gz`);
    const hash1 = sha256Hex(gz1);

    // Supprimer et refaire la compression
    await rm(`${filePath}.gz`);
    const res2 = await precompressFile(filePath);
    assert.equal(res2.compressed, true);
    const gz2 = await readFile(`${filePath}.gz`);
    const hash2 = sha256Hex(gz2);

    assert.equal(hash1, hash2, 'Le hash gzip doit être strictement déterministe (mtime: 0)');
    assert.equal(gz1.length, gz2.length);
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});

test('Originaux inchangés : aucun fichier source n’est altéré ou écrasé', async () => {
  const testDir = await mkdtemp(join(tmpdir(), 'precompress-orig-'));

  try {
    const fileA = join(testDir, 'app.js');
    const contentA = 'const x = "immutable content";\n'.repeat(100);
    await writeFile(fileA, contentA, 'utf8');

    const fileB = join(testDir, 'style.css');
    const contentB = '.body { margin: 0; padding: 0; color: #fff; }\n'.repeat(80);
    await writeFile(fileB, contentB, 'utf8');

    const hashABefore = sha256Hex(await readFile(fileA));
    const hashBBefore = sha256Hex(await readFile(fileB));

    await precompress(testDir);

    const hashAAfter = sha256Hex(await readFile(fileA));
    const hashBAfter = sha256Hex(await readFile(fileB));

    assert.equal(hashABefore, hashAAfter, 'app.js original doit être strictement intact');
    assert.equal(hashBBefore, hashBAfter, 'style.css original doit être strictement intact');
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});
