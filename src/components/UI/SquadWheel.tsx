import type { ReactNode } from 'react';
import { Beer, Martini, Pizza, Rocket, Ghost, Flame, Plus, Key } from 'lucide-react';
import type { Squad } from '../../types/api';
import { squadLabel } from '../../lib/squadLabel';

const SQUAD_ICONS: Record<string, ReactNode> = {
    beer: <Beer size={24} />, cocktail: <Martini size={24} />, pizza: <Pizza size={24} />,
    rocket: <Rocket size={24} />, ghost: <Ghost size={24} />, fire: <Flame size={24} />,
};

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
 * 8b — dock fixe des squads, sans pagination. Toutes les squads tiennent sur
 * l'écran (6 par rangée, retour à la ligne au-delà), avec une rangée d'actions
 * collée au-dessus de la barre du bas.
 */
export default function SquadWheel({ squads, currentSquadId, isLoading = false, isNightMode = false, onSelect, onCreate, onJoin }: SquadWheelProps) {
    const currentId = currentSquadId ?? '';
    const labelTone = isNightMode
        ? 'text-beer-light drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]'
        : 'text-gray-900 drop-shadow-[0_1px_2px_rgba(255,255,255,0.95)]';

    return <section role="region" aria-label="Barre des squads" data-squad-dock
                    className="flex flex-col w-full select-none pointer-events-none">
        {/* 6 par rangée : 6×56 + 5×4 = 356 px, dans 390 − 24 de marge. */}
        <div data-squad-row className="flex flex-wrap justify-center items-start gap-x-1 gap-y-1 px-3 pt-1 w-full pointer-events-auto">
            {isLoading ? (
                <p role="status" className={`w-[120px] text-center text-xs leading-[14px] ${labelTone} rounded px-1`}>Chargement des squads…</p>
            ) : squads.map(squad => {
                const isActive = String(squad.id) === currentId;
                return (
                    <div key={squad.id} className="w-14 flex flex-col items-center">
                        <button aria-label={squad.name} aria-current={isActive ? 'page' : undefined}
                                data-squad-id={squad.id}
                                onClick={() => onSelect(squad.id)}
                                className={`w-12 h-12 rounded-full text-white flex items-center justify-center shadow-lg ${isActive ? 'ring-4 ring-beer' : 'border-4 border-white'}`}
                                style={{backgroundColor: squad.color || '#F59E0B'}}>
                            {SQUAD_ICONS[squad.icon] ?? SQUAD_ICONS.beer}
                        </button>
                        <span data-squad-label data-squad-id={squad.id}
                              className={`mt-1 w-14 overflow-hidden text-center text-[11px] leading-[13px] font-bold ${labelTone} rounded px-0.5 whitespace-nowrap`}>
                            {squadLabel(squad.name)}
                        </span>
                    </div>
                );
            })}
        </div>

        {/* Dernière rangée : actions collées à la barre du bas (2 px). */}
        <div data-squad-actions className="flex justify-center items-start gap-10 px-4 pb-0.5 w-full pointer-events-auto">
            <div className="w-[76px] flex flex-col items-center">
                <button aria-label="Créer" onClick={onCreate}
                        className="w-12 h-12 rounded-full bg-white border-4 border-orange-100 flex items-center justify-center text-beer shadow-lg">
                    <Plus size={26}/>
                </button>
                <span data-squad-label className={`mt-0.5 w-[76px] text-center text-[11px] leading-[13px] font-bold ${labelTone} rounded px-1`}>Créer</span>
            </div>
            <div className="w-[76px] flex flex-col items-center">
                <button aria-label="Rejoindre" onClick={onJoin}
                        className="w-12 h-12 rounded-full bg-white border-4 border-blue-100 flex items-center justify-center text-blue-700 shadow-lg">
                    <Key size={24}/>
                </button>
                <span data-squad-label className={`mt-0.5 w-[76px] text-center text-[11px] leading-[13px] font-bold ${labelTone} rounded px-1`}>Rejoindre</span>
            </div>
        </div>
    </section>;
}
