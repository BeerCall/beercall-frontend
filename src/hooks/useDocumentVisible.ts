import { useSyncExternalStore } from 'react';

/**
 * B02 — Visibilité réelle du document via un abonnement `visibilitychange`
 * nettoyé (jamais une simple lecture de `document.hidden` sans abonnement, qui
 * ne redéclencherait pas de rendu). Signature stable, un seul listener partagé.
 */
function subscribe(onStoreChange: () => void): () => void {
    document.addEventListener('visibilitychange', onStoreChange);
    return () => document.removeEventListener('visibilitychange', onStoreChange);
}

function getSnapshot(): boolean {
    return !document.hidden;
}

function getServerSnapshot(): boolean {
    return true;
}

export function useDocumentVisible(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
