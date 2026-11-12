/**
 * 8h-4b-0 — Récupération structurelle quand un chunk JS a disparu.
 *
 * Un rebuild remplace les fichiers hachés de `dist`. Si une page ouverte
 * demande encore un ancien chunk, l'import dynamique échoue et React démonte
 * l'arbre : c'est l'écran blanc observé sur iPhone.
 *
 * Ici :
 * - les erreurs de type chunk sont reconnues explicitement ;
 * - un seul rechargement automatique est tenté par session de navigation ;
 * - si le rechargement ne suffit pas, un message visible est injecté dans le
 *   document, indépendamment de React, avec un bouton « Recharger ».
 *
 * Aucun échec n'est avalé : chaque erreur est journalisée avant décision.
 */

export const CHUNK_RELOAD_KEY = 'beercall:chunk-reload-attempted';
export const FATAL_ERROR_ID = 'beercall-fatal-error';

const CHUNK_ERROR_PATTERNS = [
    /Failed to fetch dynamically imported module/i,
    /error loading dynamically imported module/i,
    /Importing a module script failed/i,
    /Loading chunk [\w-]+ failed/i,
    /ChunkLoadError/i,
    /Unable to preload CSS/i,
    /vite:preloadError/i,
];

let memoryReloadAttempted = false;
let reloading = false;
let installed = false;

export type ChunkRecoveryOutcome = 'reload' | 'fatal';

export interface ChunkRecoveryOptions {
    /** Injectable pour les tests ; par défaut `window.location.reload`. */
    reload?: () => void;
    /** Désactivé uniquement quand l'appelant affiche déjà son propre fallback. */
    showFatal?: boolean;
}

export function isChunkLoadError(error: unknown): boolean {
    if (error instanceof Error) {
        if (error.name === 'ChunkLoadError') return true;
        const message = `${error.name}: ${error.message}`;
        return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
    }
    return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(String(error ?? '')));
}

function hasReloadAttempt(): boolean {
    if (typeof window === 'undefined') return memoryReloadAttempted;
    try {
        return memoryReloadAttempted || window.sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1';
    } catch (error) {
        // sessionStorage indisponible : un rechargement automatique ne pourrait
        // pas être distingué d'une boucle après rechargement. On refuse donc le
        // rechargement et on affiche le message visible ; l'incident est tracé.
        console.warn('[chunk-recovery] sessionStorage indisponible, rechargement automatique refusé', error);
        return true;
    }
}

/** Mémorise la tentative. Faux si le stockage ne peut pas la garantir. */
function markReloadAttempt(): boolean {
    memoryReloadAttempted = true;
    if (typeof window === 'undefined') return true;
    try {
        window.sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
        return true;
    } catch (error) {
        console.warn('[chunk-recovery] impossible de mémoriser le rechargement en session', error);
        return false;
    }
}

/** Vrai tant qu'aucun rechargement automatique n'a eu lieu dans cette session. */
export function canAutoReload(): boolean {
    return !hasReloadAttempt();
}

/** Message visible même si React a été démonté par l'erreur. */
export function showFatalError(error?: unknown): void {
    if (typeof document === 'undefined') return;
    if (document.getElementById(FATAL_ERROR_ID)) return;

    const host = document.body ?? document.documentElement;
    const container = document.createElement('div');
    container.id = FATAL_ERROR_ID;
    container.setAttribute('role', 'alert');
    container.setAttribute('aria-live', 'assertive');
    container.setAttribute('data-testid', 'fatal-error');
    container.style.cssText = [
        'position:fixed',
        'inset:0',
        'z-index:2147483647',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'padding:24px',
        'background:#0f081c',
        'color:#ffffff',
        'font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        'text-align:center',
    ].join(';');

    const panel = document.createElement('div');
    panel.style.cssText = 'max-width:420px;width:100%;';

    const title = document.createElement('h1');
    title.textContent = "L'application n'a pas pu se charger";
    title.style.cssText = 'margin:0 0 12px;font-size:22px;line-height:1.25;font-weight:800;';

    const text = document.createElement('p');
    text.textContent = "Un fichier de l'application est introuvable. Vérifie ta connexion puis recharge la page.";
    text.style.cssText = 'margin:0 0 20px;font-size:15px;line-height:1.5;opacity:0.85;';

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Recharger';
    button.setAttribute('data-testid', 'fatal-reload');
    button.style.cssText = [
        'min-height:44px',
        'min-width:160px',
        'padding:12px 24px',
        'border:0',
        'border-radius:999px',
        'background:#f5b301',
        'color:#0f081c',
        'font-size:16px',
        'font-weight:800',
        'cursor:pointer',
    ].join(';');
    button.addEventListener('click', () => window.location.reload());

    panel.append(title, text, button);

    if (error instanceof Error && error.message) {
        const detail = document.createElement('p');
        detail.textContent = error.message;
        detail.setAttribute('data-testid', 'fatal-detail');
        detail.style.cssText = 'margin:20px 0 0;font-size:12px;line-height:1.4;opacity:0.65;word-break:break-word;';
        panel.append(detail);
    }

    container.append(panel);
    host.append(container);
}

function reloadPage(): void {
    window.location.reload();
}

/**
 * Journalise, tente un rechargement unique, sinon affiche le message visible.
 * Retourne l'issue pour que l'appelant puisse garder React en attente pendant
 * le rechargement au lieu de laisser une promesse rejetée non gérée.
 */
export function recoverFromChunkError(
    error: unknown,
    source: string,
    options: ChunkRecoveryOptions = {},
): ChunkRecoveryOutcome {
    console.error(`[chunk-recovery] ${source}`, error);

    if (reloading) return 'reload';

    if (canAutoReload()) {
        reloading = true;
        if (!markReloadAttempt()) {
            reloading = false;
            if (options.showFatal !== false) showFatalError(error);
            return 'fatal';
        }
        const reload = options.reload ?? reloadPage;
        reload();
        return 'reload';
    }

    if (options.showFatal !== false) showFatalError(error);
    return 'fatal';
}

/**
 * Enveloppe un import dynamique. Sur une erreur de chunk, tente la récupération
 * puis maintient la promesse en attente si un rechargement est en cours. Les
 * autres erreurs remontent intactes au ErrorBoundary racine.
 */
export function recoverableImport<T>(importer: () => Promise<T>, label: string): () => Promise<T> {
    return () => importer().catch((error: unknown) => {
        if (!isChunkLoadError(error)) throw error;
        const outcome = recoverFromChunkError(error, `import:${label}`);
        if (outcome === 'reload') return new Promise<T>(() => {});
        throw error;
    });
}

/** Branche les signaux globaux de Vite et du navigateur. Idempotent. */
export function installChunkRecovery(): void {
    if (installed || typeof window === 'undefined') return;
    installed = true;

    window.addEventListener('vite:preloadError', (event) => {
        event.preventDefault();
        recoverFromChunkError(event.payload, 'vite:preloadError');
    });

    window.addEventListener('unhandledrejection', (event) => {
        if (!isChunkLoadError(event.reason)) return;
        event.preventDefault();
        recoverFromChunkError(event.reason, 'unhandledrejection');
    });
}

/** Réinitialisation réservée aux tests. */
export function resetChunkRecoveryForTests(): void {
    memoryReloadAttempted = false;
    reloading = false;
    if (typeof window !== 'undefined') {
        try {
            window.sessionStorage.removeItem(CHUNK_RELOAD_KEY);
        } catch (error) {
            console.warn('[chunk-recovery] nettoyage de session impossible', error);
        }
    }
    if (typeof document !== 'undefined') {
        document.getElementById(FATAL_ERROR_ID)?.remove();
    }
}
