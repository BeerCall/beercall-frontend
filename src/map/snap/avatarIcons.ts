import type {SnapPerson} from './types';
import {BASE_SPRITE, BODY_SPRITE} from './mapScenario';
import {initialOf} from './toSnapPeople';

/** B09b — registre d'images MapLibre pour les corps, bases et pastilles. */
export interface SnapImageMap {
    hasImage(id: string): boolean;
    addImage(id: string, image: ImageData | ImageBitmap, options?: { pixelRatio?: number }): void;
    removeImage?(id: string): void;
}

export interface SnapIconAdapters {
    loadBody(url: string): Promise<ImageBitmap>;
    makeInitial(letter: string): ImageData;
    makeBase(): ImageData;
    makePill(label: string): ImageData | null;
    close?(image: ImageBitmap): void;
}

function canvas2d(width: number, height: number): CanvasRenderingContext2D {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D indisponible');
    return context;
}

/**
 * Cadre du corps de carte calé sur la PoC 7ad2d84 : hauteur visible 198/256
 * du sprite, pieds à 6/256 du bas. Le sprite stocké peut avoir un cadrage plus
 * serré (corps 87,5 % au lieu de 77,3 %) ; on le normalise à l'affichage pour
 * que la taille carte reste celle de la PoC, sans toucher aux uploads.
 */
const MAP_BODY_VISIBLE_HEIGHT = 198 / 256;
const MAP_BODY_BOTTOM_MARGIN = 6 / 256;
const MAP_BODY_ALPHA_THRESHOLD = 8;

export interface BodyBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export function mapBodyPlacement(source: BodyBox): BodyBox {
    if (!(source.width > 0) || !(source.height > 0)) {
        throw new Error('Boîte de corps vide');
    }
    const targetHeight = BODY_SPRITE.height * MAP_BODY_VISIBLE_HEIGHT;
    const scale = Math.min(targetHeight / source.height, BODY_SPRITE.width / source.width);
    const width = source.width * scale;
    const height = source.height * scale;
    return {
        x: (BODY_SPRITE.width - width) / 2,
        y: BODY_SPRITE.height - BODY_SPRITE.height * MAP_BODY_BOTTOM_MARGIN - height,
        width,
        height,
    };
}

function visibleBodyBox(context: CanvasRenderingContext2D): BodyBox | null {
    const {width, height} = context.canvas;
    const pixels = context.getImageData(0, 0, width, height).data;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            if (pixels[(y * width + x) * 4 + 3] <= MAP_BODY_ALPHA_THRESHOLD) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }
    if (maxX < 0) return null;
    return {x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1};
}

/** Réduit un corps 256×512 en 128×256 et le recadre au cadre PoC. */
async function loadBodyBitmap(url: string): Promise<ImageBitmap> {
    const response = await fetch(url, {cache: 'force-cache'});
    if (!response.ok) throw new Error(`Sprite BeerCall manquant: ${url} (${response.status})`);
    const source = await createImageBitmap(await response.blob());
    try {
        const scratch = canvas2d(BODY_SPRITE.width, BODY_SPRITE.height);
        scratch.drawImage(source, 0, 0, BODY_SPRITE.width, BODY_SPRITE.height);
        const body = visibleBodyBox(scratch);
        if (!body) throw new Error(`Sprite corps vide: ${url}`);
        const placement = mapBodyPlacement(body);

        const normalized = canvas2d(BODY_SPRITE.width, BODY_SPRITE.height);
        normalized.drawImage(
            scratch.canvas,
            body.x, body.y, body.width, body.height,
            placement.x, placement.y, placement.width, placement.height,
        );
        return await createImageBitmap(normalized.canvas);
    } finally {
        source.close();
    }
}

export function createInitialImage(letter: string): ImageData {
    const context = canvas2d(BODY_SPRITE.width, BODY_SPRITE.height);
    context.fillStyle = '#e5e7eb';
    context.beginPath();
    context.arc(BODY_SPRITE.width / 2, BODY_SPRITE.height / 2, BODY_SPRITE.width / 2 - 4, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#374151';
    context.font = 'bold 64px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(initialOf(letter), BODY_SPRITE.width / 2, BODY_SPRITE.height / 2);
    return context.getImageData(0, 0, BODY_SPRITE.width, BODY_SPRITE.height);
}

export function createBaseImage(): ImageData {
    const width = BASE_SPRITE.width * 2;
    const height = BASE_SPRITE.height * 2;
    const context = canvas2d(width, height);
    const gradient = context.createRadialGradient(width / 2, height / 2, 2, width / 2, height / 2, width / 2);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.97)');
    gradient.addColorStop(0.6, 'rgba(225, 236, 247, 0.76)');
    gradient.addColorStop(1, 'rgba(148, 170, 192, 0.05)');
    context.fillStyle = gradient;
    context.beginPath();
    context.ellipse(width / 2, height / 2, width / 2 - 3, height / 2 - 3, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(120, 142, 165, 0.30)';
    context.lineWidth = 2;
    context.stroke();
    return context.getImageData(0, 0, width, height);
}

export function createPillImage(label: string): ImageData | null {
    if (!label) return null;
    const scale = 2;
    const fontSize = 12 * scale;
    const context = canvas2d(1, 1);
    const font = `600 ${fontSize}px "Segoe UI", system-ui, -apple-system, sans-serif`;
    context.font = font;
    const width = Math.ceil(context.measureText(label).width) + 9 * scale * 2;
    const height = fontSize + 5 * scale * 2;
    context.canvas.width = width;
    context.canvas.height = height;
    context.font = font;
    context.fillStyle = 'rgba(255, 255, 255, 0.95)';
    context.strokeStyle = 'rgba(15, 23, 42, 0.12)';
    context.lineWidth = scale;
    context.beginPath();
    context.roundRect(scale / 2, scale / 2, width - scale, height - scale, height / 2);
    context.fill();
    context.stroke();
    context.fillStyle = '#111827';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, width / 2, height / 2 + 1);
    return context.getImageData(0, 0, width, height);
}

const BASE_KEY = 'avatar-base';

export const defaultSnapIconAdapters: SnapIconAdapters = {
    loadBody: loadBodyBitmap,
    makeInitial: createInitialImage,
    makeBase: createBaseImage,
    makePill: createPillImage,
};

/**
 * Un seul registre par map. `ensure` ne charge qu'une image par clé et par
 * époque (style), et ne remplace jamais un bitmap déjà inscrit. `prune` retire
 * les anciennes images APRÈS que la source a reçu les nouvelles données.
 */
export class SnapIconRegistry {
    private readonly map: SnapImageMap;
    private readonly adapters: SnapIconAdapters;
    private readonly pending = new Map<string, Promise<void>>();
    private readonly registered = new Set<string>();
    private referenced = new Set<string>();
    private epoch = 0;
    private disposed = false;

    constructor(map: SnapImageMap, adapters: SnapIconAdapters = defaultSnapIconAdapters) {
        this.map = map;
        this.adapters = adapters;
    }

    get currentEpoch(): number {
        return this.epoch;
    }

    /** Style rechargé : les images de l'ancienne époque ne doivent plus s'inscrire. */
    invalidate(): number {
        this.epoch += 1;
        return this.epoch;
    }

    async ensure(people: readonly SnapPerson[], labels: readonly string[] = []): Promise<void> {
        if (this.disposed) return;
        const epoch = this.epoch;
        const wanted = new Map<string, () => Promise<void>>();

        wanted.set(BASE_KEY, async () => {
            const image = this.adapters.makeBase();
            if (this.isStale(epoch) || this.map.hasImage(BASE_KEY)) return;
            this.map.addImage(BASE_KEY, image, {pixelRatio: 2});
            this.registered.add(BASE_KEY);
        });

        for (const person of people) {
            const key = person.bodyKey;
            if (wanted.has(key)) continue;
            wanted.set(key, async () => {
                if (!person.bodyUrl) {
                    if (this.isStale(epoch) || this.map.hasImage(key)) return;
                    this.map.addImage(key, this.adapters.makeInitial(initialOf(person.name)), {pixelRatio: 1});
                    this.registered.add(key);
                    return;
                }
                try {
                    const bitmap = await this.adapters.loadBody(person.bodyUrl);
                    if (this.isStale(epoch) || this.map.hasImage(key)) {
                        this.adapters.close?.(bitmap);
                        return;
                    }
                    this.map.addImage(key, bitmap, {pixelRatio: 1});
                    this.registered.add(key);
                } catch {
                    // Une erreur de sprite ne fait jamais disparaître le membre.
                    if (this.isStale(epoch) || this.map.hasImage(key)) return;
                    this.map.addImage(key, this.adapters.makeInitial(initialOf(person.name)), {pixelRatio: 1});
                    this.registered.add(key);
                }
            });
        }

        for (const label of labels) {
            if (!label || wanted.has(label)) continue;
            wanted.set(label, async () => {
                const image = this.adapters.makePill(label);
                if (!image || this.isStale(epoch) || this.map.hasImage(label)) return;
                this.map.addImage(label, image, {pixelRatio: 2});
                this.registered.add(label);
            });
        }

        this.referenced = new Set(wanted.keys());
        const jobs: Promise<void>[] = [];
        for (const [key, task] of wanted) {
            if (this.map.hasImage(key)) continue;
            const slot = `${epoch}:${key}`;
            let job = this.pending.get(slot);
            if (!job) {
                job = task().finally(() => {
                    this.pending.delete(slot);
                });
                this.pending.set(slot, job);
            }
            jobs.push(job);
        }
        await Promise.all(jobs);
    }

    /** À appeler après `source.setData(...)` : retire seulement le non-référencé. */
    prune(): void {
        for (const key of [...this.registered]) {
            if (this.referenced.has(key)) continue;
            if ([...this.pending.keys()].some((slot) => slot.endsWith(`:${key}`))) continue;
            this.map.removeImage?.(key);
            this.registered.delete(key);
        }
    }

    dispose(): void {
        this.disposed = true;
        this.pending.clear();
        this.registered.clear();
        this.referenced.clear();
    }

    private isStale(epoch: number): boolean {
        return this.disposed || epoch !== this.epoch;
    }
}
