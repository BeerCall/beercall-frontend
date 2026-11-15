/**
 * Jetons et libellés des marqueurs d'apéros (14d), hors composants React.
 */
export const APERO_NAVY = '#0F172A';
export const APERO_SLATE = '#94A3B8';
export const APERO_FALLBACK = '#F59E0B';

/** Couleur de squad sûre, sans laisser passer une valeur CSS arbitraire. */
export function squadAccent(color?: string | null): string {
    if (!color || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) return APERO_FALLBACK;
    return color.length === 4 ? '#' + color.slice(1).split('').map((part) => part + part).join('') : color;
}

function channels(color: string): [number, number, number] {
    const raw = color.replace('#', '');
    const full = raw.length === 3 ? raw.split('').map((part) => part + part).join('') : raw;
    return [
        Number.parseInt(full.slice(0, 2), 16) || 0,
        Number.parseInt(full.slice(2, 4), 16) || 0,
        Number.parseInt(full.slice(4, 6), 16) || 0,
    ];
}

function luminance(color: string): number {
    const [red, green, blue] = channels(color).map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(a: string, b: string): number {
    const first = luminance(a), second = luminance(b);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** Encre lisible sur un fond de couleur (texte des pilules et compteur). */
export function readableInk(color: string): string {
    const ink = contrast(color, APERO_NAVY) >= contrast(color, '#FFFFFF') ? APERO_NAVY : '#FFFFFF';
    // Quelques tons moyens n'atteignent pas 4,5:1 avec navy ou blanc ; le noir
    // assure alors le contraste sans changer la couleur réelle de la squad.
    return contrast(color, ink) >= 4.5 ? ink : '#000000';
}

/** Accent encore visible sur le navy (chope et point du programmé). */
export function accentOnNavy(color: string): string {
    return contrast(color, APERO_NAVY) >= 3 ? color : '#FFFFFF';
}

export function formatScheduledTime(value?: string): string {
    if (!value) return 'APÉRO';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'APÉRO';
    return date.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
    }).replace(':', 'H');
}

export function timeAgoLabel(value?: string): string {
    if (!value) return 'TERMINÉ';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'TERMINÉ';
    const diff = Date.now() - date.getTime();
    if (diff < 0) return 'TERMINÉ';
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return "À L'INSTANT";
    const hours = Math.floor(minutes / 60);
    if (hours < 1) return `IL Y A ${minutes} MIN`;
    const days = Math.floor(hours / 24);
    if (days < 1) return `IL Y A ${hours} H`;
    return `IL Y A ${days} J`;
}
