import {Users, User, LogOut} from 'lucide-react';
import SquadWheel from './SquadWheel';
import {useUserStore} from '../../store/useUserStore';
import {useSquads} from '../../hooks/useSquads';
import {useNavigate, useParams} from 'react-router-dom';

interface NavbarProps {
    onCreateClick: () => void;
    onJoinClick: () => void;
}

export default function Navbar({onCreateClick, onJoinClick}: NavbarProps) {
    const navigate = useNavigate();
    const logout = useUserStore((state) => state.logout);
    const {data: squads, isLoading} = useSquads();
    const {id: currentSquadId} = useParams();

    return (
        <div className="relative w-full pointer-events-none">

            {/* 🎡 LA ROULETTE (Boutons + Squads) */}
            <SquadWheel squads={squads ?? []} currentSquadId={currentSquadId} isLoading={isLoading}
                        onCreate={onCreateClick} onJoin={onJoinClick} onSelect={id => navigate(`/squad/${id}`)} />

            {/* 🔽 BARRE DE NAVIGATION INFÉRIEURE */}
            <div
                data-bottom-nav
                className="h-[calc(58px_+_env(safe-area-inset-bottom))] bg-white border-t border-gray-100 px-8 flex justify-between items-center pt-0 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_40px_rgba(0,0,0,0.05)] relative z-50 pointer-events-auto touch-none overscroll-none">
                <button
                    onClick={() => navigate('/connections')}
                    className="flex flex-col items-center min-w-11 min-h-11 justify-center text-gray-700 hover:text-amber-800"
                >
                    <Users size={24}/>
                    <span className="text-[10px] font-black uppercase mt-1 tracking-tighter">Connexions</span>
                </button>

                <button aria-label="Profil" onClick={() => navigate('/profile')}
                        className="flex flex-col items-center justify-center bg-beer text-white w-14 h-14 rounded-full shadow-md transform border-4 border-white z-50 hover:scale-105 active:scale-95 transition-all">
                    <User size={24}/>
                </button>

                <button onClick={logout}
                        className="flex flex-col items-center min-w-11 min-h-11 justify-center text-gray-700 hover:text-red-700 transition-colors">
                    <LogOut size={24}/>
                    <span className="text-[10px] font-black uppercase mt-1 tracking-tighter">Sign Out</span>
                </button>
            </div>
        </div>
    );
}
