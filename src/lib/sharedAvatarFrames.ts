import type {WebGLRenderer} from 'three';
import type {AvatarCopyToken, AvatarRenderJob} from './avatarViewRegistry';
import type {AvatarViewportSession} from './avatarViewportContext';

export function sharedAvatarSourceSize(jobs: readonly AvatarRenderJob[], session: AvatarViewportSession) {
    const active = jobs.filter(job => session.registry.isActive(job));
    return {width: Math.max(1, ...active.map(job => job.width)), height: Math.max(1, ...active.map(job => job.height)),
        dpr: Math.min(1.5, Math.max(1, ...active.map(job => job.dpr)))};
}

/** One immediate WebGL -> retained 2D buffer -> cell copy; never reads CPU pixels. */
export function captureSharedAvatarFrame(source: HTMLCanvasElement, buffer: HTMLCanvasElement,
    width: number, height: number): boolean {
    if (width <= 0 || height <= 0 || width > source.width || height > source.height) return false;
    const staging = buffer.getContext('2d');
    if (!staging) return false;
    try {
        if (buffer.width !== width) buffer.width = width;
        if (buffer.height !== height) buffer.height = height;
        staging.save();
        try {
            staging.globalCompositeOperation = 'copy';
            // WebGL viewport is bottom-left; drawImage source coordinates are top-left.
            staging.drawImage(source, 0, source.height - height, width, height, 0, 0, width, height);
        } finally { staging.restore(); }
        return true;
    } catch { return false; }
}

export function presentSharedAvatarFrame(buffer: HTMLCanvasElement, target: HTMLCanvasElement, previous?: HTMLCanvasElement): boolean {
    const destination = target.getContext('2d');
    if (!destination) return false;
    const {width, height} = buffer;
    try {
        if (target.width !== width) target.width = width;
        if (target.height !== height) target.height = height;
        destination.save();
        try {
            destination.globalCompositeOperation = 'copy';
            destination.drawImage(buffer, 0, 0, width, height);
        } finally { destination.restore(); }
        return true;
    } catch {
        // No pre-emptive clearRect. In particular, a failed source copy leaves
        // the already painted target unchanged. Restore resize failures if able.
        if (previous && (target.width !== previous.width || target.height !== previous.height)) {
            try {
                target.width = previous.width; target.height = previous.height;
                destination.drawImage(previous, 0, 0);
            } catch { /* The cell keeps its error state; no false certificate. */ }
        }
        return false;
    }
}

/** Manual pass, called after portal mixers. The emitted duration is a CPU/sync proxy, not GPU time. */
export function renderSharedAvatarCycle(gl: WebGLRenderer, session: AvatarViewportSession,
    previousFrames: WeakMap<HTMLCanvasElement, HTMLCanvasElement>, now = performance.now()) {
    const start = performance.now();
    const {registry} = session;
    for (const job of registry.getSnapshot().jobs) {
        if (!registry.isActive(job) || !job.ready || !job.scene || !job.camera || !job.group || gl.getContext().isContextLost()) continue;
        let meshCount = 0;
        job.group.traverse(object => { if ('isMesh' in object && object.isMesh && object.visible) meshCount++; });
        if (meshCount === 0) continue;
        const width = Math.round(job.width * job.dpr);
        const height = Math.round(job.height * job.dpr);
        if (width <= 0 || height <= 0) continue;
        const rootDpr = gl.getPixelRatio();
        const autoReset = gl.info.autoReset;
        const before = gl.info.render.calls;
        const renderStart = performance.now();
        let calls = 0;
        try {
            gl.info.autoReset = false;
            gl.setScissorTest(false);
            gl.setViewport(0, 0, width / rootDpr, height / rootDpr);
            gl.clear(true, true, true);
            gl.setScissor(0, 0, width / rootDpr, height / rootDpr);
            gl.setScissorTest(true);
            gl.render(job.scene, job.camera);
            calls = gl.info.render.calls - before;
        } finally { gl.info.autoReset = autoReset; gl.setScissorTest(false); }
        const renderMs = performance.now() - renderStart;
        if (calls <= 0 || gl.getContext().isContextLost()) continue;
        const buffer = job.lastFrame ?? document.createElement('canvas');
        const captureStart = performance.now();
        if (!captureSharedAvatarFrame(gl.domElement, buffer, width, height)) continue;
        const captureMs = performance.now() - captureStart;
        for (const id of job.subscribers) {
            const view = registry.getSnapshot().views.find(candidate => candidate.id === id);
            if (!view || (!view.visible && !view.prepare)) continue;
            const token: AvatarCopyToken = registry.copyToken(view);
            const copyStart = performance.now();
            const presented = presentSharedAvatarFrame(buffer, view.target, previousFrames.get(view.target));
            const timestamp = performance.now();
            const copyMs = timestamp - copyStart;
            const copied = presented && registry.confirmCopy(token, {drawCalls: calls, meshCount, copied: presented, timestamp});
            if (copied) {
                job.lastFrame = buffer;
                previousFrames.set(view.target, buffer);
            }
            session.emitMetric({kind: 'copy', timestamp, durationMs: renderMs + captureMs + copyMs, renderMs, copyMs: captureMs + copyMs,
                viewId: view.id, jobId: job.id, width, height, dpr: job.dpr, copied, drawCalls: calls});
        }
    }
    session.emitMetric({kind: 'cycle', timestamp: now, durationMs: performance.now() - start, renderMs: 0, copyMs: 0});
}
