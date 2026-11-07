import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    beginFirstOpen,
    failFirstOpen,
    getFirstOpenHistory,
    markFirstOpenAvatars,
    markFirstOpenCanvas,
    markFirstOpenData,
    markFirstOpenFrame,
    markFirstOpenLabels,
    markWorldsTouch,
    resetFirstOpenMeasurementForTests,
} from '../worlds/firstOpenMeasurement';
import {
    getPreparationSnapshot,
    grantAllPreparationAvatars,
    markPreparationCanvasReady,
    markPreparationDataReady,
    markPreparationGpuFrame,
    markPreparationLabelsReady,
    registerPreparationWorld,
    resetPreparationForTarget,
    resetWorldPreparationForTests,
} from '../worlds/worldPreparation';

const expected = {names: 1, photos: 0, excuses: 0};
const labels = {names: 1, photos: 0, excuses: 0};

function completePreparation(): void {
    resetPreparationForTarget('bc_1');
    markPreparationDataReady();
    markPreparationCanvasReady();
    registerPreparationWorld('bar', [0]);
    registerPreparationWorld('piscine', []);
    registerPreparationWorld('dodo', []);
    grantAllPreparationAvatars('bar');
    markPreparationGpuFrame('bar');
    markPreparationGpuFrame('piscine');
    markPreparationGpuFrame('dodo');
    markPreparationLabelsReady();
}

beforeEach(() => {
    resetWorldPreparationForTests();
    resetFirstOpenMeasurementForTests();
});

afterEach(() => {
    resetFirstOpenMeasurementForTests();
});

describe('mesure de la première ouverture', () => {
    it('horodate les phases depuis le toucher et complète l’historique', () => {
        markWorldsTouch();
        const entry = beginFirstOpen('bc_1', 'bar', expected, false);
        markFirstOpenData();
        markFirstOpenCanvas();
        markFirstOpenAvatars();
        markFirstOpenFrame();
        markFirstOpenLabels(labels);

        const history = getFirstOpenHistory();
        expect(history).toHaveLength(1);
        const result = history[0];
        expect(result).toBe(entry);
        expect(result.status).toBe('complete');
        expect(result.labels).toEqual(labels);
        expect(result.phases).not.toBeNull();
        expect(result.phases!.total).toBeGreaterThanOrEqual(0);
        expect(result.phases!.data).toBeGreaterThanOrEqual(0);
        expect(result.phases!.labels).toBeGreaterThanOrEqual(0);
    });

    it('marque données, Canvas et avatars au toucher quand la préparation est terminée', () => {
        completePreparation();
        expect(getPreparationSnapshot().phase).toBe('done');

        markWorldsTouch();
        const entry = beginFirstOpen('bc_1', 'bar', expected, true);

        expect(entry.preparationAtTouch.done).toBe(true);
        expect(entry.dataAt).toBe(entry.touchedAt);
        expect(entry.canvasAt).toBe(entry.touchedAt);
        expect(entry.avatarsAt).toBe(entry.touchedAt);
    });

    it('conserve l’historique de la session et marque une erreur visible', () => {
        markWorldsTouch();
        beginFirstOpen('bc_1', 'bar', expected, false);
        failFirstOpen(new Error('décor absent'));
        expect(getFirstOpenHistory()[0].status).toBe('error');
        expect(getFirstOpenHistory()[0].error).toBe('décor absent');

        markWorldsTouch();
        beginFirstOpen('bc_2', 'dodo', expected, false);
        markFirstOpenLabels(labels);
        expect(getFirstOpenHistory()).toHaveLength(2);
        expect(getFirstOpenHistory()[1].status).toBe('complete');
    });
});
