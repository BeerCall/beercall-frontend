/**
 * Règle de libellé pour les squads (UI-02 / T03a) :
 * - trim et split /\s+/u, segments vides retirés.
 * - chaîne vide ou blancs -> vide.
 * - un seul mot -> conservé intact tel quel.
 * - plusieurs mots -> premier point de code Unicode de chaque mot, en majuscules concaténées.
 * - les tirets et apostrophes internes ne séparent pas les mots.
 * - pas de filtre de ponctuation ni de limite à 2 lettres.
 */
export function squadLabel(name?: string | null): string {
    if (!name) return '';
    const trimmed = name.trim();
    if (!trimmed) return '';

    const words = trimmed.split(/\s+/u).filter(Boolean);
    if (words.length === 0) return '';
    if (words.length === 1) return words[0];

    return words
        .map(word => {
            const firstCodePoint = Array.from(word)[0];
            return firstCodePoint ? firstCodePoint.toUpperCase() : '';
        })
        .join('');
}

export const formatSquadLabel = squadLabel;
export default squadLabel;
