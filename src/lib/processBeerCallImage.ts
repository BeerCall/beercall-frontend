export class ImagePreparationError extends Error {
    constructor(message: string = 'Préparation de la photo impossible. Réessaie avec une autre photo.') {
        super(message);
        this.name = 'ImagePreparationError';
    }
}

export const processBeerCallImage = (file: File, options?: { timeoutMs?: number }): Promise<File> => {
    const timeoutMs = options?.timeoutMs ?? 15000;
    return new Promise((resolve, reject) => {
        let settled = false;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let reader: FileReader | null = new FileReader();
        let img: HTMLImageElement | null = new Image();

        const cleanup = () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            if (reader) {
                reader.onload = null;
                reader.onerror = null;
                reader.onabort = null;
                reader = null;
            }
            if (img) {
                img.onload = null;
                img.onerror = null;
                img = null;
            }
        };

        const fail = (err?: unknown) => {
            if (settled) return;
            settled = true;
            cleanup();
            if (err instanceof ImagePreparationError) {
                reject(err);
            } else {
                reject(new ImagePreparationError());
            }
        };

        timeoutId = setTimeout(() => {
            fail(new ImagePreparationError());
        }, timeoutMs);

        // Handlers assignés AVANT readAsDataURL/src
        reader.onload = (event) => {
            if (settled) return;
            const src = event.target?.result as string;
            if (!src) {
                fail(new ImagePreparationError());
                return;
            }

            if (!img) return;

            img.onload = () => {
                if (settled) return;
                try {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 1200;
                    const MAX_HEIGHT = 1200;
                    let width = img!.width;
                    let height = img!.height;

                    if (width <= 0 || height <= 0) {
                        fail(new ImagePreparationError());
                        return;
                    }

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }

                    canvas.width = Math.round(width);
                    canvas.height = Math.round(height);
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        fail(new ImagePreparationError());
                        return;
                    }

                    // Dessine la photo (efface les métadonnées de rotation d'Apple)
                    ctx.drawImage(img!, 0, 0, width, height);

                    // Convertit en pur JPEG
                    canvas.toBlob((blob) => {
                        if (settled) return;
                        if (blob) {
                            settled = true;
                            cleanup();
                            const newFileName = file.name.replace(/\.[^/.]+$/, "") + "_fixed.jpg";
                            const newFile = new File([blob], newFileName, { type: 'image/jpeg' });
                            resolve(newFile);
                        } else {
                            fail(new ImagePreparationError());
                        }
                    }, 'image/jpeg', 0.8);
                } catch (e) {
                    fail(e);
                }
            };

            img.onerror = () => {
                fail(new ImagePreparationError());
            };

            img.src = src;
        };

        reader.onerror = () => {
            fail(new ImagePreparationError());
        };

        reader.onabort = () => {
            fail(new ImagePreparationError());
        };

        try {
            reader.readAsDataURL(file);
        } catch (e) {
            fail(e);
        }
    });
};

export const processImageForBackend = processBeerCallImage;
