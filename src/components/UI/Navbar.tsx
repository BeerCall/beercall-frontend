import {Users, User} from 'lucide-react';
import BigPintButton from './BigPintButton';
import SquadWheel from './SquadWheel';
import {useSquads} from '../../hooks/useSquads';
import {useNavigate, useParams} from 'react-router-dom';

interface NavbarProps {
    onCreateClick: () => void;
    onJoinClick: () => void;
    isNightMode?: boolean;
    /** B07 — lance l'apéro depuis le bouton central (Dashboard uniquement). */
    onLaunchApero?: () => void;
    launchAperoDisabled?: boolean;
}

export default function Navbar({
    onCreateClick,
    onJoinClick,
    isNightMode = false,
    onLaunchApero,
    launchAperoDisabled = false,
}: NavbarProps) {
    const navigate = useNavigate();
    const {data: squads, isLoading} = useSquads();
    const {id: currentSquadId} = useParams();
    const launchTitle = launchAperoDisabled
        ? 'Rejoins ou crée une squad pour lancer un apéro'
        : "Lancer l'apéro";

    return (
        <div className="relative w-full pointer-events-none">

            {/* LA ROULETTE (Boutons + Squads) */}
            <SquadWheel squads={squads ?? []} currentSquadId={currentSquadId} isLoading={isLoading} isNightMode={isNightMode}
                        onCreate={onCreateClick} onJoin={onJoinClick} onSelect={id => navigate(`/squad/${id}`)} />

            {/* BARRE DE NAVIGATION INFÉRIEURE */}
            <div
                data-bottom-nav
                className="h-[64px] bg-white border-t border-gray-100 px-8 flex justify-between items-center pt-1 pb-1 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] relative z-50 pointer-events-auto touch-none overscroll-none">
                <button
                    onClick={() => navigate('/connections')}
                    className="flex flex-col items-center min-w-11 min-h-11 justify-center text-gray-700 hover:text-amber-800"
                >
                    <Users size={24}/>
                    <span className="text-[10px] font-black uppercase mt-1 tracking-tighter">Connexions</span>
                </button>

                <button
                    type="button"
                    aria-label={launchTitle}
                    aria-disabled={launchAperoDisabled}
                    title={launchTitle}
                    disabled={launchAperoDisabled}
                    onClick={() => onLaunchApero?.()}
                    className="absolute -top-11 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center justify-center leading-none hover:scale-110 active:scale-95 transition-transform disabled:opacity-50 disabled:hover:scale-100 disabled:active:scale-100 disabled:cursor-not-allowed"
                >
                    <BigPintButton variant="3d"/>
                    <span className="sr-only">Lancer l'apéro</span>
                </button>

                <button aria-label="Profil" onClick={() => navigate('/profile')}
                        className="flex flex-col items-center min-w-11 min-h-11 justify-center text-gray-700 hover:text-amber-800">
                    <User size={24}/>
                    <span className="text-[10px] font-black uppercase mt-1 tracking-tighter">Profil</span>
                </button>
            </div>
        </div>
    );
}
