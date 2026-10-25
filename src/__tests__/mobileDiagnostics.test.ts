import { describe, expect, it } from 'vitest';
import { summarizeFrames } from '../lib/mobileDiagnostics';

describe('diagnostic frame summaries', () => {
    it('never invents a result for missing or invalid samples', () => {
        expect(summarizeFrames([])).toBeNull();
        expect(summarizeFrames([NaN, Infinity, -1, 0])).toBeNull();
    });
    it('uses nearest-rank p95 frame times, not inverted FPS percentiles', () => {
        const result = summarizeFrames([...Array(19).fill(16), 50]);
        expect(result).toEqual({ samples: 20, p50Ms: 16, p95Ms: 16, maxMs: 50, over33MsPercent: 5 });
    });
});
