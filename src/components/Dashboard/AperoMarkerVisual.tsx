import type {AperoStatus} from '../../types/api';
import {
    APERO_NAVY,
    APERO_SLATE,
    accentOnNavy,
    readableInk,
} from './aperoMarkerStyle';

/**
 * Design system des marqueurs d'apéros (14d) : un seul médaillon rond, une
 * chope BeerCall, une pilule de statut et une pointe GPS. Les couleurs
 * viennent de la squad ; le statut se lit dans le médaillon et la pilule.
 */
function statusColor(status: AperoStatus, color: string): string {
    if (status === 'active') return color;
    if (status === 'scheduled') return APERO_NAVY;
    return APERO_SLATE;
}

function displayStatuses(statuses: readonly AperoStatus[]): AperoStatus[] {
    return [...new Set(statuses.map((status) =>
        status === 'active' || status === 'scheduled' ? status : 'ended'))];
}

interface MugProps {
    variant: 'active' | 'scheduled' | 'past' | 'group';
    color: string;
    className?: string;
}

/** Chope officielle BeerCall, déclinée du même tracé pour tous les marqueurs. */
export function BeerCallMug({variant, color, className}: MugProps) {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={variant === 'group' ? 2.4 : 2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            style={{color}}
        >
            <path d="M6 8h10v9a3 3 0 01-3 3H9a3 3 0 01-3-3V8zm10 2h2.5a1.5 1.5 0 011.5 1.5v2a1.5 1.5 0 01-1.5 1.5H16"/>
            {(variant === 'active' || variant === 'scheduled' || variant === 'group') && (
                <path d="M5 6.5C5 5.1 6.3 4 8 4c.9 0 1.7.3 2.2.8C10.8 4.3 11.6 4 12.5 4c1.9 0 3.5 1.1 3.5 2.5"/>
            )}
            {variant === 'active' && <path d="M9 11v5M13 11v5"/>}
        </svg>
    );
}

function PinTip() {
    return (
        <span
            aria-hidden="true"
            className="apero-pin-tip"
        />
    );
}

interface BadgeProps {
    variant: 'active' | 'scheduled' | 'past';
    color: string;
    pillText: string;
    pillKind: 'navy' | 'squad' | 'past';
    ready?: boolean;
}

/** Médaillon unique + pilule + pointe, pour un apéro individuel. */
export function AperoMarkerBadge({variant, color, pillText, pillKind, ready = false}: BadgeProps) {
    const small = variant === 'past';
    const size = small ? 'h-10 w-10' : 'h-12 w-12';
    const pillBackground = pillKind === 'navy'
        ? APERO_NAVY
        : pillKind === 'squad' ? color : '#F1F5F9';
    const pillInk = pillKind === 'navy'
        ? '#FFFFFF'
        : pillKind === 'squad' ? readableInk(color) : '#475569';
    const mugSize = small ? 'h-4 w-4' : variant === 'active' ? 'h-6 w-6' : 'h-5 w-5';
    const medallion = variant === 'past'
        ? APERO_SLATE
        : variant === 'scheduled' ? APERO_NAVY : color;
    const mugColor = variant === 'scheduled' ? accentOnNavy(color) : readableInk(medallion);

    return (
        <span className="flex flex-col items-center">
            <span className="relative flex items-center justify-center">
                {variant === 'active' && (
                    <span
                        aria-hidden="true"
                        className="apero-pulse-ring absolute -inset-2 rounded-full"
                        style={{backgroundColor: color}}
                    />
                )}
                <span
                    className={`relative z-10 flex items-center justify-center rounded-full border-[3px] border-white shadow-xl ${size}`}
                    style={{
                        backgroundColor: medallion,
                        boxShadow: variant === 'active'
                            ? `0 8px 20px -4px ${color}73`
                            : '0 8px 18px -6px rgba(15, 23, 42, 0.45)',
                    }}
                >
                    {variant === 'scheduled' ? (
                        <span
                            className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed"
                            style={{borderColor: accentOnNavy(color)}}
                        >
                            <BeerCallMug variant="scheduled" color={mugColor}
                                         className={mugSize}/>
                        </span>
                    ) : (
                        <BeerCallMug variant={variant} color={mugColor} className={mugSize}/>
                    )}
                </span>
            </span>
            <span
                className="-mt-2 z-10 flex items-center gap-1 whitespace-nowrap rounded-full border-2 border-white px-2.5 py-0.5 text-[8px] font-black uppercase italic leading-none tracking-wider shadow-md"
                style={{backgroundColor: pillBackground, color: pillInk}}
            >
                {variant === 'active' && (
                    <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 animate-pulse motion-reduce:animate-none rounded-full"
                        style={{backgroundColor: accentOnNavy(color)}}
                    />
                )}
                {variant === 'past' && (
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#94A3B8]"/>
                )}
                {variant === 'scheduled' && ready && (
                    <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 animate-pulse motion-reduce:animate-none rounded-full"
                        style={{backgroundColor: readableInk(color)}}
                    />
                )}
                {ready ? 'PRÊT' : pillText}
            </span>
            <PinTip/>
        </span>
    );
}

interface GroupProps {
    count: number;
    color: string;
    statuses: readonly AperoStatus[];
    dominantStatus: AperoStatus;
}

function statusDot(status: AperoStatus, color: string): string {
    if (status === 'active') return accentOnNavy(color);
    if (status === 'scheduled') return '#818CF8';
    return '#CBD5E1';
}

/**
 * Médaillon dédoublé pour un groupe : les cercles arrière disent quels
 * statuts sont présents, le cercle avant garde le statut dominant.
 */
export function AperoGroupBadge({count, color, statuses, dominantStatus}: GroupProps) {
    const display = displayStatuses(statuses);
    const front = statusColor(dominantStatus, color);
    const backRight = display.includes('ended') ? APERO_SLATE
        : display.includes('scheduled') ? APERO_NAVY : color;
    const backLeft = display.includes('active')
        ? color
        : display.includes('scheduled') ? APERO_NAVY : APERO_SLATE;

    return (
        <span className="flex flex-col items-center">
            <span className="relative flex items-center justify-center">
                <span
                    aria-hidden="true"
                    className="absolute -right-2 -top-1 h-12 w-12 rounded-full border-[2.5px] border-white shadow-md"
                    style={{backgroundColor: backRight}}
                />
                <span
                    aria-hidden="true"
                    className="absolute -left-1.5 -top-0.5 h-12 w-12 rounded-full border-[2.5px] border-white opacity-80 shadow-md"
                    style={{backgroundColor: backLeft}}
                />
                <span
                    className="relative z-10 flex h-12 w-12 items-center justify-center gap-0.5 rounded-full border-[3px] border-white shadow-xl"
                    style={{
                        backgroundColor: front,
                        boxShadow: `0 8px 20px -4px ${front}73`,
                    }}
                >
                    <BeerCallMug variant="group" color={readableInk(front)} className="h-4 w-4"/>
                    <span
                        className={`font-black italic leading-none tabular-nums ${count > 9 ? 'text-sm' : 'text-lg'}`}
                        style={{color: readableInk(front)}}
                    >
                        {count}
                    </span>
                </span>
            </span>
            <span
                className="-mt-2 z-10 flex items-center gap-1 whitespace-nowrap rounded-full border-2 border-white px-2.5 py-0.5 text-[8px] font-black uppercase italic leading-none tracking-wider text-white shadow-md"
                style={{backgroundColor: APERO_NAVY}}
            >
                <span
                    aria-hidden="true"
                    data-testid="apero-group-statuses"
                    className="flex items-center gap-0.5"
                >
                    {display.map((status) => (
                        <span
                            key={status}
                            className="h-1.5 w-1.5 rounded-full"
                            style={{backgroundColor: statusDot(status, color)}}
                        />
                    ))}
                </span>
                {count} SPOTS
            </span>
            <PinTip/>
        </span>
    );
}
