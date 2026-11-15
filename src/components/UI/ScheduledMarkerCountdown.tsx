import {useEffect, useState, type MouseEvent} from 'react';
import {AperoMarkerBadge} from '../Dashboard/AperoMarkerVisual';
import {formatScheduledTime, squadAccent} from '../Dashboard/aperoMarkerStyle';

interface Props {
    scheduledFor: string;
    color?: string | null;
    label: string;
    onClick: (e: MouseEvent<HTMLButtonElement>) => void;
}

/**
 * Marqueur d'un apéro programmé (14d) : médaillon navy, chope couleur squad,
 * pilule avec l'heure ou « PRÊT » dans les 30 dernières minutes.
 *
 * Le seul intervalle de la couche reste celui-ci, et uniquement pour un
 * marqueur programmé individuel.
 */
export function ScheduledMarkerCountdown({scheduledFor, color, label, onClick}: Props) {
    const [timeLeft, setTimeLeft] = useState<number>(
        () => new Date(scheduledFor).getTime() - Date.now(),
    );

    useEffect(() => {
        const updateTimer = () => {
            setTimeLeft(new Date(scheduledFor).getTime() - Date.now());
        };
        updateTimer();
        const interval = setInterval(updateTimer, 5000);
        return () => clearInterval(interval);
    }, [scheduledFor]);

    const isReady = Number.isFinite(timeLeft) && timeLeft <= 1_800_000;
    const statusLabel = isReady ? 'PRÊT' : formatScheduledTime(scheduledFor);

    return (
        <button
            type="button"
            data-apero-marker="single"
            data-apero-status="scheduled"
            aria-label={`Participer à l'apéro ${label}. ${statusLabel}`}
            onClick={onClick}
            className="group relative flex touch-manipulation items-center justify-center rounded-full transition-transform duration-200 hover:scale-105 active:scale-95 motion-reduce:hover:scale-100 motion-reduce:active:scale-100 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/80"
        >
            <span aria-hidden="true">
                <AperoMarkerBadge
                    variant="scheduled"
                    color={squadAccent(color)}
                    pillText={formatScheduledTime(scheduledFor)}
                    pillKind="squad"
                    ready={isReady}
                />
            </span>
        </button>
    );
}
