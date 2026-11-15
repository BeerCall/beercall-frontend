import type {MouseEvent, PointerEvent} from 'react';
import type {AperoStatus} from '../../types/api';

/**
 * 14b-2 — pastille d'un groupe d'apéros.
 *
 * Présentationnel uniquement : aucun callback métier, aucun timer, aucune
 * animation permanente. Le compteur est le nombre d'apéros du groupe.
 */
export interface AperoGroupMarkerProps {
    count: number;
    statuses: readonly AperoStatus[];
    dominantStatus: AperoStatus;
    canExpand: boolean;
    onClick: (event: MouseEvent<HTMLButtonElement>) => void;
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
}

const STATUS_WORD: Record<AperoStatus, string> = {
    active: 'actif',
    scheduled: 'programmé',
    ended: 'passé',
    cancelled: 'passé',
};

function statusWord(status: AperoStatus): string {
    return STATUS_WORD[status] ?? STATUS_WORD.ended;
}

function statusSummary(statuses: readonly AperoStatus[]): string {
    if (statuses.length === 0) return '';
    const words = statuses.map(statusWord);
    const joined = words.length === 1
        ? words[0]
        : `${words.slice(0, -1).join(', ')} et ${words[words.length - 1]}`;
    return ` Dont ${joined}.`;
}

/** Liseré dominant : actif > programmé > passé, sans dépendre de la seule couleur du texte. */
function dominantRing(status: AperoStatus): string {
    switch (status) {
        case 'active':
            return 'ring-amber-300';
        case 'scheduled':
            return 'ring-indigo-400';
        default:
            return 'ring-slate-400';
    }
}

function dotClass(status: AperoStatus): string {
    switch (status) {
        case 'active':
            return 'bg-white';
        case 'scheduled':
            return 'bg-indigo-300';
        default:
            return 'bg-slate-300';
    }
}

export function AperoGroupMarker({
    count,
    statuses,
    dominantStatus,
    canExpand,
    onClick,
    onPointerDown,
}: AperoGroupMarkerProps) {
    // Trois statuts visuels : ended et cancelled partagent le même dot passé.
    const displayStatuses = [...new Set(statuses.map((status) =>
        status === 'active' || status === 'scheduled' ? status : 'ended'))];
    const label = `${count} apéros regroupés.${canExpand
        ? ' Appuyer pour agrandir.'
        : ' Appuyer pour choisir un apéro.'}${statusSummary(displayStatuses)}`;

    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClick}
            onPointerDown={onPointerDown}
            className={`relative flex h-11 w-11 touch-manipulation items-center justify-center rounded-full border-2 border-white bg-amber-500 text-white shadow-lg shadow-amber-500/40 ring-2 ${dominantRing(dominantStatus)} transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-4`}
        >
            <span
                aria-hidden="true"
                className="absolute -bottom-1 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 rounded-sm border-r border-b border-white bg-amber-500"
            />
            <span aria-hidden="true" className="relative z-10 text-sm font-bold leading-none tabular-nums">{count}</span>
            <span
                aria-hidden="true"
                className="absolute bottom-1 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-slate-900/85 px-1.5 py-0.5"
            >
                {displayStatuses.map((status) => (
                    <span key={status} className={`h-1.5 w-1.5 rounded-full ${dotClass(status)}`} />
                ))}
            </span>
        </button>
    );
}
