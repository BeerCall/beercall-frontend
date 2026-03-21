import {useNavigate} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {ChevronLeft, Users, Trophy, Wallet, ArrowRight} from 'lucide-react';
import {api} from '../lib/api';
import AvatarCanvas from '../components/3D/AvatarCanvas';
import {motion} from 'framer-motion';

// Interface basée sur l'objet que tu m'as fourni
interface Connection {
    id: string;
    username: string;
    caps: number;
    title: string;
    avatar: {
        head: string;
        body: string;
        legs: string;
        feet: string;
        accessory: string;
        gender: 'Men' | 'Women';
    };
}

export default function Connections() {
    const navigate = useNavigate();

    // 📡 Requête pour récupérer tes relations
    const {data: connections, isLoading} = useQuery({
        queryKey: ['connections'],
        queryFn: async () => {
            const res = await api.get<Connection[]>('/auth/connections/');
            return res.data;
        }
    });

    if (isLoading) return (
        <div className="h-screen flex items-center justify-center bg-[#f8fafc]">
            <div className="w-12 h-12 border-4 border-beer border-t-transparent rounded-full animate-spin"></div>
        </div>
    );

    return (
        <div className="h-full w-full bg-[#f8fafc] flex flex-col font-sans overflow-hidden">
            {/* HEADER FIXE */}
            <header className="p-6 flex items-center gap-4 bg-white/80 backdrop-blur-md border-b border-gray-100 z-20">
                <button
                    onClick={() => navigate(-1)}
                    className="p-3 bg-white shadow-md rounded-full text-gray-700 hover:scale-110 active:scale-90 transition-transform"
                >
                    <ChevronLeft size={24}/>
                </button>
                <div>
                    <h1 className="text-2xl font-black text-gray-900 uppercase italic tracking-tighter flex items-center gap-2">
                        Connexions <Users size={20} className="text-beer"/>
                    </h1>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Tes compagnons de
                        bar</p>
                </div>
            </header>

            {/* LISTE DES CONNEXIONS */}
            <div className="flex-1 overflow-y-auto p-6 pb-32 space-y-6">
                {connections && connections.length > 0 ? (
                    connections.map((user, index) => (
                        <motion.div
                            key={user.id}
                            initial={{opacity: 0, x: -20}}
                            animate={{opacity: 1, x: 0}}
                            transition={{delay: index * 0.1}}
                            onClick={() => navigate(`/profile/${user.id}`)}
                            className="bg-white rounded-[2.5rem] p-4 shadow-xl shadow-gray-200/50 border-2 border-transparent hover:border-beer transition-all group cursor-pointer flex items-center gap-4 h-48"
                        >
                            {/* MINIATURE AVATAR 3D */}
                            <div
                                className="w-32 h-full bg-gray-50 rounded-[2rem] overflow-hidden relative border-2 border-gray-50 group-hover:border-amber-100 transition-colors">
                                <AvatarCanvas config={user.avatar}/>
                                <div className="absolute inset-0 z-10"/>
                                {/* Overlay pour empêcher l'interaction OrbitControls ici */}
                            </div>

                            {/* INFOS JOUEUR */}
                            <div className="flex-1 flex flex-col justify-center py-2">
                                <span
                                    className="bg-amber-100 text-amber-600 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest self-start mb-2">
                                    {user.title}
                                </span>
                                <h3 className="text-xl font-black text-gray-900 uppercase italic tracking-tighter leading-tight mb-3">
                                    {user.username}
                                </h3>

                                <div className="flex gap-4">
                                    <div className="flex items-center gap-1.5">
                                        <div
                                            className="w-7 h-7 bg-amber-50 rounded-full flex items-center justify-center text-xs">💊
                                        </div>
                                        <span className="text-sm font-black text-gray-700">{user.caps}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Trophy size={16} className="text-gray-300"/>
                                        <span
                                            className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Vétéran</span>
                                    </div>
                                </div>
                            </div>

                            {/* BOUTON ACTION */}
                            <div className="pr-4">
                                <div
                                    className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 group-hover:bg-beer group-hover:text-white transition-all shadow-inner group-hover:shadow-beer/30">
                                    <ArrowRight size={20}/>
                                </div>
                            </div>
                        </motion.div>
                    ))
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center px-10">
                        <div
                            className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center text-gray-300 mb-6">
                            <Users size={40}/>
                        </div>
                        <h3 className="text-xl font-black text-gray-900 uppercase italic mb-2">Seul au comptoir ?</h3>
                        <p className="text-sm font-bold text-gray-400">Rejoins une Squad et valide des apéros pour te
                            faire des potes !</p>
                    </div>
                )}
            </div>
        </div>
    );
}