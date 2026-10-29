import {describe, expect, it} from 'vitest';
import {HardwareMeasurements, nearestRankP95, type HardwareProtocol} from '../../bench/avatar-copy-hardware/measurements';

const protocol: HardwareProtocol = {approved: true, approvedAt: '2026-10-29T00:00:00Z', device: 'synthetic device', ios: 'synthetic iOS',
    mode: 'tab', certificateTrusted: true, lanAuthorized: true, minFps: 28.5, cycleP95MaxMs: 25, intervalP95MaxMs: 66.7,
    intervalMaxMs: 250, durationMs: 60_000, windowMs: 10_000};

function series(freeze = false, interval = 1000 / 30) {
    const measurements = new HardwareMeasurements();
    measurements.recordVisibility(0, true);
    const run = measurements.startRun('profile-player', 'portrait', 0);
    measurements.setExpectedViews(['profile', 'player']);
    measurements.recordSnapshot({timestamp: 1000, sourcesCreated: 1, sourcesLive: 1, sourcesLost: 0,
        assemblies: 2, hiddenAssemblies: 0, buffers2D: 4, bufferAreaPixels: 1,
        views: [{id: 'profile', width: 390, height: 422, dpr: 1.5}, {id: 'player', width: 96, height: 128, dpr: 1.5}],
        jsHeapBytes: 'inconnue', nativeMemory: 'inconnue'});
    for (let t = 0; t < 60_001; t += interval) {
        for (const id of ['profile', 'player']) if (!freeze || id === 'profile' || t === 0) measurements.recordMetric({kind: 'copy', timestamp: t,
            viewId: id, jobId: id, copied: true, durationMs: 4, renderMs: 2, copyMs: 2});
        measurements.recordMetric({kind: 'cycle', timestamp: t, durationMs: 8, renderMs: 0, copyMs: 0});
    }
    return {measurements, run};
}

describe('iPhone copy probe measurements (not a hardware result)', () => {
    it('uses nearest-rank p95, including the maximum of a ten-value series', () => {
        expect(nearestRankP95([10, 1, 9, 2, 8, 3, 7, 4, 6, 5])).toBe(10);
        expect(nearestRankP95(Array.from({length: 100}, (_, i) => i + 1))).toBe(95);
        expect(nearestRankP95([])).toBeUndefined();
    });
    it('does not calculate PASS without approved H04, device and certificate prerequisites', () => {
        const {measurements, run} = series();
        expect(measurements.report(run, 60_001, null).verdict).toBe('not-qualified');
        expect(measurements.report(run, 60_001, {...protocol, approved: false}).verdict).toBe('not-qualified');
        expect(measurements.report(run, 60_001, {...protocol, device: ''}).verdict).toBe('not-qualified');
        expect(measurements.report(run, 60_001, {...protocol, certificateTrusted: false}).verdict).toBe('not-qualified');
    });
    it('detects a frozen player even while its neighbouring profile continues', () => {
        const {measurements, run} = series(true);
        const report = measurements.report(run, 60_001, protocol);
        expect(report.verdict).toBe('fail');
        expect(report.windows[0].views.find(view => view.id === 'player')!.intervalMaxMs).toBeGreaterThan(250);
    });
    it('fails excessive copy spacing without relaxing cadence or intervals', () => {
        const {measurements, run} = series(false, 100);
        expect(measurements.report(run, 60_001, protocol).verdict).toBe('fail');
    });
    it('never certifies an incomplete window or a missing expected view', () => {
        const {measurements, run} = series();
        expect(measurements.report(run, 9_999, protocol).verdict).toBe('insufficient');
        const missing = new HardwareMeasurements(); const empty = missing.startRun('heads', 'portrait', 0);
        missing.setExpectedViews(['only-one-instead-of-thirty']);
        expect(empty.expectedViews).toEqual([]);
        expect(missing.report(empty, 90_000, protocol).verdict).toBe('insufficient');
    });
    it('keeps hidden periods separate and retains bad foreground values before a pause', () => {
        const {measurements, run} = series(true);
        measurements.recordVisibility(20_000, false); measurements.recordVisibility(30_000, true);
        const report = measurements.report(run, 60_001, protocol);
        expect(report.verdict).toBe('fail');
        expect(report.windows.some(window => !window.foreground)).toBe(true);
        expect(report.windows[0].views.find(view => view.id === 'player')!.fps).toBeLessThan(protocol.minFps);
        expect(report.reasons.enoughContinuousForeground).toBe(false);
    });
    it('keeps unavailable native memory unknown rather than declaring zero/stable memory', () => {
        const {measurements, run} = series();
        expect(measurements.report(run, 60_001, protocol).nativeMemory).toBe('inconnue');
        expect(measurements.report(run, 60_001, protocol).verdict).toBe('pass');
        expect(run.copies.length).toBeGreaterThan(3000);
        expect(run.renders.length).toBe(run.copies.length);
    });
    it('records context loss independently of view activity and fails the hardware verdict', () => {
        const {measurements, run} = series();
        measurements.recordContext(30_000, 'lost'); measurements.recordContext(30_200, 'restored');
        expect(measurements.report(run, 60_001, protocol).verdict).toBe('fail');
    });
});
