import {describe, expect, it} from 'vitest';
import type {BeerCall} from '../../types/api';
import {
    APERO_EXPAND_MAX_ZOOM,
    APERO_SAME_POINT_EPSILON,
    allSameAperoPoint,
    aperoSignature,
    boundsOfCalls,
    buildAperoPoints,
    composeAperoEntries,
    coordinatesWithPixelOffset,
    createAperoIndex,
} from './aperoClusters';
import {worldPixel} from './clusters';

describe('detail projection boundaries', () => {
    it('utilise la projection écran avec rotation et inclinaison sans déplacer les objets métier', () => {
        const points = buildAperoPoints({active_beer_call: Array.from({length: 3}, (_, i) => call(`bc_${i}`, 2.35, 48.85))});
        // Projection synthétique tournée de 90° et comprimée en hauteur.
        const projection = {
            project: ([lng, lat]: [number, number]) => ({x: lat * 10000, y: -lng * 5000}),
            unproject: ([x, y]: [number, number]) => ({lng: -y / 5000, lat: x / 10000}),
        };
        const entries = composeAperoEntries(points, 20, createAperoIndex(points), projection);
        const pixels = entries.map((entry) => projection.project(entry.coordinates));
        for (let i = 0; i < pixels.length; i += 1) {
            const next = pixels[(i + 1) % pixels.length];
            expect(Math.hypot(pixels[i].x - next.x, pixels[i].y - next.y)).toBeCloseTo(132, 5);
            const entry = entries[i];
            expect(entry.kind === 'single' && entry.call).toBe(points[i].call);
            expect(points[i].coordinates).toEqual([2.35, 48.85]);
        }
    });
    it.each([-1, 25])('conserve les coordonnées sans décalage au zoom borné %s', (zoom) => {
        const result = coordinatesWithPixelOffset([2.35, 48.85], 0, 0, zoom);
        expect(result[0]).toBeCloseTo(2.35, 7);
        expect(result[1]).toBeCloseTo(48.85, 7);
    });

    it('garde une cible indépendante pour douze apéros au même endroit', () => {
        const points = buildAperoPoints({active_beer_call: Array.from({length: 12}, (_, i) => call(`bc_${i}`, 2.35, 48.85))});
        const pixels = composeAperoEntries(points, 20).map((entry) => worldPixel(...entry.coordinates, 20));
        for (let i = 0; i < pixels.length; i += 1) {
            for (let j = i + 1; j < pixels.length; j += 1) {
                expect(Math.hypot(pixels[i][0] - pixels[j][0], pixels[i][1] - pixels[j][1])).toBeGreaterThan(108);
            }
        }
    });
});

const call = (
    id: string,
    longitude: number,
    latitude: number,
    overrides: Partial<BeerCall> = {},
): BeerCall => ({
    id,
    creator_name: 'Test',
    creator_id: 1,
    location_name: `Lieu ${id}`,
    longitude,
    latitude,
    status: 'active',
    participants_count: 1,
    has_responded: false,
    can_start: false,
    ...overrides,
});

/** 100 m à la latitude de Paris, largement séparés au zoom 18 mais groupés au zoom 12. */
const NEAR_LNG = 0.0014;

describe('buildAperoPoints', () => {
    it('rend une liste vide sans apéro', () => {
        expect(buildAperoPoints({})).toEqual([]);
        expect(
            buildAperoPoints({
                active_beer_call: null,
                scheduled_beer_calls: null,
                past_beer_calls: null,
            }),
        ).toEqual([]);
    });

    it('projette un apéro unique en conservant son objet d’origine', () => {
        const active = call('bc_1', 2.35, 48.85);
        const points = buildAperoPoints({active_beer_call: [active]});
        expect(points).toHaveLength(1);
        expect(points[0].id).toBe('bc_1');
        expect(points[0].key).toBe('bc_1');
        expect(points[0].coordinates).toEqual([2.35, 48.85]);
        expect(points[0].call).toBe(active);
    });

    it('ignore les coordonnées non finies', () => {
        const points = buildAperoPoints({
            active_beer_call: [
                call('bc_nan', Number.NaN, 48.85),
                call('bc_inf', 2.35, Number.POSITIVE_INFINITY),
            ],
            scheduled_beer_calls: [call('bc_ok', 2.35, 48.85)],
        });
        expect(points.map((point) => point.id)).toEqual(['bc_ok']);
    });

    it('trie par id quel que soit l’ordre réseau', () => {
        const points = buildAperoPoints({
            active_beer_call: [call('bc_b', 2.35, 48.85), call('bc_a', 2.36, 48.86)],
        });
        expect(points.map((point) => point.id)).toEqual(['bc_a', 'bc_b']);
    });

    it('dédoublonne un id en gardant la priorité active', () => {
        const active = call('bc_1', 2.35, 48.85, {status: 'active'});
        const scheduled = call('bc_1', 2.36, 48.86, {status: 'scheduled'});
        const points = buildAperoPoints({
            active_beer_call: [active],
            scheduled_beer_calls: [scheduled],
        });
        expect(points).toHaveLength(1);
        expect(points[0].call).toBe(active);
        expect(points[0].coordinates).toEqual([2.35, 48.85]);
    });
});

describe('aperoSignature', () => {
    it('change quand un id ou une coordonnée change, et reste stable sinon', () => {
        const build = (id: string, lng: number) =>
            buildAperoPoints({active_beer_call: [call(id, lng, 48.85)]});
        const base = build('bc_1', 2.35);
        expect(aperoSignature(build('bc_1', 2.36))).not.toBe(aperoSignature(base));
        expect(aperoSignature(build('bc_2', 2.35))).not.toBe(aperoSignature(base));
        expect(aperoSignature(build('bc_1', 2.35))).toBe(aperoSignature(base));
    });
});

describe('composeAperoEntries', () => {
    it('traite un statut inconnu comme passé sans modifier la donnée métier', () => {
        const unknown = call('bc_0', 2.35, 48.85, {status: 'future-status' as BeerCall['status']});
        const active = call('bc_1', 2.35, 48.85);
        const [entry] = composeAperoEntries(buildAperoPoints({active_beer_call: [unknown, active]}), 12);
        if (entry.kind !== 'group') throw new Error('groupe attendu');
        expect(entry.statuses).toEqual(['active', 'ended']);
        expect(entry.dominantStatus).toBe('active');
        expect(entry.calls[0]).toBe(unknown);
        expect(unknown.status).toBe('future-status');
        const [past] = composeAperoEntries(buildAperoPoints({past_beer_calls: [unknown, {...unknown, id: 'bc_2'}]}), 12);
        if (past.kind !== 'group') throw new Error('groupe attendu');
        expect(past.statuses).toEqual(['ended']);
        expect(past.dominantStatus).toBe('ended');
    });

    it('réutilise l’index géométrique mais rend les objets et statuts actualisés', () => {
        const initial = buildAperoPoints({active_beer_call: [call('bc_a', 2.35, 48.85), call('bc_b', 2.35, 48.85)]});
        const index = createAperoIndex(initial);
        composeAperoEntries(initial, 12, index);
        const updated = buildAperoPoints({past_beer_calls: [
            call('bc_b', 2.35, 48.85, {status: 'ended', location_name: 'Nouveau lieu'}),
            call('bc_a', 2.35, 48.85, {status: 'ended', participants_count: 99}),
        ]});
        expect(aperoSignature(updated)).toBe(aperoSignature(initial));
        const [entry] = composeAperoEntries(updated, 12, index);
        if (entry.kind !== 'group') throw new Error('groupe attendu');
        expect(entry.dominantStatus).toBe('ended');
        expect(entry.calls).toEqual(updated.map((point) => point.call));
        expect(entry.calls[0]).toBe(updated[0].call);
        expect(entry.calls[1].location_name).toBe('Nouveau lieu');
    });

    it('rejette les zooms non finis et accepte une liste vide', () => {
        expect(composeAperoEntries([], 12)).toEqual([]);
        const points = buildAperoPoints({active_beer_call: [call('bc_1', 2.35, 48.85)]});
        for (const zoom of [Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(() => composeAperoEntries(points, zoom)).toThrow();
        }
    });

    it('groupe deux apéros proches à bas zoom avec un compteur d’apéros', () => {
        const active = call('bc_1', 2.35, 48.85, {participants_count: 50});
        const scheduled = call('bc_2', 2.35 + NEAR_LNG, 48.85, {
            status: 'scheduled',
            participants_count: 10,
        });
        const points = buildAperoPoints({
            active_beer_call: [active],
            scheduled_beer_calls: [scheduled],
        });
        const entries = composeAperoEntries(points, 12);
        expect(entries).toHaveLength(1);
        const [entry] = entries;
        expect(entry.kind).toBe('group');
        if (entry.kind !== 'group') throw new Error('groupe attendu');
        expect(entry.calls).toHaveLength(2);
        expect(entry.calls.map((member) => member.id)).toEqual(['bc_1', 'bc_2']);
        expect(entry.statuses).toEqual(['active', 'scheduled']);
        expect(entry.dominantStatus).toBe('active');
        expect(entry.coordinates[0]).toBeCloseTo(2.35 + NEAR_LNG / 2, 9);
        expect(entry.coordinates[1]).toBeCloseTo(48.85, 9);
    });

    it('sépare les mêmes apéros à zoom élevé', () => {
        const points = buildAperoPoints({
            active_beer_call: [call('bc_1', 2.35, 48.85), call('bc_2', 2.35 + NEAR_LNG, 48.85)],
        });
        const entries = composeAperoEntries(points, 18);
        expect(entries).toHaveLength(2);
        expect(entries.every((entry) => entry.kind === 'single')).toBe(true);
        expect(entries.map((entry) => entry.id).sort()).toEqual(['bc_1', 'bc_2']);
    });

    it('ne montre chaque apéro qu’une fois et ne compte pas les participants', () => {
        const points = buildAperoPoints({
            active_beer_call: [call('bc_1', 2.35, 48.85, {participants_count: 50})],
            scheduled_beer_calls: [call('bc_2', 2.3505, 48.85, {status: 'scheduled'})],
            past_beer_calls: [call('bc_3', 2.351, 48.85, {status: 'ended', participants_count: 40})],
        });
        const entries = composeAperoEntries(points, 12);
        expect(entries).toHaveLength(1);
        const [entry] = entries;
        expect(entry.kind).toBe('group');
        if (entry.kind !== 'group') throw new Error('groupe attendu');
        expect(entry.calls).toHaveLength(3);
        expect(entry.calls.reduce((sum, member) => sum + member.participants_count, 0)).toBe(91);
    });

    it('trie les statuts distincts par priorité et retient le dominant', () => {
        const points = buildAperoPoints({
            active_beer_call: [call('bc_1', 2.35, 48.85)],
            scheduled_beer_calls: [call('bc_2', 2.3505, 48.85, {status: 'scheduled'})],
            past_beer_calls: [
                call('bc_3', 2.351, 48.85, {status: 'ended'}),
                call('bc_4', 2.3515, 48.85, {status: 'cancelled'}),
            ],
        });
        const [entry] = composeAperoEntries(points, 12);
        expect(entry.kind).toBe('group');
        if (entry.kind !== 'group') throw new Error('groupe attendu');
        expect(entry.statuses).toEqual(['active', 'scheduled', 'ended', 'cancelled']);
        expect(entry.dominantStatus).toBe('active');
    });

    it('marque canExpand sous le plafond, mais pas sur des points identiques', () => {
        const distinct = buildAperoPoints({
            active_beer_call: [call('bc_1', 2.35, 48.85)],
            scheduled_beer_calls: [call('bc_2', 2.35 + NEAR_LNG, 48.85)],
        });
        const [grouped] = composeAperoEntries(distinct, 12);
        expect(grouped.kind).toBe('group');
        if (grouped.kind !== 'group') throw new Error('groupe attendu');
        expect(grouped.canExpand).toBe(true);

        const identical = buildAperoPoints({
            active_beer_call: [call('bc_1', 2.35, 48.85)],
            scheduled_beer_calls: [call('bc_2', 2.35, 48.85)],
        });
        const [same] = composeAperoEntries(identical, 12);
        expect(same.kind).toBe('group');
        if (same.kind !== 'group') throw new Error('groupe attendu');
        expect(same.canExpand).toBe(false);
    });

    it('sépare les apéros au même point en totems distincts au zoom de détail', () => {
        const active = call('bc_1', 2.35, 48.85, {status: 'active'});
        const scheduled = call('bc_2', 2.35, 48.85, {status: 'scheduled'});
        const past = call('bc_3', 2.35, 48.85, {status: 'ended'});
        const points = buildAperoPoints({
            active_beer_call: [active],
            scheduled_beer_calls: [scheduled],
            past_beer_calls: [past],
        });
        const entries = composeAperoEntries(points, 20);
        expect(entries).toHaveLength(3);
        expect(entries.every((entry) => entry.kind === 'single')).toBe(true);
        expect(entries.map((entry) => entry.id)).toEqual(['bc_1', 'bc_2', 'bc_3']);
        const coordinates = entries.map((entry) => entry.coordinates.join(','));
        expect(new Set(coordinates).size).toBe(3);
        // Le centre du groupe est conservé : la dispersion reste locale.
        const longitude = entries.reduce((sum, entry) => sum + entry.coordinates[0], 0) / 3;
        const latitude = entries.reduce((sum, entry) => sum + entry.coordinates[1], 0) / 3;
        expect(longitude).toBeCloseTo(2.35, 6);
        expect(latitude).toBeCloseTo(48.85, 6);
        if (entries[0].kind !== 'single' || entries[1].kind !== 'single') throw new Error('single attendu');
        expect(entries[0].call).toBe(active);
        expect(entries[1].call).toBe(scheduled);
        // L'actif est placé en haut du cercle.
        expect(entries[0].coordinates[1]).toBeGreaterThan(entries[1].coordinates[1]);
    });

    it('laisse aux coordonnées exactes les apéros déjà séparés au zoom de détail', () => {
        const points = buildAperoPoints({
            active_beer_call: [call('bc_1', 2.35, 48.85)],
            scheduled_beer_calls: [call('bc_2', 2.35 + NEAR_LNG, 48.85, {status: 'scheduled'})],
        });
        const entries = composeAperoEntries(points, 20);
        expect(entries).toHaveLength(2);
        expect(entries.map((entry) => entry.coordinates)).toEqual([
            [2.35, 48.85],
            [2.35 + NEAR_LNG, 48.85],
        ]);
    });

    it('ne marque pas canExpand quand le plafond de zoom est atteint', () => {
        const points = buildAperoPoints({
            active_beer_call: [call('bc_1', 2.35, 48.85)],
            scheduled_beer_calls: [call('bc_2', 2.35 + 0.0000068, 48.85)],
        });
        const entries = composeAperoEntries(points, APERO_EXPAND_MAX_ZOOM);
        expect(entries).toHaveLength(2);
        expect(entries.every((entry) => entry.kind === 'single')).toBe(true);
    });

    it('accepte un index fourni et reste déterministe', () => {
        const points = buildAperoPoints({
            active_beer_call: [call('bc_1', 2.35, 48.85), call('bc_2', 2.3505, 48.85)],
            past_beer_calls: [call('bc_3', 3.5, 49.5, {status: 'ended'})],
        });
        const index = createAperoIndex(points);
        const first = composeAperoEntries(points, 12, index);
        const second = composeAperoEntries(points, 12, index);
        expect(first.map((entry) => entry.id)).toEqual(second.map((entry) => entry.id));
        expect(first.map((entry) => entry.id)).toEqual(['group-bc_1-2', 'bc_3']);
    });

    it('produit les mêmes groupes pour un ordre d’entrée différent', () => {
        const a = call('bc_a', 2.35, 48.85);
        const b = call('bc_b', 2.35 + NEAR_LNG, 48.85);
        const c = call('bc_c', 3.5, 49.5);
        const first = composeAperoEntries(
            buildAperoPoints({active_beer_call: [a, b, c]}),
            12,
        );
        const second = composeAperoEntries(
            buildAperoPoints({active_beer_call: [c, b, a]}),
            12,
        );
        expect(first.map((entry) => entry.id)).toEqual(second.map((entry) => entry.id));
        expect(first[0].kind).toBe('group');
    });
});

describe('boundsOfCalls', () => {
    it('signale explicitement l’absence de coordonnées finies', () => {
        expect(() => boundsOfCalls([])).toThrow('Bornes d’apéros indisponibles');
        expect(() => boundsOfCalls([call('bc_bad', Number.NaN, 48.85)])).toThrow('Bornes d’apéros indisponibles');
    });
    it('renvoie les coins dans l’ordre attendu, quel que soit l’ordre d’entrée', () => {
        const calls = [
            call('bc_1', 2.35, 48.85),
            call('bc_2', 2.36, 48.84),
            call('bc_3', 2.34, 48.86),
        ];
        expect(boundsOfCalls(calls)).toEqual([
            [2.34, 48.84],
            [2.36, 48.86],
        ]);
        expect(boundsOfCalls([...calls].reverse())).toEqual(boundsOfCalls(calls));
    });

    it('accepte un point unique et ignore les coordonnées invalides', () => {
        expect(boundsOfCalls([call('bc_1', 2.35, 48.85)])).toEqual([
            [2.35, 48.85],
            [2.35, 48.85],
        ]);
        expect(
            boundsOfCalls([call('bc_1', Number.NaN, 48.85), call('bc_2', 2.35, 48.85)]),
        ).toEqual([
            [2.35, 48.85],
            [2.35, 48.85],
        ]);
    });
});

describe('allSameAperoPoint', () => {
    it('ne dépend pas du premier membre pour une étendue supérieure à epsilon', () => {
        const calls = [call('bc_a', 0, 0), call('bc_b', -0.75e-6, 0), call('bc_c', 0.75e-6, 0)];
        expect(allSameAperoPoint(calls)).toBe(false);
        expect(allSameAperoPoint([calls[1], calls[0], calls[2]])).toBe(false);
    });
    it('reconnaît des coordonnées identiques', () => {
        expect(
            allSameAperoPoint([call('bc_1', 2.35, 48.85), call('bc_2', 2.35, 48.85)]),
        ).toBe(true);
    });

    it('tolère un écart sous l’epsilon et refuse au-dessus', () => {
        const inside = APERO_SAME_POINT_EPSILON / 2;
        const outside = APERO_SAME_POINT_EPSILON * 2;
        expect(
            allSameAperoPoint([
                call('bc_1', 2.35, 48.85),
                call('bc_2', 2.35 + inside, 48.85 + inside),
            ]),
        ).toBe(true);
        expect(
            allSameAperoPoint([
                call('bc_1', 2.35, 48.85),
                call('bc_2', 2.35 + outside, 48.85),
            ]),
        ).toBe(false);
    });

    it('considère un apéro seul ou invalide comme non séparable', () => {
        expect(allSameAperoPoint([call('bc_1', 2.35, 48.85)])).toBe(true);
        expect(allSameAperoPoint([])).toBe(true);
    });
});
