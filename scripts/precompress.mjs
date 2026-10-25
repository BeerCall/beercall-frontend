import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { resolve, dirname, join, extname, basename, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';

export const CANDIDATE_EXTENSIONS = new Set(['.js', '.css', '.json', '.svg', '.webmanifest']);

export const EXCLUDED_EXTENSIONS = new Set(['.html', '.gz']);

export const EXCLUDED_PATTERNS = [
  /firebase-messaging-sw/i,
  /registersw/i,
  /(^|\/)sw\.(m?js)$/i,
  /(^|\/)service-worker\.(m?js)$/i,
  /\.sw\.(m?js)$/i,
];

/**
 * Détermine si un fichier est candidat à la précompression gzip.
 * Exclut explicitement :
 * - Les fichiers HTML (cache sensible)
 * - Les Service Workers et scripts d'enregistrement SW
 * - Les fichiers déjà compressés (.gz)
 * - Les extensions non ciblées (JS, CSS, JSON, SVG, webmanifest autorisés uniquement)
 */
export function isCandidateFile(filePath) {
  const ext = extname(filePath).toLowerCase();
  const base = basename(filePath);

  if (EXCLUDED_EXTENSIONS.has(ext)) {
    return false;
  }

  for (const pattern of EXCLUDED_PATTERNS) {
    if (pattern.test(base) || pattern.test(filePath.replace(/\\/g, '/'))) {
      return false;
    }
  }

  return CANDIDATE_EXTENSIONS.has(ext);
}

/**
 * Valide que le chemin cible est strictement confiné à dist ou à un répertoire temporaire de test.
 * Refuse toute racine système, projet ou répertoire parent.
 */
export function validateDirectorySecurity(targetDir, projectDistDir) {
  const resolvedTarget = resolve(targetDir);
  const resolvedDist = resolve(projectDistDir);
  const resolvedTmp = resolve(tmpdir());

  const isInsideDist = resolvedTarget === resolvedDist || resolvedTarget.startsWith(resolvedDist + '\\') || resolvedTarget.startsWith(resolvedDist + '/');
  const isInsideTmp = resolvedTarget.startsWith(resolvedTmp) || /[\\/]temp[\\/]|[\\/]tmp[\\/]/i.test(resolvedTarget);

  if (!isInsideDist && !isInsideTmp) {
    throw new Error(`Sécurité : la cible "${resolvedTarget}" est refusée hors de dist/temp.`);
  }

  return resolvedTarget;
}

/**
 * Compresse un fichier de manière déterministe au niveau 9.
 * N'écrit le fichier .gz que si la taille compressée est ≤ 95 % de l'original.
 * L'original n'est JAMAIS modifié.
 */
export async function precompressFile(filePath) {
  const originalBuf = await readFile(filePath);
  const originalSize = originalBuf.length;

  if (originalSize === 0) {
    return { compressed: false, originalSize: 0, gzSize: 0, reason: 'empty' };
  }

  // Déterminisme garanti par mtime: 0 (en-tête gzip stable sans horodatage variable)
  const gzBuf = gzipSync(originalBuf, { level: 9, mtime: 0 });
  const gzSize = gzBuf.length;
  const threshold = Math.floor(originalSize * 0.95);

  if (gzSize <= threshold) {
    const gzPath = `${filePath}.gz`;
    await writeFile(gzPath, gzBuf);
    return {
      compressed: true,
      filePath,
      gzPath,
      originalSize,
      gzSize,
      ratio: gzSize / originalSize,
      bytesSaved: originalSize - gzSize,
    };
  }

  return {
    compressed: false,
    filePath,
    originalSize,
    gzSize,
    ratio: gzSize / originalSize,
    reason: 'threshold_not_met',
  };
}

/**
 * Scanne récursivement un répertoire et applique la précompression sélective.
 */
export async function precompress(targetDir) {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const projectDistDir = resolve(projectRoot, 'dist');
  const dir = validateDirectorySecurity(targetDir || projectDistDir, projectDistDir);

  const entries = [];

  async function scan(currentDir) {
    const items = await readdir(currentDir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = join(currentDir, item.name);
      if (item.isDirectory()) {
        await scan(fullPath);
      } else if (item.isFile()) {
        entries.push(fullPath);
      }
    }
  }

  await scan(dir);

  const results = {
    targetDir: dir,
    totalScanned: entries.length,
    candidates: 0,
    compressedCount: 0,
    skippedCount: 0,
    totalOriginalBytes: 0,
    totalGzBytes: 0,
    compressedFiles: [],
    skippedFiles: [],
  };

  for (const file of entries) {
    if (!isCandidateFile(file)) {
      results.skippedFiles.push({ file, reason: 'excluded_extension_or_sw' });
      continue;
    }

    results.candidates++;
    const res = await precompressFile(file);

    if (res.compressed) {
      results.compressedCount++;
      results.totalOriginalBytes += res.originalSize;
      results.totalGzBytes += res.gzSize;
      results.compressedFiles.push(res);
    } else {
      results.skippedCount++;
      results.skippedFiles.push({ file, reason: res.reason, ratio: res.ratio });
    }
  }

  return results;
}

// Exécution directe CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const customDir = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : undefined;
    const res = await precompress(customDir);
    console.log(`[postbuild:precompress] Répertoire: ${res.targetDir}`);
    console.log(`  - Fichiers scannés: ${res.totalScanned}`);
    console.log(`  - Fichiers candidats: ${res.candidates}`);
    console.log(`  - Fichiers compressés (taille <= 95%): ${res.compressedCount}`);
    console.log(`  - Fichiers non compressés (gain insuffisant): ${res.skippedCount}`);
    if (res.compressedCount > 0) {
      const totalSaved = res.totalOriginalBytes - res.totalGzBytes;
      const pct = ((totalSaved / res.totalOriginalBytes) * 100).toFixed(1);
      console.log(`  - Volume original: ${(res.totalOriginalBytes / 1024).toFixed(1)} Ko -> Gzip: ${(res.totalGzBytes / 1024).toFixed(1)} Ko (-${pct}%)`);
    }
    process.exit(0);
  } catch (err) {
    console.error(`[postbuild:precompress] ERREUR: ${err.message}`);
    process.exit(1);
  }
}
