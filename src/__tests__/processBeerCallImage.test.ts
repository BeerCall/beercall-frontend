import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processBeerCallImage, processImageForBackend } from '../lib/processBeerCallImage';

describe('processBeerCallImage (T05a)', () => {
    const originalFileReader = global.FileReader;
    const originalImage = global.Image;
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;

    let mockImageWidth = 100;
    let mockImageHeight = 100;
    let drawImageSpy = vi.fn();
    let toBlobSpy = vi.fn();
    let lastBlobQuality: number | undefined;
    let lastBlobMime: string | undefined;

    beforeEach(() => {
        drawImageSpy = vi.fn();
        toBlobSpy = vi.fn();
        lastBlobQuality = undefined;
        lastBlobMime = undefined;

        global.FileReader = class {
            result: string | null = null;
            onload: ((e: { target: { result: string } }) => void) | null = null;
            onerror: ((e: Error) => void) | null = null;
            readAsDataURL() {
                setTimeout(() => {
                    this.result = 'data:image/png;base64,mock';
                    if (this.onload) this.onload({ target: { result: this.result } });
                }, 0);
            }
        } as unknown as typeof FileReader;

        global.Image = class {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            _src = '';
            get width() { return mockImageWidth; }
            get height() { return mockImageHeight; }
            set src(val: string) {
                this._src = val;
                setTimeout(() => {
                    if (this.onload) this.onload();
                }, 0);
            }
            get src() { return this._src; }
        } as unknown as typeof global.Image;

        HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation(function (this: HTMLCanvasElement) {
            return {
                drawImage: drawImageSpy,
            };
        }) as unknown as typeof HTMLCanvasElement.prototype.getContext;

        HTMLCanvasElement.prototype.toBlob = vi.fn().mockImplementation(function (
            this: HTMLCanvasElement,
            callback: BlobCallback,
            type?: string,
            quality?: number
        ) {
            lastBlobMime = type;
            lastBlobQuality = quality;
            toBlobSpy(this.width, this.height, type, quality);
            setTimeout(() => {
                callback(new Blob(['fake-jpg-content'], { type: type || 'image/jpeg' }));
            }, 0);
        });
    });

    afterEach(() => {
        global.FileReader = originalFileReader;
        global.Image = originalImage;
        HTMLCanvasElement.prototype.getContext = originalGetContext;
        HTMLCanvasElement.prototype.toBlob = originalToBlob;
    });

    it('redimensionne correctement une image en mode paysage (max 1200px)', async () => {
        mockImageWidth = 2400;
        mockImageHeight = 1200;

        const file = new File(['fake-data'], 'paysage.png', { type: 'image/png' });
        const processed = await processBeerCallImage(file);

        expect(processed.name).toBe('paysage_fixed.jpg');
        expect(processed.type).toBe('image/jpeg');
        expect(lastBlobMime).toBe('image/jpeg');
        expect(lastBlobQuality).toBe(0.8);
        expect(toBlobSpy).toHaveBeenCalledWith(1200, 600, 'image/jpeg', 0.8);
        expect(drawImageSpy).toHaveBeenCalledWith(expect.any(Object), 0, 0, 1200, 600);
    });

    it('redimensionne correctement une image en mode portrait (max 1200px)', async () => {
        mockImageWidth = 1200;
        mockImageHeight = 2400;

        const file = new File(['fake-data'], 'portrait.HEIC', { type: 'image/heic' });
        const processed = await processBeerCallImage(file);

        expect(processed.name).toBe('portrait_fixed.jpg');
        expect(processed.type).toBe('image/jpeg');
        expect(lastBlobMime).toBe('image/jpeg');
        expect(lastBlobQuality).toBe(0.8);
        expect(toBlobSpy).toHaveBeenCalledWith(600, 1200, 'image/jpeg', 0.8);
        expect(drawImageSpy).toHaveBeenCalledWith(expect.any(Object), 0, 0, 600, 1200);
    });

    it('ne modifie pas les dimensions d une image plus petite que 1200px', async () => {
        mockImageWidth = 800;
        mockImageHeight = 600;

        const file = new File(['fake-data'], 'small.jpg', { type: 'image/jpeg' });
        const processed = await processBeerCallImage(file);

        expect(processed.name).toBe('small_fixed.jpg');
        expect(processed.type).toBe('image/jpeg');
        expect(toBlobSpy).toHaveBeenCalledWith(800, 600, 'image/jpeg', 0.8);
        expect(drawImageSpy).toHaveBeenCalledWith(expect.any(Object), 0, 0, 800, 600);
    });

    it('exporte aussi l alias processImageForBackend', async () => {
        expect(processImageForBackend).toBe(processBeerCallImage);
    });
});
