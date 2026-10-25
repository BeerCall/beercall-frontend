import { useFBX } from '@react-three/drei';
import { MODELS_URL } from '../../lib/api';
import type { AvatarConfig } from '../../types/avatar';

/**
 * Prépare les FBX d'un avatar pendant que la carte s'initialise.
 *
 * `useFBX.preload` remplit le cache de `useLoader` (téléchargement + parse).
 * Quand le Canvas de l'avatar est monté après `onLoad`, les modèles sont déjà
 * prêts : la chaîne « carte → Canvas → FBX → animation » n'est plus sérialisée.
 * L'appel est idempotent et ne doit jamais faire échouer le rendu (jsdom, SSR).
 */
export function warmAvatarModels(config: AvatarConfig | null | undefined) {
    if (!config) return;
    for (const part of [config.head, config.body, config.legs, config.feet, config.accessory]) {
        if (!part || part === 'none') continue;
        try {
            useFBX.preload(`${MODELS_URL}/${part}.fbx`);
        } catch {
            // Un préchargement opportuniste ne doit pas casser l'écran.
        }
    }
}
