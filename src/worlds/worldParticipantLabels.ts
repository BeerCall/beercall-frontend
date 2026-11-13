import type { WorldParticipant } from '../types/api';
import type { WorldKind } from './pocWorldScenario';

/** Une excuse n'est affichée que dans le monde Piscine. */
export function excuseForWorld(world: WorldKind, participant: Pick<WorldParticipant, 'excuse'>): string | null {
    if (world !== 'piscine') return null;
    return participant.excuse?.trim() || null;
}

/** La Piscine garde son pseudo dans la bulle d'excuse, sans le dupliquer. */
export function nameForWorld(world: WorldKind, participant: Pick<WorldParticipant, 'username'>): string | null {
    if (world === 'piscine') return null;
    return participant.username?.trim() || null;
}
