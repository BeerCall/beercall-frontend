/**
 * 8h-4b-1 — Activation du parcours de mesure des mondes.
 *
 * Le panneau et son bouton ne sont compilés que si `VITE_WORLD_PROBE=1`.
 * Sans cette variable (build standard), la constante vaut `false` et le
 * panneau n'est jamais importé ni rendu.
 */
export const WORLD_PROBE_ENABLED = import.meta.env.VITE_WORLD_PROBE === '1';

export const WORLD_PROBE_COMMIT = import.meta.env.VITE_APP_COMMIT?.trim() || 'inconnu';
export const WORLD_PROBE_BUILD_TIME = import.meta.env.VITE_APP_BUILD_TIME?.trim() || 'inconnu';
