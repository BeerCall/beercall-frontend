import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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

function SquadConfirmation({ squad, trigger, onClose, onConfirm }: {
    squad: Squad; trigger: HTMLButtonElement; onClose: () => void; onConfirm: () => void;
}) {
    const titleId = useId();
    const cancelRef = useRef<HTMLButtonElement>(null);
    const confirmed = useRef(false);
    useEffect(() => {
        cancelRef.current?.focus();
        return () => { if (trigger.isConnected) trigger.focus(); };
    }, [trigger]);
    return createPortal(<>
        <div className="fixed inset-0 z-[100] bg-black/60" onClick={onClose} />
        <div role="dialog" aria-modal="true" aria-labelledby={titleId}
             className="fixed z-[101] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%_-_32px)] max-w-96 max-h-[calc(100dvh_-_32px)] overflow-y-auto bg-white rounded-3xl p-6 shadow-2xl"
             onKeyDown={event => {
                 if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
                 if (event.key === 'Tab') {
                     const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button');
                     const first = buttons[0], last = buttons[buttons.length - 1];
                     if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                     else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
                 }
             }}>
            <h2 id={titleId} className="text-xl font-black text-gray-900">Ouvrir cette squad ?</h2>
            <p className="my-5 font-bold text-gray-900 [overflow-wrap:anywhere]">{squad.name}</p>
            <div className="flex flex-wrap gap-3">
                <button ref={cancelRef} onClick={onClose} className="flex-1 rounded-2xl p-3 bg-gray-100 text-gray-900 font-bold">Annuler</button>
                <button onClick={() => {
                    if (confirmed.current) return;
                    confirmed.current = true;
                    onConfirm();
                }} className="flex-1 rounded-2xl p-3 bg-gray-900 text-white font-bold">Ouvrir la squad</button>
            </div>
        </div>
    </>, document.body);
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
    const [confirmation, setConfirmation] = useState<{
        id: number; page: number; currentId: string; trigger: HTMLButtonElement;
    } | null>(null);
    const selected = confirmation && confirmation.page === page && confirmation.currentId === currentId
        ? squads.find(squad => squad.id === confirmation.id) : undefined;
    if (confirmation && !selected) setConfirmation(null);
    const active = squads.find(squad => String(squad.id) === currentId);
    const suppressClick = useRef(false);
    const dragX = useMotionValue(0);
    const negateX = useTransform(dragX, value => -value);
    const rotation = useTransform(dragX, [-150, 150], [-16, 16]);
    const counterRotation = useTransform(rotation, value => -value);
    const changePage = (index: number) => {
        setConfirmation(null);
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
                    if ((event.target as HTMLElement).closest('[role="dialog"]')) return;
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
                                if (isTap(event)) setConfirmation({ id: squad.id, page, currentId, trigger: event.currentTarget });
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
        {selected && confirmation && <SquadConfirmation squad={selected} trigger={confirmation.trigger}
            onClose={() => setConfirmation(null)} onConfirm={() => { setConfirmation(null); onSelect(selected.id); }} />}
    </div>;
}
