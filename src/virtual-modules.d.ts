declare module 'virtual:world-probe' {
    import type { ComponentType } from 'react';
    import type { WorldProbePanelProps } from './perf/WorldProbePanel';

    /** `null` dans le build standard ; composant lazy dans le build de recette. */
    export const WorldProbePanel: ComponentType<WorldProbePanelProps> | null;
}
