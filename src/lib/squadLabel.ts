/**
 * Règle de libellé des squads (8b) :
 * - espaces, tirets et apostrophes séparent les mots ;
 * - plusieurs mots -> initiales en majuscules (« Les Gros Buveurs » -> « LGB ») ;
 * - un seul mot -> mot entier en majuscules (« Potes » -> « POTES ») ;
 * - accents conservés (« Élite » -> « ÉLITE ») ;
 * - troncature à `maxLength` points de code, SANS « … ».
 *
 * Les tirets et apostrophes sont des séparateurs : « Team Après-Midi » -> « TAM »,
 * « Buveurs d'Élite » -> « BDÉ ». C'est le choix retenu pour 8b.
 */
export const SQUAD_LABEL_MAX = 8;

const WORD_SEPARATORS = /[\s\-'’]+/u;

export function squadLabel(name?: string | null, maxLength: number = SQUAD_LABEL_MAX): string {
    if (!name) return '';
    const trimmed = name.trim();
    if (!trimmed) return '';

    const words = trimmed.split(WORD_SEPARATORS).filter(Boolean);
    if (words.length === 0) return '';

    const label = words.length === 1
        ? words[0].toUpperCase()
        : words
            .map(word => {
                const firstCodePoint = Array.from(word)[0];
                return firstCodePoint ? firstCodePoint.toUpperCase() : '';
            })
            .join('');

    const limit = Number.isFinite(maxLength) ? Math.max(0, Math.trunc(maxLength)) : SQUAD_LABEL_MAX;
    return Array.from(label).slice(0, limit).join('');
}

export const formatSquadLabel = squadLabel;
export default squadLabel;
