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
            signature: null,
        });
    });

    it('publie le démarrage puis la fin, y compris les échecs', () => {
        reportWorldPreloadStart(27, 'sig-a');
        expect(getWorldPreloadStatus()).toEqual({
            started: true,
            done: false,
            files: 27,
            failures: 0,
            elapsedMs: null,
            signature: 'sig-a',
        });
        expect(window.__beercallWorldPreload?.done).toBe(false);

        reportWorldPreloadDone(27, 2, 12_345, 'sig-a');
        expect(getWorldPreloadStatus()).toEqual({
            started: true,
            done: true,
            files: 27,
            failures: 2,
            elapsedMs: 12_345,
            signature: 'sig-a',
        });
        expect(window.__beercallWorldPreload?.done).toBe(true);
        expect(window.__beercallWorldPreload?.failures).toBe(2);
    });

    it('un rafraîchissement du même plan ne repasse pas à « non terminé »', () => {
        reportWorldPreloadStart(27, 'sig-a');
        reportWorldPreloadDone(27, 0, 4_000, 'sig-a');

        reportWorldPreloadStart(27, 'sig-a');
        expect(getWorldPreloadStatus().done).toBe(true);
        expect(getWorldPreloadStatus().elapsedMs).toBe(4_000);

        reportWorldPreloadStart(28, 'sig-b');
        expect(getWorldPreloadStatus().done).toBe(false);
        expect(getWorldPreloadStatus().signature).toBe('sig-b');
        expect(getWorldPreloadStatus().elapsedMs).toBeNull();
    });

    it('ne partage pas l’objet interne (copie à la lecture)', () => {
        reportWorldPreloadStart(3, 'sig-c');
        const snapshot = getWorldPreloadStatus();
        snapshot.done = true;
        expect(getWorldPreloadStatus().done).toBe(false);
    });
});
