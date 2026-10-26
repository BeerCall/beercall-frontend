import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processBeerCallImage, processImageForBackend, ImagePreparationError } from '../lib/processBeerCallImage';

describe('processBeerCallImage (T05a / T05b)', () => {
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

    let mockFileReaderTrigger: 'load' | 'error' | 'abort' | 'never' = 'load';
    let mockImageTrigger: 'load' | 'error' | 'never' = 'load';
    let mockBlobResult: Blob | null = new Blob(['fake-jpg-content'], { type: 'image/jpeg' });
    let mockContextResult: unknown = { drawImage: drawImageSpy };

    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        drawImageSpy = vi.fn();
        toBlobSpy = vi.fn();
        lastBlobQuality = undefined;
        lastBlobMime = undefined;
        mockFileReaderTrigger = 'load';
        mockImageTrigger = 'load';
        mockBlobResult = new Blob(['fake-jpg-content'], { type: 'image/jpeg' });
        mockContextResult = { drawImage: drawImageSpy };

        global.FileReader = class {
            result: string | null = null;
            onload: ((e: { target: { result: string } }) => void) | null = null;
            onerror: ((e: unknown) => void) | null = null;
            onabort: ((e: unknown) => void) | null = null;
            readAsDataURL() {
                setTimeout(() => {
                    if (mockFileReaderTrigger === 'load') {
                        this.result = 'data:image/png;base64,mock';
                        if (this.onload) this.onload({ target: { result: this.result } });
                    } else if (mockFileReaderTrigger === 'error') {
                        if (this.onerror) this.onerror(new Error('FileReader error'));
                    } else if (mockFileReaderTrigger === 'abort') {
                        if (this.onabort) this.onabort(new Event('abort'));
                    }
                }, 0);
            }
            abort() {}
        } as unknown as typeof FileReader;

        global.Image = class {
            onload: (() => void) | null = null;
            onerror: ((e: unknown) => void) | null = null;
            _src = '';
            get width() { return mockImageWidth; }
            get height() { return mockImageHeight; }
            set src(val: string) {
                this._src = val;
                setTimeout(() => {
                    if (mockImageTrigger === 'load') {
                        if (this.onload) this.onload();
                    } else if (mockImageTrigger === 'error') {
                        if (this.onerror) this.onerror(new Error('Image decode error'));
                    }
                }, 0);
            }
            get src() { return this._src; }
        } as unknown as typeof global.Image;

        HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation(function (this: HTMLCanvasElement) {
            return mockContextResult;
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
                callback(mockBlobResult);
            }, 0);
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        global.FileReader = originalFileReader;
        global.Image = originalImage;
        HTMLCanvasElement.prototype.getContext = originalGetContext;
        HTMLCanvasElement.prototype.toBlob = originalToBlob;
    });

    it('redimensionne correctement une image en mode paysage (max 1200px)', async () => {
        mockImageWidth = 2400;
        mockImageHeight = 1200;

        const file = new File(['fake-data'], 'paysage.png', { type: 'image/png' });
        const promise = processBeerCallImage(file);
        await vi.runAllTimersAsync();
        const processed = await promise;

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
        const promise = processBeerCallImage(file);
        await vi.runAllTimersAsync();
        const processed = await promise;

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
        const promise = processBeerCallImage(file);
        await vi.runAllTimersAsync();
        const processed = await promise;

        expect(processed.name).toBe('small_fixed.jpg');
        expect(processed.type).toBe('image/jpeg');
        expect(toBlobSpy).toHaveBeenCalledWith(800, 600, 'image/jpeg', 0.8);
        expect(drawImageSpy).toHaveBeenCalledWith(expect.any(Object), 0, 0, 800, 600);
    });

    it('exporte aussi l alias processImageForBackend', async () => {
        expect(processImageForBackend).toBe(processBeerCallImage);
    });

    it('rejette avec ImagePreparationError et message sur erreur FileReader', async () => {
        mockFileReaderTrigger = 'error';
        const file = new File(['corrupt'], 'corrupt.jpg', { type: 'image/jpeg' });
        const assertion = expect(processBeerCallImage(file)).rejects.toThrow('Préparation de la photo impossible. Réessaie avec une autre photo.');
        await vi.runAllTimersAsync();
        await assertion;
    });

    it('rejette avec ImagePreparationError sur abandon FileReader (abort)', async () => {
        mockFileReaderTrigger = 'abort';
        const file = new File(['aborted'], 'aborted.jpg', { type: 'image/jpeg' });
        const assertion = expect(processBeerCallImage(file)).rejects.toThrow(ImagePreparationError);
        await vi.runAllTimersAsync();
        await assertion;
    });

    it('rejette avec ImagePreparationError sur échec de décodage Image (Image.onerror)', async () => {
        mockImageTrigger = 'error';
        const file = new File(['bad-image'], 'bad.png', { type: 'image/png' });
        const assertion = expect(processBeerCallImage(file)).rejects.toThrow(ImagePreparationError);
        await vi.runAllTimersAsync();
        await assertion;
    });

    it('rejette avec ImagePreparationError si getContext 2d est indisponible', async () => {
        mockContextResult = null;
        const file = new File(['data'], 'nocontext.jpg', { type: 'image/jpeg' });
        const assertion = expect(processBeerCallImage(file)).rejects.toThrow(ImagePreparationError);
        await vi.runAllTimersAsync();
        await assertion;
    });

    it('rejette avec ImagePreparationError si toBlob renvoie null', async () => {
        mockBlobResult = null;
        const file = new File(['data'], 'noblob.jpg', { type: 'image/jpeg' });
        const assertion = expect(processBeerCallImage(file)).rejects.toThrow(ImagePreparationError);
        await vi.runAllTimersAsync();
        await assertion;
    });

    it('expire après 15 secondes d inactivité (timeout borné)', async () => {
        mockFileReaderTrigger = 'never';
        const file = new File(['data'], 'hanging.jpg', { type: 'image/jpeg' });
        const assertion = expect(processBeerCallImage(file)).rejects.toThrow('Préparation de la photo impossible. Réessaie avec une autre photo.');

        await vi.advanceTimersByTimeAsync(15100);
        await assertion;
    });

    it('rend les callbacks tardifs inoffensifs après timeout ou résolution', async () => {
        let savedReaderOnload: ((e: { target: { result: string } }) => void) | null = null;
        global.FileReader = class {
            result: string | null = null;
            set onload(fn: ((e: { target: { result: string } }) => void) | null) {
                savedReaderOnload = fn;
            }
            get onload() { return savedReaderOnload; }
            readAsDataURL() {}
            abort() {}
        } as unknown as typeof FileReader;

        const file = new File(['data'], 'late.jpg', { type: 'image/jpeg' });
        const assertion = expect(processBeerCallImage(file)).rejects.toThrow(ImagePreparationError);

        await vi.advanceTimersByTimeAsync(15100);
        await assertion;

        // Callback tardif appelé après résolution
        expect(() => {
            if (savedReaderOnload) {
                (savedReaderOnload as (e: unknown) => void)({ target: { result: 'late-data' } });
            }
        }).not.toThrow();
    });
});
