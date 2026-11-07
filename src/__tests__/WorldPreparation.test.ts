import { afterEach, describe, expect, it } from 'vitest';
import {
    getPreparationSnapshot,
    grantAllPreparationAvatars,
    grantNextPreparationAvatar,
    isPreparationAvatarGranted,
    markPreparationCanvasReady,
    markPreparationDataReady,
    markPreparationGpuFrame,
    markPreparationLabelsReady,
    registerPreparationWorld,
    resetPreparationForTarget,
    resetWorldPreparationForTests,
} from '../worlds/worldPreparation';

afterEach(() => {
    resetWorldPreparationForTests();
});

function finishPreparation(): void {
    markPreparationDataReady();
    markPreparationCanvasReady();
    registerPreparationWorld('bar', [0, 1]);
    registerPreparationWorld('piscine', [2]);
    registerPreparationWorld('dodo', []);
    grantAllPreparationAvatars('bar');
    grantAllPreparationAvatars('piscine');
    markPreparationGpuFrame('bar');
    markPreparationGpuFrame('piscine');
    markPreparationGpuFrame('dodo');
    markPreparationLabelsReady();
}

describe('préparation au repos des mondes', () => {
    it('accorde un avatar à la fois et priorise le monde demandé', () => {
        resetPreparationForTarget('bc_1');
        markPreparationDataReady();
        registerPreparationWorld('bar', [0, 1]);
        registerPreparationWorld('piscine', [2]);

        expect(getPreparationSnapshot().worlds.bar.total).toBe(2);
        expect(grantNextPreparationAvatar('piscine')).toEqual({world: 'piscine', index: 2});
        expect(isPreparationAvatarGranted('piscine', 2)).toBe(true);
        expect(grantNextPreparationAvatar()).toEqual({world: 'bar', index: 0});
        expect(grantNextPreparationAvatar()).toEqual({world: 'bar', index: 1});
        expect(grantNextPreparationAvatar()).toBeNull();
        expect(getPreparationSnapshot().worlds.bar.granted).toBe(2);
        expect(getPreparationSnapshot().phase).toBe('gpu');
    });

    it('termine après les trois rendus cachés et les libellés du monde affiché', () => {
        resetPreparationForTarget('bc_1');
        finishPreparation();

        const snapshot = getPreparationSnapshot();
        expect(snapshot.phase).toBe('done');
        expect(snapshot.doneAt).not.toBeNull();
        expect(snapshot.dataReady).toBe(true);
        expect(snapshot.canvasReady).toBe(true);
        expect(snapshot.labelsReady).toBe(true);
        expect(snapshot.worlds.bar).toEqual({total: 2, granted: 2, frame: true});
        expect(snapshot.worlds.piscine).toEqual({total: 1, granted: 1, frame: true});
        expect(snapshot.worlds.dodo).toEqual({total: 0, granted: 0, frame: true});
    });

    it('ne termine pas sans les libellés du monde affiché', () => {
        resetPreparationForTarget('bc_1');
        markPreparationDataReady();
        markPreparationCanvasReady();
        registerPreparationWorld('bar', [0]);
        registerPreparationWorld('piscine', [1]);
        registerPreparationWorld('dodo', []);
        grantAllPreparationAvatars('bar');
        grantAllPreparationAvatars('piscine');
        markPreparationGpuFrame('bar');
        markPreparationGpuFrame('piscine');
        markPreparationGpuFrame('dodo');
        expect(getPreparationSnapshot().phase).toBe('gpu');

        markPreparationLabelsReady();
        expect(getPreparationSnapshot().phase).toBe('done');
    });

    it('réinitialise proprement quand le Beer Call ou les participants changent', () => {
        resetPreparationForTarget('bc_1');
        markPreparationDataReady();
        registerPreparationWorld('bar', [0, 1]);
        grantNextPreparationAvatar('bar');
        expect(getPreparationSnapshot().worlds.bar.granted).toBe(1);

        registerPreparationWorld('bar', [0, 1, 2]);
        expect(getPreparationSnapshot().worlds.bar).toEqual({total: 3, granted: 0, frame: false});

        resetPreparationForTarget('bc_2');
        expect(getPreparationSnapshot().targetBeerCallId).toBe('bc_2');
        expect(getPreparationSnapshot().phase).toBe('waiting-data');
        expect(getPreparationSnapshot().worlds.bar.total).toBe(0);
        expect(isPreparationAvatarGranted('bar', 0)).toBe(false);
    });
});
