import type {AvatarCopyMetric} from '../../src/lib/avatarViewportContext';

export type ProbeLoad = 'bodies' | 'heads' | 'profile-player';
export type ProbeOrientation = 'portrait' | 'landscape';
export interface HardwareProtocol {
    approved: boolean;
    approvedAt: string;
    device: string;
    ios: string;
    mode: 'tab' | 'pwa';
    certificateTrusted: boolean;
    lanAuthorized: boolean;
    minFps: number;
    cycleP95MaxMs: number;
    intervalP95MaxMs: number;
    intervalMaxMs: number;
    durationMs: number;
    windowMs: number;
}
export interface HardwareSnapshot {
    timestamp: number;
    sourcesCreated: number;
    sourcesLive: number;
    sourcesLost: number;
    assemblies: number;
    hiddenAssemblies: number;
    buffers2D: number;
    bufferAreaPixels: number;
    views: {id: string; width: number; height: number; dpr: number}[];
    jsHeapBytes: number | 'inconnue';
    nativeMemory: 'inconnue';
}
export interface ProbeRun {
    id: number;
    load: ProbeLoad;
    orientation: ProbeOrientation;
    start: number;
    end?: number;
    requiredViews: number;
    expectedViews: string[];
    preparedAt?: number;
    copies: (AvatarCopyMetric & {phase: 'cold' | 'prepared'})[];
    cycles: AvatarCopyMetric[];
    renders: {jobId: string; timestamp: number; durationMs: number}[];
    snapshots: HardwareSnapshot[];
    controls: {timestamp: number; eventToFrameMs: number | 'inconnue'}[];
}
export function nearestRankP95(values: readonly number[]): number | undefined {
    if (!values.length) return undefined;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.ceil(0.95 * sorted.length) - 1];
}

export class HardwareMeasurements {
    readonly runs: ProbeRun[] = [];
    readonly visibility: {timestamp: number; visible: boolean}[] = [];
    readonly contextEvents: {timestamp: number; kind: 'created' | 'lost' | 'restored'}[] = [];
    private current?: ProbeRun;
    private renderedThisCycle = new Set<string>();

    startRun(load: ProbeLoad, orientation: ProbeOrientation, timestamp: number): ProbeRun {
        if (this.current) this.current.end = timestamp;
        const run: ProbeRun = {id: this.runs.length + 1, load, orientation, start: timestamp,
            requiredViews: load === 'bodies' ? 4 : load === 'heads' ? 30 : 2,
            expectedViews: [], copies: [], cycles: [], renders: [], snapshots: [], controls: []};
        this.runs.push(run); this.current = run; this.renderedThisCycle.clear();
        return run;
    }
    setExpectedViews(ids: string[]) {
        const run = this.current;
        if (run && !run.expectedViews.length && ids.length === run.requiredViews) run.expectedViews = [...ids];
    }
    recordMetric(metric: AvatarCopyMetric) {
        const run = this.current;
        if (!run) return;
        if (metric.kind === 'cycle') {
            run.cycles.push({...metric}); this.renderedThisCycle.clear(); return;
        }
        if (!metric.viewId || !run.expectedViews.includes(metric.viewId)) return;
        run.copies.push({...metric, phase: run.preparedAt === undefined ? 'cold' : 'prepared'});
        if (metric.jobId && !this.renderedThisCycle.has(metric.jobId)) {
            this.renderedThisCycle.add(metric.jobId);
            run.renders.push({jobId: metric.jobId, timestamp: metric.timestamp, durationMs: metric.renderMs});
        }
        if (run.preparedAt === undefined && run.expectedViews.every(id => run.copies.some(copy => copy.viewId === id && copy.copied))) {
            run.preparedAt = metric.timestamp;
        }
    }
    recordVisibility(timestamp: number, visible: boolean) { this.visibility.push({timestamp, visible}); }
    recordContext(timestamp: number, kind: 'created' | 'lost' | 'restored') { this.contextEvents.push({timestamp, kind}); }
    recordSnapshot(snapshot: HardwareSnapshot) { this.current?.snapshots.push(snapshot); }
    recordControl(timestamp: number, eventToFrameMs: number | 'inconnue') { this.current?.controls.push({timestamp, eventToFrameMs}); }

    report(run: ProbeRun, now: number, protocol: HardwareProtocol | null) {
        const end = run.end ?? now;
        const start = run.preparedAt;
        const windowMs = protocol?.windowMs ?? 10_000;
        const windows: {start: number; end: number; foreground: boolean; cycleP95Ms: number | undefined;
            views: {id: string; fps: number; intervalP95Ms: number | undefined; intervalMaxMs: number}[]}[] = [];
        const copiesByView = new Map<string, number[]>();
        for (const copy of run.copies) if (copy.copied && copy.viewId) {
            const timestamps = copiesByView.get(copy.viewId) ?? [];
            timestamps.push(copy.timestamp); copiesByView.set(copy.viewId, timestamps);
        }
        if (start !== undefined) for (let from = start; from + windowMs <= end; from += windowMs) {
            const to = from + windowMs;
            const foreground = this.isForeground(from, to);
            const cycles = run.cycles.filter(cycle => cycle.timestamp >= from && cycle.timestamp < to).map(cycle => cycle.durationMs);
            const views = run.expectedViews.map(id => {
                const timestamps = (copiesByView.get(id) ?? []).filter(timestamp => timestamp >= from && timestamp < to);
                // Include the edges: a view frozen after its first image cannot
                // hide its starvation behind an active neighbouring view.
                const points = [from, ...timestamps, to];
                const intervals = points.slice(1).map((time, index) => time - points[index]);
                return {id, fps: timestamps.length * 1000 / windowMs, intervalP95Ms: nearestRankP95(intervals), intervalMaxMs: Math.max(...intervals)};
            });
            windows.push({start: from, end: to, foreground, cycleP95Ms: nearestRankP95(cycles), views});
        }
        const foregroundWindows = windows.filter(window => window.foreground);
        const approved = !!protocol?.approved && !!protocol.device.trim() && !!protocol.ios.trim() && !!protocol.approvedAt &&
            protocol.certificateTrusted && protocol.lanAuthorized && protocol.windowMs === 10_000 && protocol.durationMs >= 60_000 &&
            [protocol.minFps, protocol.cycleP95MaxMs, protocol.intervalP95MaxMs, protocol.intervalMaxMs].every(value => Number.isFinite(value) && value > 0);
        const graphicsObserved = start !== undefined && run.snapshots.some(snapshot => snapshot.timestamp >= start && snapshot.sourcesCreated === 1 && snapshot.sourcesLive === 1);
        const enough = graphicsObserved && start !== undefined && run.expectedViews.length === run.requiredViews &&
            foregroundWindows.length * windowMs >= (protocol?.durationMs ?? 60_000) &&
            this.longestForeground(start, end) >= (protocol?.durationMs ?? 60_000);
        const failed = approved && foregroundWindows.some(window => window.cycleP95Ms === undefined || window.cycleP95Ms > protocol.cycleP95MaxMs ||
            window.views.some(view => view.fps < protocol.minFps || view.intervalP95Ms === undefined || view.intervalP95Ms > protocol.intervalP95MaxMs || view.intervalMaxMs > protocol.intervalMaxMs));
        const graphicsFailure = this.contextEvents.some(event => event.timestamp >= run.start && event.timestamp <= end && event.kind === 'lost') ||
            run.snapshots.some(snapshot => snapshot.sourcesLive > 1 || snapshot.sourcesCreated > 1 || snapshot.hiddenAssemblies > 16);
        return {id: run.id, load: run.load, orientation: run.orientation,
            verdict: !approved ? 'not-qualified' : failed || graphicsFailure ? 'fail' : !enough ? 'insufficient' : 'pass',
            reasons: {h04Approved: approved, graphicsObserved, enoughContinuousForeground: enough, graphicsFailure},
            preparationMs: start === undefined ? 'inconnue' : start - run.start,
            elapsedPreparedMs: start === undefined ? 0 : end - start,
            incompleteWindowMs: start === undefined ? 0 : (end - start) % windowMs,
            windows, nativeMemory: 'inconnue' as const};
    }
    private visibleAt(timestamp: number) {
        return this.visibility.filter(event => event.timestamp <= timestamp).at(-1)?.visible ?? true;
    }
    private isForeground(from: number, to: number) {
        return this.visibleAt(from) && !this.visibility.some(event => event.timestamp > from && event.timestamp < to && !event.visible);
    }
    private longestForeground(from: number, to: number) {
        let visible = this.visibleAt(from); let segment = from; let longest = 0;
        for (const event of this.visibility.filter(event => event.timestamp > from && event.timestamp < to)) {
            if (visible) longest = Math.max(longest, event.timestamp - segment);
            visible = event.visible; segment = event.timestamp;
        }
        if (visible) longest = Math.max(longest, to - segment);
        return longest;
    }
}
