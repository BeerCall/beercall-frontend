/**
 * B02 — Normalisation des identifiants aux frontières.
 *
 * Le backend attend des entiers dans ses URL (`/squads/{int}`), tandis que le
 * front manipule des connexions/mondes `u_<id>` et des squads `sq_<id>`. Ces
 * helpers n'acceptent qu'un identifiant strictement valide et rejettent toute
 * analyse partielle, `NaN`, l'infini, le négatif, la chaîne vide et le dépassement.
 */
const DIGITS_ONLY = /^\d+$/;

function parsePositiveInteger(raw: unknown, prefix: string): number | undefined {
    if (typeof raw === 'number') {
        return Number.isSafeInteger(raw) && raw > 0 ? raw : undefined;
    }
    if (typeof raw !== 'string') return undefined;
    let text = raw.trim();
    if (prefix && text.startsWith(prefix)) text = text.slice(prefix.length);
    if (text.length === 0 || !DIGITS_ONLY.test(text)) return undefined;
    const parsed = Number(text);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/** Accepte `12`, `'12'` ou `'u_12'`. Retourne `undefined` sinon. */
export function numericUserId(value: unknown): number | undefined {
    return parsePositiveInteger(value, 'u_');
}

/** Accepte `12` ou `'sq_12'`. Retourne `undefined` sinon. */
export function numericSquadId(value: unknown): number | undefined {
    return parsePositiveInteger(value, 'sq_');
}
