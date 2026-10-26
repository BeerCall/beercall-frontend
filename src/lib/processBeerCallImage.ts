export const processBeerCallImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1200;
                const MAX_HEIGHT = 1200;
                let width = img.width;
                let height = img.height;

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

                // Dessine la photo (efface les métadonnées de rotation d'Apple)
                ctx?.drawImage(img, 0, 0, width, height);

                // Convertit en pur JPEG
                canvas.toBlob((blob) => {
                    if (blob) {
                        const newFileName = file.name.replace(/\.[^/.]+$/, "") + "_fixed.jpg";
                        const newFile = new File([blob], newFileName, {type: 'image/jpeg'});
                        resolve(newFile);
                    } else {
                        reject(new Error("Erreur Blob"));
                    }
                }, 'image/jpeg', 0.8);
            };
        };
        reader.onerror = (error) => reject(error);
    });
};

export const processImageForBackend = processBeerCallImage;
