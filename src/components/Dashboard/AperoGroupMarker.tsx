import type {MouseEvent, PointerEvent} from 'react';
import type {AperoStatus} from '../../types/api';
import {AperoGroupBadge} from './AperoMarkerVisual';
import {squadAccent} from './aperoMarkerStyle';

/**
 * Pastille d'un groupe d'apéros (14d).
 *
 * Même langage visuel que les marqueurs individuels : médaillon rond dédoublé,
 * chope BeerCall, compteur et pilule. Le compteur reste le nombre d'apéros du
 * groupe, jamais le nombre de participants.
 */
export interface AperoGroupMarkerProps {
    count: number;
    color?: string | null;
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
    const display = [...new Set(statuses.map((status) =>
        status === 'active' || status === 'scheduled' ? status : 'ended'))];
    if (display.length === 0) return '';
    const words = display.map(statusWord);
    const joined = words.length === 1
        ? words[0]
        : `${words.slice(0, -1).join(', ')} et ${words[words.length - 1]}`;
    return ` Dont ${joined}.`;
}

export function AperoGroupMarker({
    count,
    color,
    statuses,
    dominantStatus,
    canExpand,
    onClick,
    onPointerDown,
}: AperoGroupMarkerProps) {
    const label = `${count} apéros regroupés.${canExpand
        ? ' Appuyer pour agrandir.'
        : ' Appuyer pour choisir un apéro.'}${statusSummary(statuses)}`;

    return (
        <button
            type="button"
            data-apero-marker="group"
            aria-label={label}
            onClick={onClick}
            onPointerDown={onPointerDown}
            className="group relative flex touch-manipulation items-center justify-center rounded-full transition-transform duration-200 hover:scale-105 active:scale-95 motion-reduce:hover:scale-100 motion-reduce:active:scale-100 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/80"
        >
            <span aria-hidden="true">
                <AperoGroupBadge
                    count={count}
                    color={squadAccent(color)}
                    statuses={statuses}
                    dominantStatus={dominantStatus}
                />
            </span>
        </button>
    );
}
