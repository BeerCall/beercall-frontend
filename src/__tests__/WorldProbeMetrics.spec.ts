import { afterEach, describe, expect, it } from 'vitest';
import type { WorldParticipant } from '../types/api';
import {
    countWorldLabels,
    describeLabels,
    expectedLabels,
    labelsSatisfied,
    labelsTotal,
    summarize,
    summarizeByWorld,
    type ProbeSample,
} from '../perf/worldProbeMetrics';
import type { WorldKind } from '../worlds/pocWorldScenario';

function participant(overrides: Partial<WorldParticipant>): WorldParticipant {
    return {
        username: 'Squad',
        avatar_config: { base: 'm1' } as WorldParticipant['avatar_config'],
        ...overrides,
    };
}

const participants: WorldParticipant[] = [
    participant({ username: 'Alice', proof_photo_url: '/a.jpg', excuse: 'Retenue' }),
    participant({ username: 'Bob', proof_photo_url: null, excuse: '   ' }),
    participant({ username: 'SansAvatar', avatar_config: undefined }),
    participant({ username: '   ', proof_photo_url: '/c.jpg', excuse: null }),
];

afterEach(() => {
    document.body.innerHTML = '';
});

describe('libellés attendus par monde', () => {
    it('compte pseudos et photos hors Piscine, bulles à la Piscine', () => {
        expect(expectedLabels('bar', participants)).toEqual({ names: 2, photos: 2, excuses: 0 });
        expect(expectedLabels('dodo', participants)).toEqual({ names: 2, photos: 2, excuses: 0 });
        expect(expectedLabels('piscine', participants)).toEqual({ names: 0, photos: 0, excuses: 1 });
    });

    it('ignore les participants sans avatar_config', () => {
        expect(expectedLabels('bar', [participant({ username: 'SansAvatar', avatar_config: undefined })]))
            .toEqual({ names: 0, photos: 0, excuses: 0 });
    });
});

describe('comptage DOM', () => {
    it('compte pseudos, photos et bulles réellement présents', () => {
        document.body.innerHTML = `
            <span data-world-name>Alice</span>
            <span data-world-name>Bob</span>
            <button data-world-photo></button>
            <div data-world-excuse>Retenue</div>
        `;
        expect(countWorldLabels()).toEqual({ names: 2, photos: 1, excuses: 1 });
        expect(labelsTotal(countWorldLabels())).toBe(4);
        expect(labelsSatisfied(countWorldLabels(), { names: 2, photos: 1, excuses: 1 })).toBe(true);
        expect(labelsSatisfied(countWorldLabels(), { names: 2, photos: 1, excuses: 0 })).toBe(false);
        expect(describeLabels({ names: 2, photos: 1, excuses: 1 }))
            .toBe('2 pseudo(s) · 1 photo(s) · 1 bulle(s)');
    });
});

describe('statistiques du parcours', () => {
    it('calcule dernier, médiane et p95 sans arrondir les seuils', () => {
        expect(summarize([])).toEqual({ count: 0, last: null, median: null, p95: null });
        expect(summarize([100, 200, 300, 400])).toEqual({ count: 4, last: 400, median: 250, p95: 400 });
        expect(summarize([100, 200, 300])).toEqual({ count: 3, last: 300, median: 200, p95: 300 });
        expect(summarize([10, 21])).toEqual({ count: 2, last: 21, median: 15.5, p95: 21 });
    });

    it('regroupe les mesures par monde cible', () => {
        const sample = (to: WorldKind, ms: number): ProbeSample => ({
            cycle: 1,
            from: 'bar',
            to,
            ms,
            labels: { names: 1, photos: 0, excuses: 0 },
            expected: { names: 1, photos: 0, excuses: 0 },
        });

        const byWorld = summarizeByWorld([
            sample('piscine', 300),
            sample('dodo', 500),
            sample('bar', 100),
            sample('piscine', 400),
        ]);
        expect(byWorld.bar).toEqual({ count: 1, last: 100, median: 100, p95: 100 });
        expect(byWorld.piscine).toEqual({ count: 2, last: 400, median: 350, p95: 400 });
        expect(byWorld.dodo).toEqual({ count: 1, last: 500, median: 500, p95: 500 });
    });
});
