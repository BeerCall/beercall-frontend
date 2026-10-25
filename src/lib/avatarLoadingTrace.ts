export interface AvatarLoadingEvent {
    timestamp: number;
    phase: 'map-bootstrap' | 'canvas-suspense' | 'model-assets' | 'avatar-mount';
    event: 'start' | 'end';
    view: string;
}
const events: AvatarLoadingEvent[] = [];
export function recordAvatarLoading(phase: AvatarLoadingEvent['phase'], event: AvatarLoadingEvent['event'], view: string): void {
    events.push({ timestamp: performance.now(), phase, event, view });
    if (events.length > 100) events.shift();
}
export const getAvatarLoadingTrace = () => [...events];
