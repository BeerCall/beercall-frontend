import {Users, User, LogOut, Plus, LogIn, Beer, Martini, Pizza, Rocket, Ghost, Flame} from 'lucide-react';
import {motion, useMotionValue, useTransform} from 'framer-motion';
import {useUserStore} from '../../store/useUserStore';
import {useSquads} from '../../hooks/useSquads';
import {useNavigate} from 'react-router-dom';

interface NavbarProps {
    onCreateClick: () => void;
    onJoinClick: () => void;
}

// 🔧 Le dictionnaire de conversion Texte -> Icône
const SQUAD_ICONS: Record<string, React.ReactNode> = {
    beer: <Beer size={24}/>,
    cocktail: <Martini size={24}/>,
    pizza: <Pizza size={24}/>,
    rocket: <Rocket size={24}/>,
    ghost: <Ghost size={24}/>,
    fire: <Flame size={24}/>,
};

const WheelItem = ({angle, children}: { angle: number; children: React.ReactNode }) => (
    <div
        className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto"
        style={{transformOrigin: '50% 250px', transform: `rotate(${angle}deg)`}}
    >
        {children}
    </div>
);

export default function Navbar({onCreateClick, onJoinClick}: NavbarProps) {
    const navigate = useNavigate();
    const logout = useUserStore((state) => state.logout);
    const {data: squads, isLoading} = useSquads();

    const dragX = useMotionValue(0);
    const negateX = useTransform(dragX, (v) => -v);
    const wheelRotation = useTransform(dragX, [-150, 150], [-35, 35]);

    return (
        <div className="absolute bottom-0 w-full z-50">
            <div className="relative h-32 flex justify-center overflow-hidden">
                <div
                    className="absolute top-10 w-[500px] h-[500px] rounded-full border-t-[3px] border-beer/20 pointer-events-none"/>

                <motion.div
                    drag="x"
                    dragConstraints={{left: -150, right: 150}}
                    style={{x: dragX}}
                    className="absolute top-10 w-[500px] h-[500px] cursor-grab active:cursor-grabbing z-40"
                >
                    <motion.div style={{x: negateX, rotate: wheelRotation, originX: "50%", originY: "50%"}}
                                className="w-full h-full relative">

                        <WheelItem angle={-40}>
                            <button onClick={onCreateClick}
                                    className="bg-white p-3 rounded-full shadow-lg text-beer hover:scale-110 active:scale-90 transition-transform pointer-events-auto border border-gray-100">
                                <Plus size={24}/>
                            </button>
                        </WheelItem>

                        {!isLoading && squads?.map((squad, index) => {
                            const angle = (index - (squads.length - 1) / 2) * 22;
                            // 🔧 Récupération de l'icône réelle, fallback sur Beer si non trouvé
                            const IconComponent = SQUAD_ICONS[squad.icon || 'beer'] || <Beer size={24}/>;

                            return (
                                <WheelItem key={squad.id} angle={angle}>
                                    <button
                                        onClick={() => navigate(`/squad/${squad.id}`)}
                                        className="w-14 h-14 rounded-full border-4 border-white shadow-xl flex items-center justify-center text-white hover:scale-110 transition-transform pointer-events-auto"
                                        style={{backgroundColor: squad.color || '#F59E0B'}}
                                    >
                                        {IconComponent}
                                    </button>
                                </WheelItem>
                            );
                        })}

                        <WheelItem angle={40}>
                            <button onClick={onJoinClick}
                                    className="bg-white p-3 rounded-full shadow-lg text-beer hover:scale-110 active:scale-90 transition-transform pointer-events-auto border border-gray-100">
                                <LogIn size={24}/>
                            </button>
                        </WheelItem>

                    </motion.div>
                </motion.div>
            </div>

            <div
                className="bg-white border-t border-gray-100 h-20 px-8 flex justify-between items-center pb-4 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] relative z-50">
                <button
                    onClick={() => navigate('/connections')}
                    className="flex flex-col items-center text-gray-400 hover:text-beer"
                >
                    <Users size={24}/>
                    <span className="text-[10px] font-black uppercase mt-1 tracking-tighter">Connexions</span>
                </button>

                <button onClick={() => navigate('/profile')}
                        className="flex flex-col items-center justify-center bg-beer text-white w-[70px] h-[70px] rounded-full shadow-2xl transform -translate-y-5 border-[6px] border-white z-50 hover:scale-105 transition-transform">
                    <User size={28}/>
                </button>

                <button onClick={logout}
                        className="flex flex-col items-center text-gray-400 hover:text-red-400 transition-colors">
                    <LogOut size={24}/>
                    <span className="text-[10px] font-black uppercase mt-1 tracking-tighter">Sign Out</span>
                </button>
            </div>
        </div>
    );
}