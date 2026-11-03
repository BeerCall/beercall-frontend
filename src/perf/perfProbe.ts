/**
 * B13b — Sonde de performance légitime `?perf=1` (CHAL-09).
 *
 * Collecte les deltas rAF, les métriques GPU réelles et l'état de la lease WebGL.
 * Inactive si `?perf=1` est absent de l'URL.
 * Fenêtre bornée à 1200 échantillons (~10 s à 120 Hz) pour éviter toute accumulation mémoire.
 * Expose `window.__beercallPerf` avec snapshot et reset.
 */

import { getLeaseSnapshot } from '../three/lease/leaseStore';
import { webglStats } from '../three/lease/webgl';

export interface PerfMetricsSnapshot {
    active: boolean;
    sampleCount: number;
    fps: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    maxMs: number;
    lease: {
        currentOwner: string | null;
        phase: string;
        maxActiveWebGL: number;
        activeWebGL: number;
    };
    framesSubmitted: number;
}

const MAX_SAMPLES = 1200;

export function isPerfQueryActive(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        const params = new URLSearchParams(window.location.search);
        return params.get('perf') === '1';
    } catch {
        return false;
    }
}

export function computePercentiles(samples: number[]): {
    p50: number;
    p95: number;
    p99: number;
    max: number;
} {
    if (samples.length === 0) {
        return { p50: 0, p95: 0, p99: 0, max: 0 };
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const at = (pct: number) => {
        const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((pct / 100) * sorted.length)));
        return sorted[idx];
    };
    return {
        p50: at(50),
        p95: at(95),
        p99: at(99),
        max: sorted[sorted.length - 1],
    };
}

export class PerfProbe {
    private isRunning = false;
    private rafId: number | null = null;
    private lastRafTime = 0;
    private readonly deltaSamples: number[] = [];
    private submittedFramesCount = 0;

    private readonly autoStart: boolean;

    constructor(autoStart = true) {
        this.autoStart = autoStart;
        if (this.autoStart && isPerfQueryActive()) {
            this.start();
        }
    }

    start(): void {
        if (this.isRunning) return;
        this.isRunning = true;
        this.lastRafTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

        const loop = (timestamp: number) => {
            if (!this.isRunning) return;
            const delta = timestamp - this.lastRafTime;
            this.lastRafTime = timestamp;

            if (delta > 0 && delta < 1000) {
                this.deltaSamples.push(delta);
                if (this.deltaSamples.length > MAX_SAMPLES) {
                    this.deltaSamples.shift();
                }
            }

            if (typeof window !== 'undefined') {
                this.rafId = window.requestAnimationFrame(loop);
            }
        };

        if (typeof window !== 'undefined') {
            this.rafId = window.requestAnimationFrame(loop);
        }
    }

    stop(): void {
        this.isRunning = false;
        if (this.rafId !== null && typeof window !== 'undefined') {
            window.cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    recordFrameSubmission(): void {
        if (!this.isRunning) return;
        this.submittedFramesCount += 1;
    }

    reset(): void {
        this.deltaSamples.length = 0;
        this.submittedFramesCount = 0;
        this.lastRafTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    }

    snapshot(): PerfMetricsSnapshot {
        const stats = computePercentiles(this.deltaSamples);
        const leaseSnap = getLeaseSnapshot();
        const glStats = webglStats();

        const avgDelta =
            this.deltaSamples.length > 0
                ? this.deltaSamples.reduce((a, b) => a + b, 0) / this.deltaSamples.length
                : 16.67;
        const fps = avgDelta > 0 ? Math.round(1000 / avgDelta) : 0;

        return {
            active: this.isRunning,
            sampleCount: this.deltaSamples.length,
            fps,
            p50Ms: Math.round(stats.p50 * 100) / 100,
            p95Ms: Math.round(stats.p95 * 100) / 100,
            p99Ms: Math.round(stats.p99 * 100) / 100,
            maxMs: Math.round(stats.max * 100) / 100,
            lease: {
                currentOwner: leaseSnap.currentToken
                    ? `${leaseSnap.currentToken.surface}#${leaseSnap.currentToken.generation}`
                    : null,
                phase: leaseSnap.phase,
                maxActiveWebGL: glStats.maxActive,
                activeWebGL: glStats.active,
            },
            framesSubmitted: this.submittedFramesCount,
        };
    }
}

export const globalPerfProbe = new PerfProbe(true);

declare global {
    interface Window {
        __beercallPerf?: {
            snapshot: () => PerfMetricsSnapshot;
            reset: () => void;
            start: () => void;
            stop: () => void;
        };
    }
}

if (typeof window !== 'undefined') {
    window.__beercallPerf = {
        snapshot: () => globalPerfProbe.snapshot(),
        reset: () => globalPerfProbe.reset(),
        start: () => globalPerfProbe.start(),
        stop: () => globalPerfProbe.stop(),
    };
}
