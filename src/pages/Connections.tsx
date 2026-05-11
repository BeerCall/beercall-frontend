import {useNavigate} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {ChevronLeft, Users, Trophy, ArrowRight} from 'lucide-react';
import {api} from '../lib/api';
import AvatarCanvas from '../components/3D/AvatarCanvas';
import {motion, useInView} from 'framer-motion';
import {useRef} from "react";

// Interface basée sur l'objet que tu m'as fourni
interface Connection {
    id: string;
    username: string;
    caps: number;
    score: number; // 🚀 NOUVEAU
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

const AvatarThumbnail = ({config}: { config: any }) => {
    const ref = useRef(null);
    // margin: "100px" permet de charger l'avatar juste avant qu'il n'entre dans l'écran
    const isInView = useInView(ref, {margin: "100px"});

    return (
        <div ref={ref} className="w-full h-full relative">
            {isInView ? (
                <AvatarCanvas config={config} disableZoom={true} disablePan={true}/>
            ) : (
                // Si la carte est hors écran, on détruit le Canvas et on libère la carte graphique
                <div className="absolute inset-0 bg-gray-50 flex items-center justify-center">
                    <div className="w-6 h-6 border-4 border-beer/30 border-t-beer rounded-full animate-spin"></div>
                </div>
            )}
        </div>
    );
};

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
            <header
                className="p-6 pt-[calc(18px+env(safe-area-inset-top))] flex items-center gap-4 bg-white/80 backdrop-blur-md border-b border-gray-100 z-20 shrink-0">
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
                                className="w-32 h-40 shrink-0 bg-gray-50 rounded-[2rem] overflow-hidden relative border-2 border-gray-50 group-hover:border-amber-100 transition-colors">

                                <AvatarThumbnail config={user.avatar}/>

                                <div className="absolute inset-0 z-10"/>
                            </div>

                            {/* INFOS JOUEUR */}
                            {/* 🚀 L'ajout de min-w-0 empêche Flexbox de pousser les éléments hors de l'écran */}
                            <div className="flex-1 flex flex-col justify-center py-2 min-w-0">
                                <span
                                    className="bg-amber-100 text-amber-600 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest self-start mb-2 truncate max-w-full">
                                    {user.title}
                                </span>
                                {/* 🚀 Ajout de "truncate" pour couper avec des "..." si le pseudo est trop long */}
                                <h3 className="text-xl font-black text-gray-900 uppercase italic tracking-tighter leading-tight mb-3 truncate">
                                    {user.username}
                                </h3>

                                <div className="flex items-center gap-2.5 mt-1">
                                    <div
                                        className="flex items-center gap-1.5 bg-gradient-to-br from-amber-100 to-amber-50 px-3 py-1.5 rounded-xl border border-amber-200/50 shadow-sm shrink-0">
                                        <Trophy size={14} className="text-amber-500 drop-shadow-sm"/>
                                        <span
                                            className="text-xs font-black text-amber-700 pt-[2px] leading-none tracking-wide">{user.score}</span>
                                    </div>

                                    <div
                                        className="flex items-center gap-1.5 bg-gray-100/80 px-3 py-1.5 rounded-xl border border-gray-200/80 shadow-sm shrink-0">
                                        <span className="text-xs leading-none drop-shadow-sm">💊</span>
                                        <span
                                            className="text-xs font-black text-gray-600 pt-[2px] leading-none tracking-wide">{user.caps}</span>
                                    </div>
                                </div>
                            </div>

                            {/* BOUTON ACTION */}
                            {/* 🚀 J'ai retiré la div pr-4 inutile et mis le shrink-0 pour garantir qu'il ne s'écrase jamais */}
                            <div
                                className="w-12 h-12 shrink-0 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 group-hover:bg-beer group-hover:text-white transition-all shadow-inner group-hover:shadow-beer/30">
                                <ArrowRight size={20}/>
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