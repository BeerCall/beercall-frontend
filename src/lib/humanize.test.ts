import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { humanizeToken } from './humanize';

interface HumanizeCase {
    input: string;
    expected: string;
}

const cases = JSON.parse(
    readFileSync(resolve(process.cwd(), '../tests/fixtures/humanize-cases.json'), 'utf8'),
) as HumanizeCase[];

describe('humanizeToken', () => {
    it('produit les mêmes résultats que le backend pour les cas partagés', () => {
        expect(cases.length).toBeGreaterThan(0);
        for (const { input, expected } of cases) {
            expect(humanizeToken(input), input).toBe(expected);
        }
    });
});
