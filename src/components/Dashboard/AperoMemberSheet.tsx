import {useEffect, useMemo, useRef} from 'react';
import {createPortal} from 'react-dom';
import type {AperoStatus, BeerCall} from '../../types/api';

/** Provenance d'affichage d'un apéro, pour conserver l'action individuelle actuelle. */
export type AperoCallKind = 'active' | 'scheduled' | 'past';

export interface AperoMemberSheetProps {
    calls: readonly BeerCall[];
    kindOf: (call: BeerCall) => AperoCallKind;
    onClose: () => void;
    onSelect: (call: BeerCall) => void;
    returnFocus?: HTMLElement | null;
}

const ACTION_LABEL: Record<AperoCallKind, string> = {
    active: "Voir l'apéro",
    scheduled: 'Participer',
    past: 'Voir le monde',
};

const STATUS_LABEL: Record<AperoStatus, string> = {
    active: 'Actif',
    scheduled: 'Programmé',
    ended: 'Passé',
    cancelled: 'Passé',
};

/** Même repli d'affichage que `aperoClusters` : un statut inconnu se lit comme passé. */
function displayStatus(status: AperoStatus): AperoStatus {
    switch (status) {
        case 'active':
        case 'scheduled':
        case 'ended':
        case 'cancelled':
            return status;
        default:
            return 'ended';
    }
}

function statusRank(status: AperoStatus): number {
    switch (displayStatus(status)) {
        case 'active':
            return 0;
        case 'scheduled':
            return 1;
        case 'ended':
            return 2;
        case 'cancelled':
            return 3;
    }
}

function statusLabel(status: AperoStatus): string {
    return STATUS_LABEL[displayStatus(status)] ?? STATUS_LABEL.ended;
}

function compareCalls(a: BeerCall, b: BeerCall): number {
    const rank = statusRank(a.status) - statusRank(b.status);
    if (rank !== 0) return rank;
    if (a.location_name !== b.location_name) return a.location_name < b.location_name ? -1 : 1;
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
}

/**
 * 14b-2 — sélection accessible des apéros inséparables.
 *
 * Portail hors de la carte, dialogue modal, une ligne par apéro avec son action
 * individuelle. Ne déplace aucune coordonnée et n'invente aucun apéro.
 */
export function AperoMemberSheet({calls, kindOf, onClose, onSelect, returnFocus}: AperoMemberSheetProps) {
    const closeRef = useRef<HTMLButtonElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        closeRef.current?.focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
                return;
            }
            if (event.key !== 'Tab') return;
            const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
                'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            );
            if (!focusables || focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (!dialogRef.current?.contains(document.activeElement)) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
            } else if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            const target = returnFocus ?? previous;
            if (target?.isConnected) target.focus();
        };
    }, [onClose, returnFocus]);

    const rows = useMemo(() => [...calls].sort(compareCalls), [calls]);

    return createPortal(
        <div
            data-testid="apero-member-sheet-backdrop"
            className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-900/60 p-4"
            onClick={onClose}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="apero-member-sheet-title"
                className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 text-slate-50 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-3 px-4 pt-4">
                    <h2 id="apero-member-sheet-title" className="text-base font-semibold">
                        Apéros au même endroit
                    </h2>
                    <button
                        ref={closeRef}
                        type="button"
                        onClick={onClose}
                        className="min-h-11 rounded-full px-3 text-sm font-medium text-slate-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                        Fermer
                    </button>
                </div>
                <ul className="mt-3 max-h-[60vh] space-y-1 overflow-y-auto overscroll-contain px-2 pb-4">
                    {rows.map((call) => (
                        <li key={call.id}>
                            <button
                                type="button"
                                onClick={() => onSelect(call)}
                                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                            >
                                <span className="flex min-w-0 flex-col">
                                    <span className="truncate text-sm font-medium">{call.location_name}</span>
                                    <span className="text-xs text-slate-400">{statusLabel(call.status)}</span>
                                </span>
                                <span className="shrink-0 text-xs font-semibold text-amber-300">
                                    {ACTION_LABEL[kindOf(call)]}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </div>,
        document.body,
    );
}
