export interface ModelDecodeMetric {
    format: 'prepared' | 'fbx';
    bytes: number;
    durationMs: number;
}
const metrics: ModelDecodeMetric[] = [];
export function recordModelDecode(metric: ModelDecodeMetric): void {
    metrics.push(metric);
    if (metrics.length > 100) metrics.shift();
}
export const getModelDecodeMetrics = () => [...metrics];
