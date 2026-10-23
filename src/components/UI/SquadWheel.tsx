import { useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Beer, Martini, Pizza, Rocket, Ghost, Flame, Plus, Key } from 'lucide-react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import type { Squad } from '../../types/api';
import { clampSquadPage, squadPageForId, squadWheelPage, WHEEL_ACTION_ANGLES } from '../../lib/squadWheel';

const SQUAD_ICONS: Record<string, ReactNode> = {
    beer: <Beer size={24} />, cocktail: <Martini size={24} />, pizza: <Pizza size={24} />,
    rocket: <Rocket size={24} />, ghost: <Ghost size={24} />, fire: <Flame size={24} />,
};

interface SquadWheelProps {
    squads: Squad[];
    currentSquadId?: string;
    isLoading?: boolean;
    onSelect: (id: number) => void;
    onCreate: () => void;
    onJoin: () => void;
}

export default function SquadWheel({ squads, currentSquadId, isLoading = false, onSelect, onCreate, onJoin }: SquadWheelProps) {
    const currentId = currentSquadId ?? '';
    const [pageState, setPageState] = useState(() => ({
        currentId, count: squads.length, index: squadPageForId(squads, currentId),
    }));
    let page = clampSquadPage(pageState.index, squads.length);
    if (pageState.currentId !== currentId || pageState.count !== squads.length) {
        if (pageState.currentId !== currentId || pageState.count === 0) page = squadPageForId(squads, currentId);
        setPageState({ currentId, count: squads.length, index: page });
    }
    const wheel = squadWheelPage(squads, page);
    const active = squads.find(squad => String(squad.id) === currentId);
    const suppressClick = useRef(false);
    const dragX = useMotionValue(0);
    const negateX = useTransform(dragX, value => -value);
    const rotation = useTransform(dragX, [-150, 150], [-16, 16]);
    const counterRotation = useTransform(rotation, value => -value);
    const changePage = (index: number) => {
        setPageState({ currentId, count: squads.length, index: clampSquadPage(index, squads.length) });
    };
    const isTap = (event: MouseEvent<HTMLButtonElement>) => event.detail === 0 || !suppressClick.current;
    const placement = (angle: number) => ({
        left: 144 + 144 * Math.sin(angle * Math.PI / 180),
        top: 144 - 144 * Math.cos(angle * Math.PI / 180),
        rotate: counterRotation,
    });
    return <div role="region" aria-label="Navigation des squads"
                className="relative h-[160px] overflow-hidden pointer-events-none"
                onKeyDown={event => {
                    if (event.key === 'ArrowLeft') { event.preventDefault(); changePage(wheel.previous); }
                    if (event.key === 'ArrowRight') { event.preventDefault(); changePage(wheel.next); }
                }}>
        <div className="absolute top-[36px] left-1/2 -translate-x-1/2 w-[288px] h-[288px] rounded-full border-t-[3px] border-beer/20" />
        <motion.div drag="x" dragConstraints={{ left: -150, right: 150 }} dragElastic={0} dragMomentum={false}
                    style={{ x: dragX }}
                    className="absolute top-[36px] left-[calc(50%_-_144px)] w-[288px] h-[288px] cursor-grab active:cursor-grabbing pointer-events-auto"
                    onPointerDownCapture={() => { suppressClick.current = false; }}
                    onDragEnd={(_, info) => {
                        suppressClick.current = Math.abs(info.offset.x) >= 50;
                        if (info.offset.x <= -50) changePage(wheel.next);
                        else if (info.offset.x >= 50) changePage(wheel.previous);
                        dragX.set(0);
                    }}>
            <motion.div style={{ x: negateX, rotate: rotation, originX: '50%', originY: '50%' }} className="w-full h-full relative">
                <motion.div style={placement(WHEEL_ACTION_ANGLES.create)} className="absolute w-[72px] -translate-x-1/2 -translate-y-6 flex flex-col items-center">
                    <button aria-label="Créer" onClick={event => { if (isTap(event)) onCreate(); }}
                            className="w-12 h-12 rounded-full bg-white border-4 border-orange-100 flex items-center justify-center text-beer shadow-lg"><Plus size={26} /></button>
                    <span data-wheel-label className="mt-1 w-[72px] truncate text-center text-xs leading-[14px] font-bold text-gray-900">Créer</span>
                </motion.div>
                {!isLoading && wheel.items.map(({ squad, angle }) => <motion.div key={squad.id} style={placement(angle)}
                    className="absolute w-[48px] -translate-x-1/2 -translate-y-6 flex flex-col items-center">
                    <button aria-label={squad.name} aria-current={String(squad.id) === currentId ? 'page' : undefined}
                            onClick={event => {
                                if (isTap(event)) onSelect(squad.id);
                            }}
                            className={`w-12 h-12 rounded-full text-white flex items-center justify-center shadow-lg ${String(squad.id) === currentId ? 'ring-4 ring-beer' : 'border-4 border-white'}`}
                            style={{ backgroundColor: squad.color || '#F59E0B' }}>
                        {SQUAD_ICONS[squad.icon] ?? SQUAD_ICONS.beer}
                    </button>
                    <span data-wheel-label className="mt-1 w-[48px] truncate text-center text-xs leading-[14px] font-bold text-gray-900">{squad.name}</span>
                </motion.div>)}
                <motion.div style={placement(WHEEL_ACTION_ANGLES.join)} className="absolute w-[72px] -translate-x-1/2 -translate-y-6 flex flex-col items-center">
                    <button aria-label="Rejoindre" onClick={event => { if (isTap(event)) onJoin(); }}
                            className="w-12 h-12 rounded-full bg-white border-4 border-blue-100 flex items-center justify-center text-blue-700 shadow-lg"><Key size={24} /></button>
                    <span data-wheel-label className="mt-1 w-[72px] truncate text-center text-xs leading-[14px] font-bold text-gray-900">Rejoindre</span>
                </motion.div>
            </motion.div>
        </motion.div>
        {isLoading ? <p role="status" className="absolute top-[100px] left-1/2 -translate-x-1/2 w-[120px] text-center text-xs leading-[14px] text-gray-900">Chargement des squads…</p>
            : active && <p data-wheel-active className="absolute top-[100px] left-1/2 -translate-x-1/2 w-[120px] h-7 line-clamp-2 break-all text-center text-xs leading-[14px] text-gray-900 font-bold">{active.name}</p>}
        {wheel.pageCount > 1 && <div data-wheel-controls className="absolute bottom-0 h-7 inset-x-0 flex items-center justify-center gap-3 pointer-events-auto text-xs text-gray-900">
            <button aria-label="Page précédente" disabled={page === 0} onClick={() => changePage(wheel.previous)} className="h-7 px-3 rounded-lg bg-white disabled:opacity-50">←</button>
            <span aria-live="polite">Page {page + 1}/{wheel.pageCount}</span>
            <button aria-label="Page suivante" disabled={page === wheel.pageCount - 1} onClick={() => changePage(wheel.next)} className="h-7 px-3 rounded-lg bg-white disabled:opacity-50">→</button>
        </div>}
    </div>;
}
