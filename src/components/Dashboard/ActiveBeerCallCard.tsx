import React from 'react';
import { MapPin, Users, MessageCircle, Camera } from 'lucide-react';

interface ActiveBeerCallCardProps {
    call: any;
    squadId: string;
    focusOnLocation: (lng: number, lat: number) => void;
    navigate: (path: string) => void;
    setSelectedBeerCall: (call: any) => void;
    setIsWorldsModalOpen: (id: string) => void;
    timeAgo: (dateString?: string) => string;
}

export const ActiveBeerCallCard: React.FC<ActiveBeerCallCardProps> = ({
    call,
    squadId,
    focusOnLocation,
    navigate,
    setSelectedBeerCall,
    setIsWorldsModalOpen,
    timeAgo
}) => {
    return (
        <div onClick={() => focusOnLocation(call.longitude, call.latitude)}
             className={`w-[220px] h-[130px] relative overflow-hidden rounded-3xl p-3.5 snap-center flex-shrink-0 cursor-pointer active:scale-95 transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between ${call.has_responded ? 'bg-gradient-to-br from-blue-50 to-white border border-blue-100 shadow-[0_8px_20px_rgb(59,130,246,0.15)]' : 'bg-gradient-to-br from-orange-50 to-white border border-orange-100 shadow-[0_8px_20px_rgb(217,119,6,0.15)]'} group`}>
            <div>
                <div className="flex justify-between items-center mb-1.5">
                    <span
                        className={`flex items-center gap-1 text-[9px] font-black px-2 py-1 rounded-full tracking-widest leading-none ${call.has_responded ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-beer'}`}>
                        <span
                            className={`w-1.5 h-1.5 rounded-full ${call.has_responded ? 'bg-blue-600' : 'bg-beer animate-pulse'}`}></span>
                        {call.has_responded ? "REJOINT" : "EN COURS"}
                    </span>
                    <span
                        className="text-gray-400 text-[9px] font-bold uppercase tracking-wider bg-gray-100 px-1.5 py-0.5 rounded-md leading-none">{timeAgo(call.started_at)}</span>
                </div>
                <h3 className="font-black text-gray-900 text-sm uppercase italic mt-0.5 truncate flex items-center gap-1.5 leading-tight">
                    <MapPin size={14}
                            className={call.has_responded ? 'text-blue-500' : 'text-beer'}/>
                    {call.location_name}
                </h3>
            </div>
            <div
                className="mt-auto pt-2 border-t border-gray-200/50 flex flex-col gap-1.5">
                <p className="text-[10px] text-gray-500 font-bold tracking-widest flex items-center justify-center gap-1 leading-none py-1">
                    <Users size={12} className="text-gray-400"/>
                    {call.participants_count} Participant{call.participants_count > 1 ? 's' : ''}
                </p>
                {!call.has_responded ? (
                    <div className="flex items-center gap-1.5">
                        <button onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/squad/${squadId}/beer-call/${call.id}/chat`);
                        }}
                                className="flex-1 bg-amber-100 text-amber-700 text-[9px] px-2.5 py-1.5 rounded-xl font-black uppercase tracking-wider hover:bg-amber-200 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-1 leading-none">
                            <MessageCircle size={11}/> Chat
                        </button>
                        <button onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBeerCall(call);
                        }}
                                className="flex-[1.5] flex items-center justify-center gap-1 bg-amber-500 text-white text-[9px] px-2.5 py-1.5 rounded-xl font-black uppercase tracking-widest shadow-sm shadow-amber-500/30 hover:bg-amber-600 active:scale-95 transition-all leading-none">
                            <Camera size={11}/> Répondre 📸
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5">
                        <button onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/squad/${squadId}/beer-call/${call.id}/chat`);
                        }}
                                className="flex-1 bg-blue-100 text-blue-600 text-[9px] px-2.5 py-1.5 rounded-xl font-black uppercase tracking-wider hover:bg-blue-200 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-1 leading-none">
                            <MessageCircle size={11}/> Chat
                        </button>
                        <button onClick={(e) => {
                            e.stopPropagation();
                            setIsWorldsModalOpen(call.id);
                        }}
                                className="flex-1 bg-blue-600 text-white text-[9px] px-2.5 py-1.5 rounded-xl font-black uppercase tracking-wider hover:bg-blue-700 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-1 leading-none">
                            Mondes 🌍
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
