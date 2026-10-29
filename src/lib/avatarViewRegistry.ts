import type {Camera, Group, Scene} from 'three';
import type {AvatarConfig} from '../types/avatar';
import type {AvatarPresentationState} from './avatarPresentationState';
import type {AvatarSceneMode, AvatarSceneStatus, ThumbnailFramingInfo} from '../components/3D/AvatarScene';

export interface AvatarViewRequest {
    readonly id: string;
    config: AvatarConfig;
    mode: AvatarSceneMode;
    revision: string;
    width: number;
    height: number;
    dpr: number;
    target: HTMLCanvasElement;
    visible: boolean;
    prepare?: boolean;
    onFrameCopied?: () => void;
}

export function normalizeAvatarConfig(config: AvatarConfig, mode: AvatarSceneMode): AvatarConfig {
    const normalized: AvatarConfig = {};
    for (const part of mode === 'head' ? ['head'] : ['head', 'body', 'legs', 'feet', 'accessory']) {
        const value = config[part];
        if (typeof value === 'string' && value && value !== 'none') normalized[part] = value;
    }
    if (config.gender) normalized.gender = config.gender;
    normalized.animation = mode === 'head' || mode === 'thumbnail' ? 'Idle' : config.animation && config.animation !== 'none' ? config.animation : 'Idle';
    return normalized;
}

export function avatarViewSignature(request: Omit<AvatarViewRequest, 'id' | 'target' | 'visible'>): string {
    return JSON.stringify([request.mode, normalizeAvatarConfig(request.config, request.mode), request.revision,
        request.width, request.height, Math.min(1.5, Math.max(1, request.dpr))]);
}

export interface AvatarViewHandle {readonly id: string; readonly lease: number}
export interface AvatarJobToken {readonly id: string; readonly epoch: number; readonly signature: string; readonly generation: number}
export interface AvatarCopyToken extends AvatarJobToken {readonly viewId: string; readonly lease: number}
export interface AvatarFrameCertificate {signature: string; generation: number; timestamp: number; drawCalls: number; copies: number}

export interface AvatarRenderJob {
    readonly id: string;
    readonly epoch: number;
    readonly signature: string;
    readonly config: AvatarConfig;
    readonly mode: AvatarSceneMode;
    readonly revision: string;
    readonly width: number;
    readonly height: number;
    readonly dpr: number;
    readonly subscribers: Set<string>;
    lastUsed: number;
    scene?: Scene;
    camera?: Camera;
    group?: Group | null;
    ready: boolean;
    framing?: ThumbnailFramingInfo | null;
    presentation?: AvatarPresentationState | null;
    modelError?: 'model-unavailable';
    retryModels?: () => void;
    lastFrame?: HTMLCanvasElement;
    frame?: AvatarFrameCertificate;
}

export interface AvatarViewRecord extends AvatarViewRequest, AvatarViewHandle {
    signature: string;
    jobId: string;
    /** Retained pixels may belong to the preceding outfit until the next atomic copy. */
    frame?: AvatarFrameCertificate;
}

/** Owns only assembled jobs and presentation references, never the public loader cache. */
export class AvatarViewRegistry {
    private views = new Map<string, AvatarViewRecord>();
    private jobs = new Map<string, AvatarRenderJob>();
    private listeners = new Set<() => void>();
    private sequence = 0;
    private clock = 0;
    private version = 0;
    private ended = false;
    readonly generation = 1;
    private snapshot: {version: number; jobs: readonly AvatarRenderJob[]; views: readonly AvatarViewRecord[]} = {version: 0, jobs: [], views: []};

    getSnapshot = () => this.snapshot;
    subscribe = (listener: () => void) => {
        if (this.ended) return () => {};
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };

    register(request: AvatarViewRequest): AvatarViewHandle {
        if (this.ended) throw new Error('Avatar session has ended');
        if (this.views.has(request.id)) throw new Error('Avatar view id already registered');
        const lease = ++this.sequence;
        const job = this.acquireJob(request);
        const view: AvatarViewRecord = {...request, lease, signature: job.signature, jobId: job.id};
        this.views.set(view.id, view);
        job.subscribers.add(view.id);
        this.evict();
        this.publish();
        return {id: view.id, lease};
    }

    update(handle: AvatarViewHandle, request: AvatarViewRequest): boolean {
        const view = this.resolve(handle);
        if (!view || request.id !== view.id) return false;
        const signature = avatarViewSignature(request);
        if (signature !== view.signature || !this.jobs.has(view.jobId)) {
            this.jobs.get(view.jobId)?.subscribers.delete(view.id);
            const job = this.acquireJob(request);
            job.subscribers.add(view.id);
            view.signature = signature;
            view.jobId = job.id;
        }
        Object.assign(view, request);
        const job = this.jobs.get(view.jobId)!;
        job.lastUsed = ++this.clock;
        this.evict();
        this.publish();
        return true;
    }

    unregister(handle: AvatarViewHandle): void {
        const view = this.resolve(handle);
        if (!view) return;
        const job = this.jobs.get(view.jobId);
        if (job) { job.subscribers.delete(view.id); job.lastUsed = ++this.clock; }
        this.views.delete(view.id);
        this.evict();
        this.publish();
    }

    getView(handle: AvatarViewHandle): AvatarViewRecord | undefined { return this.resolve(handle); }
    getJob(id: string): AvatarRenderJob | undefined { return this.jobs.get(id); }
    jobToken(job: AvatarRenderJob): AvatarJobToken {
        return {id: job.id, epoch: job.epoch, signature: job.signature, generation: this.generation};
    }
    copyToken(view: AvatarViewRecord): AvatarCopyToken {
        return {...this.jobToken(this.jobs.get(view.jobId)!), viewId: view.id, lease: view.lease};
    }

    attachScene(token: AvatarJobToken, scene: Scene, camera: Camera): boolean {
        const job = this.resolveJob(token);
        if (!job) return false;
        job.scene = scene;
        job.camera = camera;
        return true;
    }

    setSceneStatus(token: AvatarJobToken, status: AvatarSceneStatus | null): boolean {
        const job = this.resolveJob(token);
        if (!job) return false;
        const changed = job.ready !== !!status?.ready || job.group !== status?.group || job.framing !== status?.framing;
        job.ready = !!status?.ready && !!status.group && status.expectedParts.length > 0;
        job.group = status?.group;
        job.framing = status?.framing;
        if (changed) this.publish();
        return true;
    }

    setPresentation(token: AvatarJobToken, state: AvatarPresentationState | null): boolean {
        const job = this.resolveJob(token);
        if (!job) return false;
        if (job.presentation !== state) { job.presentation = state; this.publish(); }
        return true;
    }

    setModelError(token: AvatarJobToken, retry?: () => void): boolean {
        const job = this.resolveJob(token);
        if (!job) return false;
        job.modelError = retry ? 'model-unavailable' : undefined;
        job.retryModels = retry;
        if (retry) job.ready = false;
        this.publish();
        return true;
    }

    confirmCopy(token: AvatarCopyToken, evidence: {drawCalls: number; meshCount: number; copied: boolean; timestamp: number}): boolean {
        const job = this.resolveJob(token);
        const view = this.views.get(token.viewId);
        if (!job || !view || view.lease !== token.lease || view.jobId !== job.id || view.signature !== token.signature ||
            !job.ready || !evidence.copied || evidence.drawCalls <= 0 || evidence.meshCount <= 0 ||
            view.width <= 0 || view.height <= 0 || (!view.visible && !view.prepare)) return false;
        const first = view.frame?.signature !== token.signature || view.frame?.generation !== token.generation;
        view.frame = {signature: token.signature, generation: token.generation, timestamp: evidence.timestamp,
            drawCalls: evidence.drawCalls, copies: (view.frame?.copies ?? 0) + 1};
        job.frame = view.frame;
        if (first) this.publish();
        job.presentation?.notifyFrameCopied();
        view.onFrameCopied?.();
        return true;
    }

    isActive(job: AvatarRenderJob): boolean {
        return [...job.subscribers].some(id => { const view = this.views.get(id); return !!view && (view.visible || !!view.prepare); });
    }

    clearSession(): void {
        if (this.ended) return;
        this.ended = true;
        for (const view of this.views.values()) {
            view.onFrameCopied = undefined;
            // Session reset may erase private presentation; ordinary eviction never does.
            const context = view.target.getContext('2d');
            context?.clearRect(0, 0, view.target.width, view.target.height);
        }
        for (const job of this.jobs.values()) {
            job.presentation = null; job.retryModels = undefined; job.lastFrame = undefined;
            job.scene = undefined; job.camera = undefined; job.group = undefined;
            job.subscribers.clear();
        }
        this.views.clear();
        this.jobs.clear();
        this.publish();
        this.listeners.clear();
    }

    private acquireJob(request: AvatarViewRequest): AvatarRenderJob {
        const signature = avatarViewSignature(request);
        // Portraits are synchronised by signature. Body/profile scenes may only
        // adopt an unowned/completed-warmup assembly, never a concurrent neighbour's group.
        const cached = [...this.jobs.values()].find(job => job.signature === signature &&
            (request.mode === 'head' || job.subscribers.size === 0 ||
                (job.ready && !!job.frame && [...job.subscribers].every(id => {
                    const view = this.views.get(id);
                    return !!view && view.prepare === false && !view.visible;
                }))));
        if (cached) {
            if (request.mode !== 'head' && cached.subscribers.size > 0) {
                // A completed warmup owns retained pixels, not a concurrent view.
                // Detach it atomically before adopting its prepared assembly.
                for (const id of cached.subscribers) {
                    const previous = this.views.get(id);
                    if (previous) previous.jobId = '';
                }
                cached.subscribers.clear();
            }
            cached.lastUsed = ++this.clock;
            return cached;
        }
        const epoch = ++this.sequence;
        const job: AvatarRenderJob = {id: `avatar-job-${epoch}`, epoch, signature,
            config: normalizeAvatarConfig(request.config, request.mode), mode: request.mode, revision: request.revision,
            width: request.width, height: request.height, dpr: Math.min(1.5, Math.max(1, request.dpr)),
            subscribers: new Set(), lastUsed: ++this.clock, ready: false};
        this.jobs.set(job.id, job);
        return job;
    }

    private evict(): void {
        const hidden = [...this.jobs.values()].filter(job => !this.isActive(job)).sort((a, b) => a.lastUsed - b.lastUsed);
        for (const job of hidden.slice(0, Math.max(0, hidden.length - 16))) {
            // A hidden subscribed cell keeps its pixels; its assembly is lazily
            // reacquired when visible again by update(), not a visible slot quota.
            for (const id of job.subscribers) {
                const view = this.views.get(id);
                if (view) view.jobId = '';
            }
            job.presentation = null; job.retryModels = undefined; job.lastFrame = undefined;
            job.scene = undefined; job.camera = undefined; job.group = undefined;
            this.jobs.delete(job.id);
        }
    }

    private resolve(handle: AvatarViewHandle) {
        const view = this.views.get(handle.id);
        return !this.ended && view?.lease === handle.lease ? view : undefined;
    }
    private resolveJob(token: AvatarJobToken) {
        const job = this.jobs.get(token.id);
        return !this.ended && token.generation === this.generation && job?.epoch === token.epoch && job.signature === token.signature ? job : undefined;
    }
    private publish() {
        this.snapshot = {version: ++this.version, jobs: [...this.jobs.values()], views: [...this.views.values()]};
        [...this.listeners].forEach(listener => listener());
    }
}
