/**
 * B01 — Flags de format Vite (`glbAvatar`, `glbWorlds`).
 *
 * Lecture de `import.meta.env` à CHAQUE appel (un build peut changer les valeurs
 * injectées, et les tests doivent pouvoir les modifier sans recharger le module).
 * Défaut : activé. Seules les chaînes `'0'` et `'false'` désactivent. Ces flags
 * changent le FORMAT des modèles, jamais la lease WebGL ni les surfaces 2D.
 */
export type FeatureFlag = 'glbAvatar' | 'glbWorlds';

const ENV_KEYS: Record<FeatureFlag, string> = {
    glbAvatar: 'VITE_FF_GLB_AVATAR',
    glbWorlds: 'VITE_FF_GLB_WORLDS',
};

export function isFeatureEnabled(flag: FeatureFlag): boolean {
    const raw = import.meta.env?.[ENV_KEYS[flag]];
    if (typeof raw !== 'string') return true;
    const value = raw.trim().toLowerCase();
    return value !== '0' && value !== 'false';
}
