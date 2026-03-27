import {Users, User, LogOut, Plus, Key, Beer, Martini, Pizza, Rocket, Ghost, Flame} from 'lucide-react';
import {motion, useMotionValue, useTransform} from 'framer-motion';
import {useUserStore} from '../../store/useUserStore';
import {useSquads} from '../../hooks/useSquads';
import {useNavigate, useParams} from 'react-router-dom';

interface NavbarProps {
    onCreateClick: () => void;
    onJoinClick: () => void;
}

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
        className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center"
        style={{transformOrigin: '50% 250px', transform: `rotate(${angle}deg)`}}
    >
        {children}
    </div>
);

export default function Navbar({onCreateClick, onJoinClick}: NavbarProps) {
    const navigate = useNavigate();
    const logout = useUserStore((state) => state.logout);
    const {data: squads, isLoading} = useSquads();
    const {id: currentSquadId} = useParams();

    const dragX = useMotionValue(0);
    const negateX = useTransform(dragX, (v) => -v);
    const wheelRotation = useTransform(dragX, [-150, 150], [-35, 35]);

    // 🎯 CALCUL DYNAMIQUE DES ANGLES
    // Permet aux boutons Créer et Rejoindre d'être toujours aux extrémités exactes de la liste !
    const squadsCount = squads?.length || 0;
    const spacing = 24; // Espace en degrés entre chaque élément

    // Le bouton Créer est placé juste avant la première squad (index -1)
    const createAngle = (-1 - (squadsCount - 1) / 2) * spacing;
    // Le bouton Rejoindre est placé juste après la dernière squad (index = squadsCount)
    const joinAngle = (squadsCount - (squadsCount - 1) / 2) * spacing;

    return (
        <div className="absolute bottom-0 w-full z-50 pointer-events-none">

            {/* 🎡 LA ROULETTE (Boutons + Squads) */}
            <div className="relative h-32 flex justify-center overflow-hidden pointer-events-none">
                <div className="absolute top-10 w-[500px] h-[500px] rounded-full border-t-[3px] border-beer/20"/>

                <motion.div
                    drag="x"
                    dragConstraints={{left: -150, right: 150}}
                    style={{x: dragX}}
                    className="absolute top-10 w-[500px] h-[500px] cursor-grab active:cursor-grabbing z-40 pointer-events-auto"
                >
                    <motion.div style={{x: negateX, rotate: wheelRotation, originX: "50%", originY: "50%"}}
                                className="w-full h-full relative">

                        {/* 🟢 BOUTON CRÉER (Dynamique) */}
                        <WheelItem angle={createAngle}>
                            <button
                                onClick={onCreateClick}
                                className="relative flex flex-col items-center group pointer-events-auto hover:-translate-y-1 transition-transform mt-2"
                            >
                                {/* 🚀 Le label passe AU-DESSUS de l'icône */}
                                <span
                                    className="absolute -top-6 text-[9px] font-black uppercase tracking-widest text-gray-700 bg-white/95 px-2.5 py-1 ml-1 rounded-full shadow-sm border border-gray-200">
                                    Créer
                                </span>
                                <div
                                    className="w-14 h-14 bg-white/95 backdrop-blur-md rounded-full border-4 border-orange-100 shadow-[0_8px_20px_rgb(217,119,6,0.2)] flex items-center justify-center text-beer group-active:scale-95 transition-all">
                                    <Plus size={26}/>
                                </div>
                            </button>
                        </WheelItem>

                        {/* 🍻 LES SQUADS */}
                        {!isLoading && squads?.map((squad, index) => {
                            const angle = (index - (squadsCount - 1) / 2) * spacing;
                            const IconComponent = SQUAD_ICONS[squad.icon || 'beer'] || <Beer size={24}/>;
                            const isActive = currentSquadId && +squad.id === +currentSquadId;

                            return (
                                <WheelItem key={squad.id} angle={angle}>
                                    <button
                                        onClick={() => navigate(`/squad/${squad.id}`)}
                                        className={`w-14 h-14 rounded-full shadow-xl flex items-center justify-center text-white transition-all pointer-events-auto ${isActive ? 'scale-110 ring-4 ring-beer ring-opacity-50' : 'border-4 border-white hover:scale-110'}`}
                                        style={{backgroundColor: squad.color || '#F59E0B'}}
                                    >
                                        {IconComponent}
                                    </button>
                                </WheelItem>
                            );
                        })}

                        {/* 🔵 BOUTON REJOINDRE (Dynamique) */}
                        <WheelItem angle={joinAngle}>
                            <button
                                onClick={onJoinClick}
                                className="relative flex flex-col items-center group pointer-events-auto hover:-translate-y-1 transition-transform mt-2"
                            >
                                {/* 🚀 Le label passe AU-DESSUS de l'icône */}
                                <span
                                    className="absolute -top-6 text-[9px] font-black uppercase tracking-widest text-gray-700 bg-white/95 px-2.5 py-1 rounded-full shadow-sm border border-gray-200">
                                    Rejoindre
                                </span>
                                <div
                                    className="w-14 h-14 bg-white/95 backdrop-blur-md rounded-full border-4 border-blue-100 shadow-[0_8px_20px_rgb(59,130,246,0.2)] flex items-center justify-center text-blue-500 group-active:scale-95 transition-all">
                                    <Key size={24}/>
                                </div>
                            </button>
                        </WheelItem>

                    </motion.div>
                </motion.div>
            </div>

            {/* 🚀 NAVBAR MODIFIÉE POUR LE PLEIN ÉCRAN */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-8 flex justify-between items-center z-50 pointer-events-auto
                /* On ajoute du padding en bas égal à la zone de sécurité d'Apple */
                pb-[env(safe-area-inset-bottom,1.5rem)]
                pt-4 h-auto">

                <button onClick={() => navigate('/connections')} className="flex flex-col items-center gap-1 group">
                    <Users size={24} className="text-gray-400 group-hover:text-beer transition-colors"/>
                    <span
                        className="text-[10px] font-bold text-gray-400 group-hover:text-beer uppercase tracking-tighter">Connexions</span>
                </button>

                <button onClick={() => navigate('/profile')} className="flex flex-col items-center gap-1 group">
                    <UserIcon size={24} className="text-gray-400 group-hover:text-beer transition-colors"/>
                    <span
                        className="text-[10px] font-bold text-gray-400 group-hover:text-beer uppercase tracking-tighter">Profil</span>
                </button>

                <button onClick={handleSignOut} className="flex flex-col items-center gap-1 group">
                    <LogOut size={24} className="text-gray-400 group-hover:text-red-500 transition-colors"/>
                    <span
                        className="text-[10px] font-bold text-gray-400 group-hover:text-red-500 uppercase tracking-tighter">Sign Out</span>
                </button>
            </div>
        </div>
    );
}