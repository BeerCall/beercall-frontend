import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const swPath = path.resolve(__dirname, '../dist/firebase-messaging-sw.js');

console.log('[check-animation-precache] Vérification du précache Workbox dans:', swPath);

if (!fs.existsSync(swPath)) {
  console.error('[check-animation-precache] ERREUR: Le fichier', swPath, "n'existe pas. Lancez 'npm run build' au préalable.");
  process.exit(1);
}

const content = fs.readFileSync(swPath, 'utf8');

// Extraction du tableau de manifest injecté par Workbox
const arrayMatch = content.match(/\[(?:\{[^{}]*"url"\s*:\s*"[^"]+"[^{}]*\},?\s*)+\]/);
let entries = [];

if (arrayMatch) {
  try {
    entries = JSON.parse(arrayMatch[0]);
  } catch (err) {
    console.warn('[check-animation-precache] Avertissement: parse direct échoué, passage en extraction tolérante:', err.message);
  }
}

if (!entries.length) {
  const entryRegex = /\{[^{}]*"url"\s*:\s*"([^"]+)"[^{}]*\}/g;
  let m;
  while ((m = entryRegex.exec(content)) !== null) {
    try {
      entries.push(JSON.parse(m[0]));
    } catch {
      entries.push({ url: m[1] });
    }
  }
}

if (!entries.length) {
  console.error('[check-animation-precache] ERREUR CRITIQUE: Aucune entrée de précache injectée trouvée dans', swPath);
  process.exit(1);
}

console.log(`[check-animation-precache] ${entries.length} entrées de précache injectées détectées.`);

// 1. Vérification de l'App Shell (doit être présent)
const hasIndexHtml = entries.some(e => e.url === 'index.html' || e.url.endsWith('/index.html'));
const hasJsAsset = entries.some(e => typeof e.url === 'string' && e.url.startsWith('assets/') && e.url.endsWith('.js'));
const hasCssAsset = entries.some(e => typeof e.url === 'string' && e.url.startsWith('assets/') && e.url.endsWith('.css'));
const hasManifestOrPwa = entries.some(e => typeof e.url === 'string' && (e.url.includes('manifest') || e.url.includes('pwa') || e.url.includes('icon')));

if (!hasIndexHtml || !hasJsAsset || !hasCssAsset || !hasManifestOrPwa) {
  console.error('[check-animation-precache] ERREUR: App Shell incomplet dans le précache:');
  console.error(`  - index.html: ${hasIndexHtml}`);
  console.error(`  - assets JS:  ${hasJsAsset}`);
  console.error(`  - assets CSS: ${hasCssAsset}`);
  console.error(`  - manifest/PWA: ${hasManifestOrPwa}`);
  process.exit(1);
}

// 2. Vérification de l'exclusion absolue des animations et des fichiers .gz
const forbiddenAnimationEntries = entries.filter(e => {
  if (typeof e.url !== 'string') return false;
  const u = e.url.toLowerCase();
  return u.includes('animation') || u.includes('/animations') || u.endsWith('.gz');
});

if (forbiddenAnimationEntries.length > 0) {
  console.error('[check-animation-precache] ERREUR CRITIQUE: Des assets d\'animation ou fichiers .gz ont été trouvés dans le précache:');
  forbiddenAnimationEntries.forEach(e => console.error(`  - ${e.url} (revision: ${e.revision})`));
  process.exit(1);
}

// 3. Vérification de garde-fou supplémentaire sur le contenu brut
const forbiddenRawPatterns = [
  /["']animations\/[^"']+["']/i,
  /["'][^"']*\.json\.gz["']/i,
  /["']animations\/manifest\.json["']/i,
];

for (const pattern of forbiddenRawPatterns) {
  if (pattern.test(content)) {
    console.error(`[check-animation-precache] ERREUR: Motif interdit détecté dans le service worker compilé: ${pattern}`);
    process.exit(1);
  }
}

console.log('[check-animation-precache] SUCCÈS:');
console.log(`  - 0 asset d'animation dans le précache Workbox.`);
console.log(`  - 0 fichier .gz précompressé dans le précache.`);
console.log(`  - App Shell complet préservé (${entries.length} entrées: HTML, JS, CSS, PWA).`);
process.exit(0);
