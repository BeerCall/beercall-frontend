import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

interface ManifestThumbnail {
    url: string;
    sha256: string;
    bytes: number;
    width: number;
    height: number;
}

interface ManifestItem {
    sourceId: string;
    thumbnail?: ManifestThumbnail;
}

interface Manifest {
    items: ManifestItem[];
}

const MODELS_ROOT = resolve(process.cwd(), '../beercall-backend/static/models');
const MANIFEST_PATH = resolve(MODELS_ROOT, 'glb/manifest.json');
const BORDER_PX = 4;
const EXPECTED_THUMBNAILS = 159;

describe('vignettes du catalogue', () => {
    it(
        'les 159 vignettes ne touchent jamais la bordure de 4 px',
        async () => {
            const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
            const entries = manifest.items.filter((item) => item.thumbnail);
            const problems: string[] = [];

            expect(entries).toHaveLength(EXPECTED_THUMBNAILS);

            for (const item of entries) {
                const thumbnail = item.thumbnail as ManifestThumbnail;
                const file = resolve(MODELS_ROOT, thumbnail.url.replace('/models/', ''));
                if (!existsSync(file)) {
                    problems.push(`${item.sourceId}: fichier absent (${thumbnail.url})`);
                    continue;
                }

                const { data, info } = await sharp(file)
                    .ensureAlpha()
                    .raw()
                    .toBuffer({ resolveWithObject: true });

                if (info.width !== 192 || info.height !== 192) {
                    problems.push(`${item.sourceId}: dimensions ${info.width}x${info.height}`);
                    continue;
                }

                let touched: { x: number; y: number } | null = null;
                for (let y = 0; y < info.height && !touched; y += 1) {
                    for (let x = 0; x < info.width; x += 1) {
                        const onBorder = x < BORDER_PX
                            || y < BORDER_PX
                            || x >= info.width - BORDER_PX
                            || y >= info.height - BORDER_PX;
                        if (!onBorder) continue;
                        const alpha = data[(y * info.width + x) * info.channels + 3];
                        if (alpha > 0) {
                            touched = { x, y };
                            break;
                        }
                    }
                }

                if (touched) {
                    problems.push(`${item.sourceId}: pixel alpha>0 en (${touched.x}, ${touched.y})`);
                }
            }

            expect(problems).toEqual([]);
        },
        120_000,
    );
});
