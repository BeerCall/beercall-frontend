/**
 * B13b — Contrat de readiness CPU pour scène 3D d'avatar (CHAL-09).
 *
 * Une scène 3D n'est prête que lorsque :
 * 1. Tous les assets attendus (pièces GLB/FBX) sont chargés.
 * 2. Le clip d'animation demandé est actif et appliqué sur les mixers.
 * 3. Au moins une frame a été effectivement soumise au GPU.
 * 4. Aucune erreur n'est survenue.
 */

export interface SceneReadinessState {
    assetsReady: boolean;
    clipActive: boolean;
    frameSubmitted: boolean;
    ready: boolean;
    error: string | null;
    loadedAssets: string[];
}

export class SceneReadiness {
    private readonly loaded = new Set<string>();
    private isClipActive = false;
    private isFrameSubmitted = false;
    private errorMessage: string | null = null;
    private readonly requiredAssets: readonly string[];
    private readonly onChange?: (state: SceneReadinessState) => void;
    private readonly onReady?: (state: SceneReadinessState) => void;

    constructor(
        requiredAssets: readonly string[] = [],
        onChange?: (state: SceneReadinessState) => void,
        onReady?: (state: SceneReadinessState) => void,
    ) {
        this.requiredAssets = [...requiredAssets];
        this.onChange = onChange;
        this.onReady = onReady;
    }

    assetLoaded(key: string): void {
        this.loaded.add(key);
        this.emit();
    }

    clipApplied(clipName: string): void {
        if (clipName) {
            this.isClipActive = true;
            this.emit();
        }
    }

    frameSubmitted(): void {
        this.isFrameSubmitted = true;
        this.emit();
    }

    failed(error: unknown): void {
        this.errorMessage = error instanceof Error ? error.message : String(error);
        this.emit();
    }

    reset(): void {
        this.loaded.clear();
        this.isClipActive = false;
        this.isFrameSubmitted = false;
        this.errorMessage = null;
        this.emit();
    }

    snapshot(): SceneReadinessState {
        const assetsReady =
            this.requiredAssets.length === 0 ||
            this.requiredAssets.every((key) => this.loaded.has(key));

        const ready =
            assetsReady &&
            this.isClipActive &&
            this.isFrameSubmitted &&
            this.errorMessage === null;

        return {
            assetsReady,
            clipActive: this.isClipActive,
            frameSubmitted: this.isFrameSubmitted,
            ready,
            error: this.errorMessage,
            loadedAssets: [...this.loaded].sort(),
        };
    }

    private emit(): void {
        const snap = this.snapshot();
        this.onChange?.(snap);
        if (snap.ready) {
            this.onReady?.(snap);
        }
    }
}
