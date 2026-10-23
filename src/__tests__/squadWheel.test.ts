import { describe, it, expect } from 'vitest';
import { clampSquadPage, squadPageCount, squadPageForId, squadWheelPage, WHEEL_ACTION_ANGLES } from '../lib/squadWheel';

const squads = (count: number) => Array.from({ length: count }, (_, index) => ({ id: index + 1 }));

describe('Pagination déterministe de la roue', () => {
    it.each([0, 1, 3, 8, 12, 100])('conserve toutes les squads dans leur ordre pour %i', count => {
        const list = squads(count);
        const pages = Array.from({ length: squadPageCount(count) }, (_, page) => squadWheelPage(list, page));
        expect(pages.flatMap(page => page.items.map(item => item.squad))).toEqual(list);
        expect(new Set(pages.flatMap(page => page.items.map(item => item.squad.id))).size).toBe(count);
        expect(pages.every(page => page.items.length <= 3)).toBe(true);
        expect(pages.at(0)?.previous).toBe(0);
        expect(pages.at(-1)?.next).toBe(pages.length - 1);
    });

    it('borne les index sans boucle circulaire', () => {
        expect(clampSquadPage(-10, 12)).toBe(0);
        expect(clampSquadPage(100, 12)).toBe(3);
        expect(clampSquadPage(3, 0)).toBe(0);
        expect(clampSquadPage(Number.NaN, 12)).toBe(0);
        expect(clampSquadPage(1.9, 12)).toBe(1);
    });

    it('place les boutons et garde les actions indépendantes du total', () => {
        expect(squadWheelPage(squads(0), 0).items).toEqual([]);
        expect(squadWheelPage(squads(1), 0).items.map(item => item.angle)).toEqual([0]);
        expect(squadWheelPage(squads(2), 0).items.map(item => item.angle)).toEqual([-12, 12]);
        expect(squadWheelPage(squads(3), 0).items.map(item => item.angle)).toEqual([-24, 0, 24]);
        expect(squadWheelPage(squads(8), 2).items.map(item => item.angle)).toEqual([-12, 12]);
        expect(WHEEL_ACTION_ANGLES).toEqual({ create: -48, join: 48 });
    });

    it('sélectionne la page de l’ID courant et retourne zéro s’il manque', () => {
        expect(squadPageForId(squads(12), '12')).toBe(3);
        expect(squadPageForId(squads(8), 7)).toBe(2);
        expect(squadPageForId(squads(8), 100)).toBe(0);
        expect(squadPageForId(squads(8))).toBe(0);
    });

    it('recale une page lorsque la liste se réduit sans perdre la dernière page incomplète', () => {
        expect(squadWheelPage(squads(8), 3)).toMatchObject({ page: 2, pageCount: 3, next: 2 });
        expect(squadWheelPage(squads(4), 3).items.map(item => item.squad.id)).toEqual([4]);
        expect(squadWheelPage(squads(0), 3)).toMatchObject({ page: 0, pageCount: 1, items: [] });
    });
});
