import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion, useMotionValue, type PanInfo } from 'framer-motion';
import { Beer, Martini, Pizza, Rocket, Ghost, Flame, Plus, Key } from 'lucide-react';
import type { Squad } from '../../types/api';
import { squadLabels } from '../../lib/squadLabel';

const SQUAD_ICONS: Record<string, ReactNode> = {
    beer: <Beer size={22} />, cocktail: <Martini size={22} />, pizza: <Pizza size={22} />,
    rocket: <Rocket size={22} />, ghost: <Ghost size={22} />, fire: <Flame size={22} />,
};

/** Une seule rangée d'arc, 6 squads maximum visibles. */
const VISIBLE_SQUADS = 6;
const ARC_RADIUS = 300;
const ARC_TOP = 24;
const BAND_HEIGHT = 118;
/** Centres des 6 slots : 50,4 px d'écart, dans 390 px. */
const SLOT_OFFSETS = [-126, -75.6, -25.2, 25.2, 75.6, 126] as const;
const ACTION_OFFSETS = [-165, 165] as const;
const DRAG_THRESHOLD = 50;
const DRAG_STEP = 52;

function arcTop(offset: number): number {
    return ARC_TOP + ARC_RADIUS - Math.sqrt(ARC_RADIUS * ARC_RADIUS - offset * offset);
}

/** Centre réellement l'arc quel que soit le viewport (iPhone 390, 393, 430…). */
function centeredLeft(offset: number): string {
    return offset < 0
        ? `calc(50% - ${Math.abs(offset)}px)`
        : `calc(50% + ${offset}px)`;
}

interface SquadWheelProps {
    squads: Squad[];
    currentSquadId?: string;
    isLoading?: boolean;
    isNightMode?: boolean;
    onSelect: (id: number) => void;
    onCreate: () => void;
    onJoin: () => void;
}

/**
 * 8b-2 — arc unique, 6 squads visibles, défilement par glissement.
 * Géométrie reprise de l'ancien SquadWheel (bande clippée de 118 px, placement
 * sin/cos sur un disque centré, ancrage -translate-y-6, seuil de drag) avec un
 * rayon porté à 300 px pour loger 6 slots au lieu de 3. Créer et Rejoindre
 * restent fixes aux deux extrémités.
 */
export default function SquadWheel({ squads, currentSquadId, isLoading = false, isNightMode = false, onSelect, onCreate, onJoin }: SquadWheelProps) {
    const currentId = currentSquadId ?? '';
    const labelTone = isNightMode
        ? 'text-beer-light drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]'
        : 'text-gray-900 drop-shadow-[0_1px_2px_rgba(255,255,255,0.95)]';
    const suppressClick = useRef(false);
    const dragX = useMotionValue(0);

    // Plus récentes d'abord : l'API n'expose pas created_at, on trie sur l'id
    // auto-incrémenté (id le plus grand = squad créée en dernier).
    const ordered = useMemo(
        () => [...squads].sort((left, right) => right.id - left.id),
        [squads],
    );
    const labels = useMemo(() => squadLabels(ordered.map(squad => squad.name)), [ordered]);
    const maxStart = Math.max(0, ordered.length - VISIBLE_SQUADS);
    const [start, setStart] = useState(0);

    useEffect(() => {
        setStart(previous => Math.min(previous, maxStart));
    }, [maxStart]);

    // Garde la squad active dans la fenêtre de 6.
    useEffect(() => {
        const currentIndex = ordered.findIndex(squad => String(squad.id) === currentId);
        if (currentIndex < 0) return;
        setStart(previous => {
            if (currentIndex < previous) return currentIndex;
            if (currentIndex >= previous + VISIBLE_SQUADS) {
                return Math.max(0, Math.min(maxStart, currentIndex - VISIBLE_SQUADS + 1));
            }
            return previous;
        });
    }, [currentId, ordered, maxStart]);

    const visible = ordered.slice(start, start + VISIBLE_SQUADS);
    const slotStart = Math.floor((VISIBLE_SQUADS - visible.length) / 2);
    const shift = (delta: number) => {
        setStart(previous => Math.max(0, Math.min(maxStart, previous + delta)));
    };
    const isTap = (event: { detail: number }) => event.detail === 0 || !suppressClick.current;

    const handleDragEnd = (_event: unknown, info: PanInfo) => {
        const distance = info.offset.x;
        suppressClick.current = Math.abs(distance) >= 8;
        dragX.set(0);
        if (Math.abs(distance) < DRAG_THRESHOLD) return;
        const steps = Math.max(1, Math.round(Math.abs(distance) / DRAG_STEP));
        shift(distance < 0 ? steps : -steps);
    };

    return <section role="region" aria-label="Barre des squads" data-squad-dock
                    className="flex flex-col w-full select-none pointer-events-none">
        <div data-squad-arc className="relative w-full overflow-hidden" style={{height: BAND_HEIGHT}}>
            {/* Arc de cercle visible : rayon 300, seul le sommet est dans la bande. */}
            <div aria-hidden="true"
                 className="absolute rounded-full border-t-[3px] border-beer/20 pointer-events-none"
                 style={{left: `calc(50% - ${ARC_RADIUS}px)`, top: ARC_TOP, width: ARC_RADIUS * 2, height: ARC_RADIUS * 2}}/>

            <motion.div data-squad-drag
                        className="absolute inset-0 z-10 pointer-events-auto touch-none cursor-grab active:cursor-grabbing"
                        style={{x: dragX}}
                        drag="x"
                        dragConstraints={{left: -DRAG_STEP, right: DRAG_STEP}}
                        dragElastic={0}
                        dragMomentum={false}
                        onPointerDownCapture={() => { suppressClick.current = false; }}
                        onDragEnd={handleDragEnd}>
                {isLoading ? (
                    <p role="status"
                       className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[160px] text-center text-xs leading-[14px] ${labelTone} rounded px-1`}>
                        Chargement des squads…
                    </p>
                ) : visible.map((squad, index) => {
                    const slot = slotStart + index;
                    const offset = SLOT_OFFSETS[slot] ?? 0;
                    const isActive = String(squad.id) === currentId;
                    return (
                        <div key={squad.id} data-squad-slot={slot}
                             className="absolute w-[50px] -translate-x-1/2 -translate-y-6 flex flex-col items-center"
                             style={{left: centeredLeft(offset), top: arcTop(offset)}}>
                            <button aria-label={squad.name} aria-current={isActive ? 'page' : undefined}
                                    data-squad-id={squad.id}
                                    onClick={event => { if (isTap(event)) onSelect(squad.id); }}
                                    className={`w-11 h-11 rounded-full text-white flex items-center justify-center shadow-lg ${isActive ? 'ring-4 ring-beer' : 'border-4 border-white'}`}
                                    style={{backgroundColor: squad.color || '#F59E0B'}}>
                                {SQUAD_ICONS[squad.icon] ?? SQUAD_ICONS.beer}
                            </button>
                            <span data-squad-label data-squad-id={squad.id}
                                  className={`mt-1 w-[50px] text-center text-[11px] leading-[13px] font-bold ${labelTone} rounded whitespace-nowrap`}>
                                {/* 11 px bold : 7 W = 77,4 px, ramenés à 49,5 px par scaleX(0.64) < 50 px. */}
                                <span style={{display: 'inline-block', transform: 'scaleX(0.64)'}}>{labels[start + index]}</span>
                            </span>
                        </div>
                    );
                })}
            </motion.div>

            {/* Actions fixes aux deux bouts, hors de la zone de drag. */}
            <div data-squad-actions className="absolute inset-0 z-20 pointer-events-none">
                {[{label: 'Créer', offset: ACTION_OFFSETS[0], icon: <Plus size={24}/>, onClick: onCreate, className: 'border-orange-100 text-beer'},
                  {label: 'Rejoindre', offset: ACTION_OFFSETS[1], icon: <Key size={24}/>, onClick: onJoin, className: 'border-blue-100 text-blue-700'}]
                    .map(action => (
                        <div key={action.label}
                             className="absolute w-[76px] -translate-x-1/2 -translate-y-6 flex flex-col items-center"
                             style={{left: centeredLeft(action.offset), top: arcTop(action.offset)}}>
                            <button aria-label={action.label} onClick={action.onClick}
                                    className={`w-11 h-11 rounded-full bg-white border-4 flex items-center justify-center shadow-lg pointer-events-auto ${action.className}`}>
                                {action.icon}
                            </button>
                            <span data-squad-label className={`mt-1 w-[76px] text-center text-[10px] leading-[12px] font-bold ${labelTone} rounded px-1`}>
                                {action.label}
                            </span>
                        </div>
                    ))}
            </div>
        </div>
    </section>;
}
