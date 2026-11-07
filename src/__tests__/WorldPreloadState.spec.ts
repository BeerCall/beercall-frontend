import { afterEach, describe, expect, it } from 'vitest';
import {
    getWorldPreloadStatus,
    reportWorldPreloadDone,
    reportWorldPreloadStart,
    resetWorldPreloadStatusForTests,
} from '../lib/worldPreloadState';

afterEach(() => {
    resetWorldPreloadStatusForTests();
});

describe('état du préchargement des mondes', () => {
    it('démarre non démarré et non terminé', () => {
        expect(getWorldPreloadStatus()).toEqual({
            started: false,
            done: false,
            files: 0,
            failures: 0,
            elapsedMs: null,
        });
    });

    it('publie le démarrage puis la fin, y compris les échecs', () => {
        reportWorldPreloadStart(27);
        expect(getWorldPreloadStatus()).toEqual({
            started: true,
            done: false,
            files: 27,
            failures: 0,
            elapsedMs: null,
        });
        expect(window.__beercallWorldPreload?.done).toBe(false);

        reportWorldPreloadDone(27, 2, 12_345);
        expect(getWorldPreloadStatus()).toEqual({
            started: true,
            done: true,
            files: 27,
            failures: 2,
            elapsedMs: 12_345,
        });
        expect(window.__beercallWorldPreload?.done).toBe(true);
        expect(window.__beercallWorldPreload?.failures).toBe(2);
    });

    it('ne partage pas l’objet interne (copie à la lecture)', () => {
        reportWorldPreloadStart(3);
        const snapshot = getWorldPreloadStatus();
        snapshot.done = true;
        expect(getWorldPreloadStatus().done).toBe(false);
    });
});
