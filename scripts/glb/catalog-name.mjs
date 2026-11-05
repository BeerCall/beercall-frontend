/**
 * Convention de nommage des sources d'avatar :
 *   Genre_partie_Nom_[jetons]_Prix.fbx
 *
 * Le nom est le 3e segment et ne contient pas d'underscore. Le prix est le
 * dernier segment numérique. Les jetons, dans n'importe quel ordre :
 *   px/py/pz, rx/ry/rz (degrés), s, b<Os>.
 * Les nombres sont entiers ou décimaux avec `d` (s0d3 = 0.3).
 */
import { basename } from 'node:path';

export class SourceNameError extends Error {}

export const GENDERS = new Set(['Men', 'Women']);
export const CATEGORIES = new Set(['head', 'body', 'legs', 'feet', 'accessory']);
export const DECOR_KEYS = {
    'Bar.fbx': 'decor/bar',
    'Swimming_pool.fbx': 'decor/piscine',
    'Floaty_Island.fbx': 'decor/dodo',
};

const NUMBER = /^-?\d+(?:d\d+)?$/;

function parseNumber(token, label) {
    if (!NUMBER.test(token)) {
        throw new SourceNameError(`nombre invalide pour ${label} : ${token}`);
    }
    return Number(token.replace('d', '.'));
}

function parseTransform(tokens) {
    const transform = {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: 1,
        bone: null,
    };
    const seen = new Set();
    const axis = { x: 0, y: 1, z: 2 };

    for (const token of tokens) {
        let match = /^p([xyz])(-?\d+(?:d\d+)?)$/.exec(token);
        if (match) {
            if (seen.has(`p${match[1]}`)) throw new SourceNameError(`jeton en double : ${token}`);
            seen.add(`p${match[1]}`);
            transform.position[axis[match[1]]] = parseNumber(match[2], token);
            continue;
        }

        match = /^r([xyz])(-?\d+(?:d\d+)?)$/.exec(token);
        if (match) {
            if (seen.has(`r${match[1]}`)) throw new SourceNameError(`jeton en double : ${token}`);
            seen.add(`r${match[1]}`);
            transform.rotation[axis[match[1]]] = parseNumber(match[2], token);
            continue;
        }

        match = /^s(-?\d+(?:d\d+)?)$/.exec(token);
        if (match) {
            if (seen.has('s')) throw new SourceNameError(`jeton en double : ${token}`);
            seen.add('s');
            transform.scale = parseNumber(match[1], token);
            continue;
        }

        match = /^b([A-Za-z][A-Za-z0-9]*)$/.exec(token);
        if (match) {
            if (seen.has('b')) throw new SourceNameError(`jeton en double : ${token}`);
            seen.add('b');
            transform.bone = match[1];
            continue;
        }

        throw new SourceNameError(`jeton invalide : ${token}`);
    }
    return transform;
}

export function catalogKey(value) {
    const source = basename(String(value));
    const stem = source.replace(/\.fbx$/i, '');
    const parts = stem.split('_');
    if (parts.length < 3 || !GENDERS.has(parts[0]) || !CATEGORIES.has(parts[1]) || !parts[2]) {
        return null;
    }
    return `${parts[0]}_${parts[1]}_${parts[2]}`;
}

/**
 * Analyse un nom d'avatar. Retourne null pour les décors et noms non classables ;
 * lève SourceNameError pour un avatar dont les jetons ou le prix sont invalides.
 */
export function parseSourceName(filename) {
    const source = basename(String(filename));
    if (!source.toLowerCase().endsWith('.fbx')) return null;
    const stem = source.slice(0, -4);
    const parts = stem.split('_');
    if (parts.length < 3) return null;

    const [gender, category, name] = parts;
    if (!GENDERS.has(gender) || !CATEGORIES.has(category) || !name) return null;
    if (parts.length < 4) {
        throw new SourceNameError('prix final manquant');
    }

    const priceToken = parts[parts.length - 1];
    if (!/^\d+$/.test(priceToken)) {
        throw new SourceNameError(`prix final invalide : ${priceToken}`);
    }

    const tokens = parts.slice(3, -1);
    if (category !== 'accessory' && tokens.length > 0) {
        throw new SourceNameError('les jetons sont réservés aux accessoires');
    }

    return {
        sourceId: stem,
        source,
        gender,
        category,
        name,
        key: `${gender}_${category}_${name}`,
        priceCaps: Number(priceToken),
        transform: tokens.length > 0 ? parseTransform(tokens) : null,
    };
}
