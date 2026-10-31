import {useNavigate} from 'react-router-dom';
import {useEffect, useRef, useState, type RefObject} from 'react';
import {ChevronLeft, Users, Trophy, ArrowRight} from 'lucide-react';
import SafeAvatar from '../components/3D/SafeAvatar';
import type {AvatarConfig} from '../types/avatar';
import {useConnections} from '../hooks/useConnections';

const AvatarThumbnail = ({id, config, username, active, scrollport}: {
    id: string; config: AvatarConfig; username: string; active: boolean; scrollport: RefObject<HTMLDivElement | null>;
}) => {
    const ref = useRef<HTMLDivElement>(null);
    const [intersecting, setIntersecting] = useState(true);
    useEffect(() => {
        const node = ref.current;
        if (!node || typeof IntersectionObserver !== 'function') return;
        const observer = new IntersectionObserver(entries => {
            const entry = entries.find(entry => entry.target === node);
            if (entry) setIntersecting(entry.isIntersecting);
        }, {root: scrollport.current, threshold: 0});
        observer.observe(node);
        return () => observer.disconnect();
    }, [scrollport]);
    const hasAvatar = config && ['head', 'body', 'legs', 'feet', 'accessory'].some(part =>
        typeof config[part] === 'string' && config[part] && config[part] !== 'none');

    return (
        <div ref={ref} className="w-full h-full relative" data-testid={`avatar-thumb-${id}`}>
            {hasAvatar ? (
                    <SafeAvatar config={config} renderMode="shared" disableZoom={true} disablePan={true}
                                framing="thumbnail" view="connections-thumbnail"
                                 active={active && intersecting}
                                instanceId={`connections-${id}`}/>
            ) : (
                // Initiale uniquement pour une personne réellement sans avatar.
                <div className="absolute inset-0 bg-gray-100 flex items-center justify-center text-gray-400 font-black text-2xl select-none" aria-label={`Avatar de ${username}`}>
                    {username ? username.charAt(0).toUpperCase() : '?'}
                </div>
            )}
        </div>
    );
};

export default function Connections({active = true}: { active?: boolean }) {
    const navigate = useNavigate();
    const listRef = useRef<HTMLDivElement>(null);

    const {data: connections, isLoading} = useConnections();

    if (isLoading) return (
        <div className="h-screen flex items-center justify-center bg-[#f8fafc]">
            <div className="w-12 h-12 border-4 border-beer border-t-transparent rounded-full animate-spin"></div>
        </div>
    );

    return (
            <div className="h-full min-h-0 w-full bg-[#f8fafc] flex flex-col font-sans overflow-hidden">
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
                <div ref={listRef} data-testid="connections-scrollport" className="flex-1 min-h-0 overflow-y-auto p-6 pb-32 space-y-6">
                    {connections && connections.length > 0 ? (
                        connections.map((user) => (
                            <div
                                key={user.id}
                                onClick={() => navigate(`/profile/${user.id}`)}
                                className="bg-white rounded-[2.5rem] p-3 min-[400px]:p-4 shadow-xl shadow-gray-200/50 border-2 border-transparent hover:border-beer transition-[color,background-color,border-color,box-shadow,transform] group cursor-pointer flex items-center gap-2 min-[400px]:gap-4 h-48"
                            >
                                {/* MINIATURE AVATAR 3D */}
                                <div
                                    className="w-24 h-32 min-[400px]:w-32 min-[400px]:h-40 shrink-0 bg-gray-50 rounded-[2rem] overflow-hidden relative border-2 border-gray-50 group-hover:border-amber-100 transition-colors">

                                    <AvatarThumbnail id={user.id} config={user.avatar} username={user.username} active={active} scrollport={listRef}/>

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

                                <div className="flex items-center gap-2.5 mt-1 flex-wrap">
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
                                className="w-11 h-11 min-[400px]:w-12 min-[400px]:h-12 shrink-0 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 group-hover:bg-beer group-hover:text-white transition-[color,background-color,border-color,box-shadow,transform] shadow-inner group-hover:shadow-beer/30">
                                <ArrowRight size={20}/>
                            </div>
                        </div>
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
