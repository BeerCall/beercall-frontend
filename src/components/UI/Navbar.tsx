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
        <div className="absolute bottom-0 w-full z-50 pointer-events-none">

            {/* 🎡 LA ROULETTE (Boutons + Squads) */}
            <SquadWheel squads={squads ?? []} currentSquadId={currentSquadId} isLoading={isLoading}
                        onCreate={onCreateClick} onJoin={onJoinClick} onSelect={id => navigate(`/squad/${id}`)} />

            {/* 🔽 BARRE DE NAVIGATION INFÉRIEURE */}
            <div
                className="h-[calc(60px_+_env(safe-area-inset-bottom))] bg-white border-t border-gray-100 px-8 flex justify-between items-center pt-2 pb-[calc(6px_+_env(safe-area-inset-bottom))] shadow-[0_-10px_40px_rgba(0,0,0,0.05)] relative z-50 pointer-events-auto">
                <button
                    onClick={() => navigate('/connections')}
                    className="flex flex-col items-center text-gray-700 hover:text-amber-800"
                >
                    <Users size={22}/>
                    <span className="text-[10px] font-black uppercase mt-0.5 tracking-tighter">Connexions</span>
                </button>

                <button aria-label="Profil" onClick={() => navigate('/profile')}
                        className="flex flex-col items-center justify-center bg-beer text-white w-[54px] h-[54px] rounded-full shadow-lg transform border-[4px] border-white z-50 hover:scale-105 active:scale-95 transition-all">
                    <User size={24}/>
                </button>

                <button onClick={logout}
                        className="flex flex-col items-center text-gray-700 hover:text-red-700 transition-colors">
                    <LogOut size={22}/>
                    <span className="text-[10px] font-black uppercase mt-0.5 tracking-tighter">Sign Out</span>
                </button>
            </div>
        </div>
    );
}
