/**
 * Humanise un jeton de fichier sans aucune liste de noms.
 * Même règles que `services/avatar_catalog.humanize` (Python).
 *
 * ``Casual2`` -> ``Casual 2``, ``AstonMartin`` -> ``Aston Martin``,
 * ``McLaren`` reste ``McLaren``.
 */
export function humanizeToken(value: string): string {
    let result = value.trim().replace(/[_\s]+/g, ' ');
    result = result.replace(/(?<=[a-z0-9])(?=[A-Z])/g, ' ');
    result = result.replace(/(?<=[A-Za-z])(?=[0-9])/g, ' ');
    result = result.replace(/(?<=[0-9])(?=[A-Za-z])/g, ' ');
    result = result.replace(/\s+/g, ' ').trim();
    // « McLaren » ne doit pas devenir « Mc Laren ».
    result = result.replace(/^Mc (?=[A-Z])/, 'Mc');
    return result;
}
