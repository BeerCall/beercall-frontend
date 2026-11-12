import type { WorldParticipant } from '../types/api';
import type { WorldKind } from './pocWorldScenario';

/** Une excuse n'est affichée que dans le monde Piscine. */
export function excuseForWorld(
    world: WorldKind,
    participant: Pick<WorldParticipant, 'excuse'>,
): string | null {
    if (world !== 'piscine') return null;
    const excuse = participant.excuse?.trim();
    return excuse ? excuse : null;
}

export interface WorldExcuseBubbleProps {
    excuse: string;
    username?: string | null;
}

/**
 * 8f — bulle d'excuse legacy modernisée.
 * Blanc/cyan, pseudo orange, pointe vers la tête, ombre et arrondis travaillés.
 * Aucune animation, aucun backdrop-filter, aucun travail par image.
 */
export default function WorldExcuseBubble({ excuse, username }: WorldExcuseBubbleProps) {
    const text = excuse.trim();
    if (!text) return null;
    const name = username?.trim() || 'SQUAD MEMBER';
    return (
        <div data-world-excuse
             className="pointer-events-none relative w-max max-w-[240px] rounded-[1.15rem] border border-cyan-100 bg-white px-3.5 pb-2 pt-2.5 text-center shadow-[0_10px_28px_rgba(6,182,212,0.28),0_2px_6px_rgba(15,23,42,0.12)]">
            <p className="break-words text-[11px] font-bold leading-snug text-cyan-700">
                {text}
            </p>
            <span className="mt-1.5 inline-block max-w-full break-words rounded-full bg-amber-500 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-white">
                {name}
            </span>
            <span aria-hidden="true"
                  className="absolute left-1/2 top-full -ml-1.5 border-[6px] border-transparent border-t-white"/>
        </div>
    );
}
