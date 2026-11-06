/**
 * Règle de libellé des squads (8b / 8b-2) :
 * - espaces, tirets et apostrophes séparent les mots ;
 * - plusieurs mots -> initiales en majuscules (« Les Gros Buveurs » -> « LGB ») ;
 * - un seul mot -> mot entier en majuscules (« Potes » -> « POTES ») ;
 * - accents conservés (« Élite » -> « ÉLITE ») ;
 * - troncature à `maxLength` points de code, SANS « … ».
 *
 * 8b-2 : 7 caractères maximum. Si deux libellés sont identiques, on garde le
 * début du nom et on ajoute à la fin la plus courte partie qui les distingue
 * (« Fluidite50 » -> « FLUID50 », « Fluidite40 » -> « FLUID40 »). Deux noms
 * strictement identiques conservent le même libellé.
 */
export const SQUAD_LABEL_MAX = 7;

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

/**
 * Calcule les libellés d'une liste en désambiguïsant les doublons.
 * Le champ « nom » est la seule source : pas de troncature silencieuse au-delà
 * de `maxLength` ; si la partie distincte ne tient pas, les libellés restent
 * ceux de la règle de base.
 */
export function squadLabels(
    names: readonly (string | null | undefined)[],
    maxLength: number = SQUAD_LABEL_MAX,
): string[] {
    const max = Number.isFinite(maxLength) ? Math.max(0, Math.trunc(maxLength)) : SQUAD_LABEL_MAX;
    const bases = names.map(name => squadLabel(name, max));
    const groups = new Map<string, number[]>();
    bases.forEach((label, index) => {
        const group = groups.get(label);
        if (group) group.push(index);
        else groups.set(label, [index]);
    });

    const result = [...bases];
    for (const indices of groups.values()) {
        if (indices.length < 2) continue;
        const raw = indices.map(index => names[index] ?? '');
        if (raw.every(name => name === raw[0])) continue;

        const normalized = raw.map(name => Array.from(name.trim().toUpperCase().replace(/\s+/gu, '')));
        let suffixLength = 1;
        for (; suffixLength <= max; suffixLength += 1) {
            const suffixes = normalized.map(chars => chars.slice(-suffixLength).join(''));
            if (new Set(suffixes).size === suffixes.length) break;
        }
        if (suffixLength > max) continue;

        const prefixLength = Math.max(0, max - suffixLength);
        indices.forEach((index, position) => {
            const suffix = normalized[position].slice(-suffixLength).join('');
            const prefix = Array.from(bases[index]).slice(0, prefixLength).join('');
            result[index] = Array.from(prefix + suffix).slice(0, max).join('');
        });
    }

    return result;
}

export const formatSquadLabel = squadLabel;
export default squadLabel;
