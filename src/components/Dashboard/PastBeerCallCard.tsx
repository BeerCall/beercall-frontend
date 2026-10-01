import React from 'react';
import { MapPin, Users, MessageCircle } from 'lucide-react';

interface PastBeerCallCardProps {
    call: any;
    squadId: string;
    focusOnLocation: (lng: number, lat: number) => void;
    navigate: (path: string) => void;
    setIsWorldsModalOpen: (id: string) => void;
    timeAgo: (dateString?: string) => string;
}

export const PastBeerCallCard: React.FC<PastBeerCallCardProps> = ({
    call,
    squadId,
    focusOnLocation,
    navigate,
    setIsWorldsModalOpen,
    timeAgo
}) => {
    return (
        <div onClick={() => focusOnLocation(call.longitude, call.latitude)}
             className="w-[220px] h-[130px] bg-white/80 backdrop-blur-xl rounded-3xl p-3.5 shadow-md border border-gray-100 snap-center flex-shrink-0 cursor-pointer hover:-translate-y-1 hover:bg-white/95 transition-all duration-300 flex flex-col justify-between group">
            <div>
                <div className="flex justify-between items-center mb-1.5">
                    <span
                        className="bg-gray-100 text-gray-500 text-[9px] font-black px-2 py-1 rounded-full tracking-widest flex items-center gap-1 leading-none">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span> TERMINÉ
                    </span>
                    <span
                        className="text-gray-400 text-[9px] font-bold uppercase tracking-wider leading-none">{timeAgo(call.started_at)}</span>
                </div>
                <h3 className="font-black text-gray-700 text-sm uppercase italic mt-0.5 truncate flex items-center gap-1.5 leading-tight">
                    <MapPin size={14} className="text-gray-400"/> {call.location_name}
                </h3>
            </div>
            <div
                className="mt-auto pt-2 border-t border-gray-200/50 flex flex-col gap-1.5">
                <p className="text-[10px] text-gray-500 font-bold tracking-widest flex items-center justify-center gap-1 leading-none py-1">
                    <Users size={12}
                            className="text-gray-400"/> {call.participants_count} Participant{call.participants_count > 1 ? 's' : ''}
                </p>
                <div className="flex items-center gap-1.5">
                    <button onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/squad/${squadId}/beer-call/${call.id}/chat`);
                    }}
                            className="flex-1 bg-gray-100 text-gray-600 text-[9px] px-2.5 py-1.5 rounded-xl font-black uppercase tracking-wider hover:bg-gray-200 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-1 leading-none">
                        <MessageCircle size={11}/> Chat
                    </button>
                    <button onClick={(e) => {
                        e.stopPropagation();
                        setIsWorldsModalOpen(call.id);
                    }}
                            className="flex-1 bg-gray-800 text-white text-[9px] px-2.5 py-1.5 rounded-xl font-black uppercase tracking-wider hover:bg-black active:scale-95 transition-all shadow-sm flex items-center justify-center gap-1 leading-none">
                        Mondes 🌍
                    </button>
                </div>
            </div>
        </div>
    );
};
