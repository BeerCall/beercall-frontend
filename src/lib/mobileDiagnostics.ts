import { getInitialDashboardSceneSignal, getSceneMetrics } from './sceneMetrics';
import { getModelDecodeMetrics } from './modelTelemetry';
import { getAvatarLoadingTrace } from './avatarLoadingTrace';

export function summarizeFrames(samples: number[]) {
    const values = samples.filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
    if (!values.length) return null;
    const percentile = (p: number) => values[Math.ceil(p * values.length) - 1];
    return {
        samples: values.length,
        p50Ms: percentile(0.5),
        p95Ms: percentile(0.95),
        maxMs: values[values.length - 1],
        over33MsPercent: 100 * values.filter(value => value > 33.4).length / values.length,
    };
}

export function readMobileDiagnostics() {
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const groups = { preparedModels: { count: 0, transferBytes: 0, decodedBytes: 0 },
        fbxModels: { count: 0, transferBytes: 0, decodedBytes: 0 },
        scripts: { count: 0, transferBytes: 0, decodedBytes: 0 },
        other: { count: 0, transferBytes: 0, decodedBytes: 0 } };
    for (const resource of resources) {
        const path = new URL(resource.name, location.origin).pathname;
        const group = path.endsWith('.bc3d') ? groups.preparedModels : path.endsWith('.fbx') ? groups.fbxModels
            : path.endsWith('.js') ? groups.scripts : groups.other;
        group.count++;
        group.transferBytes += resource.transferSize || 0;
        group.decodedBytes += resource.decodedBodySize || 0;
    }
    return {
        schemaVersion: 1,
        capturedAt: new Date().toISOString(),
        userAgent: navigator.userAgent,
        dpr: window.devicePixelRatio,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        standalone: matchMedia('(display-mode: standalone)').matches ||
            (navigator as Navigator & { standalone?: boolean }).standalone === true,
        secureContext: window.isSecureContext,
        serviceWorkerControlled: !!navigator.serviceWorker?.controller,
        navigationType: (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type ?? null,
        sceneSignals: getSceneMetrics(),
        initialDashboardScene: getInitialDashboardSceneSignal() ?? null,
        modelDecodes: getModelDecodeMetrics(),
        avatarLoadingTrace: getAvatarLoadingTrace(),
        resources: groups,
        limitations: [
            'Scene signals measure submitted WebGL frames, not physical presentation.',
            'Resource timings can be incomplete or zero for cached/cross-origin responses.',
            'Frame samples are requestAnimationFrame intervals, not GPU presentation measurements.',
        ],
    };
}
