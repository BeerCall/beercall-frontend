import type { WorldParticipant } from '../types/api';
import type { WorldKind } from './pocWorldScenario';
import WorldPhotoProof from './WorldPhotoProof';

/**
 * 8h — pseudo autonome au Bar et au Dodo. La Piscine garde son pseudo dans
 * la bulle d'excuse (8f), pour ne pas le dupliquer.
 */
export function nameForWorld(
    world: WorldKind,
    participant: Pick<WorldParticipant, 'username'>,
): string | null {
    if (world === 'piscine') return null;
    const name = participant.username?.trim();
    return name ? name : null;
}

export interface WorldNameLabelProps {
    username?: string | null;
}

export default function WorldNameLabel({ username }: WorldNameLabelProps) {
    const name = username?.trim() || 'SQUAD MEMBER';
    return (
        <span data-world-name
              className="pointer-events-none inline-block max-w-[200px] break-words rounded-full border-2 border-amber-400 bg-amber-500 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-white">
            {name}
        </span>
    );
}

export interface WorldIdentityStackProps {
    name: string | null;
    photoUrl?: string | null;
    onSelectPhoto?: (url: string) => void;
}

/**
 * Bar : photo au-dessus du pseudo (même ordre que l'ancien BarWorld).
 * Dodo : pseudo seul. Aucune animation, aucune mesure par frame.
 */
export function WorldIdentityStack({ name, photoUrl, onSelectPhoto }: WorldIdentityStackProps) {
    const hasPhoto = Boolean(photoUrl && onSelectPhoto);
    if (!name && !hasPhoto) return null;
    return (
        <div data-world-identity
             className="pointer-events-none flex flex-col items-center gap-1.5">
            {hasPhoto && <WorldPhotoProof url={photoUrl!} onSelect={onSelectPhoto!}/>}
            {name && <WorldNameLabel username={name}/>}
        </div>
    );
}
