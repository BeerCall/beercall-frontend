import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import WorldPreparationBadge from '../perf/WorldPreparationBadge';
import {
    markPreparationDataReady,
    registerPreparationWorld,
    resetPreparationForTarget,
    resetWorldPreparationForTests,
} from '../worlds/worldPreparation';

afterEach(() => {
    resetWorldPreparationForTests();
});

function badge(): HTMLElement {
    return screen.getByTestId('world-preparation-badge');
}

describe('badge de préparation', () => {
    it('affiche le total de l’apéro cible, puis celui de la nouvelle squad', () => {
        resetPreparationForTarget('bc_50');
        render(<WorldPreparationBadge/>);

        // Données pas encore arrivées : pas de faux « 0/0 ».
        expect(badge().getAttribute('data-total-avatars')).toBe('0');
        expect(badge()).toHaveTextContent('en attente des données');

        act(() => {
            markPreparationDataReady();
            registerPreparationWorld('dodo', Array.from({ length: 50 }, (_, index) => index));
        });
        expect(badge().getAttribute('data-total-avatars')).toBe('50');
        expect(badge()).toHaveTextContent('0/50 avatars');

        act(() => {
            resetPreparationForTarget('bc_40');
        });

        // Changement de squad : l'ancien total disparaît immédiatement.
        expect(badge().getAttribute('data-beer-call-id')).toBe('bc_40');
        expect(badge().getAttribute('data-total-avatars')).toBe('0');
        expect(badge()).toHaveTextContent('en attente des données');

        act(() => {
            markPreparationDataReady();
            registerPreparationWorld('bar', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
            registerPreparationWorld('piscine', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
            registerPreparationWorld('dodo', []);
        });
        expect(badge().getAttribute('data-total-avatars')).toBe('20');
        expect(badge()).toHaveTextContent('0/20 avatars');
    });
});
