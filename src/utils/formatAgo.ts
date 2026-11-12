/**
 * B05 - Duree relative d'une date (precision volontairement grossiere).
 * < 60 s : "a l'instant" ; < 60 min : "N min" ; < 24 h : "N h" ; sinon "N j".
 * Une date future est ramenee a 0 ; une date invalide donne "date inconnue".
 */
export function formatAgo(iso: string | null | undefined, now: number = Date.now()): string {
    if (!iso) return 'date inconnue';
    const timestamp = Date.parse(iso);
    if (!Number.isFinite(timestamp)) return 'date inconnue';

    const deltaMs = Math.max(0, now - timestamp);
    const seconds = deltaMs / 1000;
    if (seconds < 60) return "à l'instant";

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h`;

    const days = Math.floor(hours / 24);
    return `${days} j`;
}
