/**
 * Panneau de diagnostic de fluidité (`?perf=1`).
 *
 * Le panneau et son bouton ne sont compilés que si `VITE_FF_PERF_PANEL=1`.
 * Sans cette variable (build standard), la constante vaut `false`, le module
 * virtuel ne contient qu'un `null` et le chunk du panneau n'est pas produit.
 */
export const FF_PERF_PANEL = import.meta.env.VITE_FF_PERF_PANEL === '1';
