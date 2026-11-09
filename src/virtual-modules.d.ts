declare module 'virtual:world-probe' {
    import type { ComponentType } from 'react';
    import type { WorldProbePanelProps } from './perf/WorldProbePanel';

    /** `null` dans le build standard ; composant lazy dans le build de recette. */
    export const WorldProbePanel: ComponentType<WorldProbePanelProps> | null;

    /** `null` dans le build standard ; badge de préparation dans le build de recette. */
    export const WorldPreparationBadge: ComponentType | null;
}

declare module 'virtual:perf-panel' {
    import type { ComponentType } from 'react';

    /** `null` dans le build standard ; panneau lazy dans le build de recette. */
    export const PerformancePanel: ComponentType | null;
}
