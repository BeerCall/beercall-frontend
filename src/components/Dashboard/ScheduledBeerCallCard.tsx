import React, { useState, useEffect } from 'react';
import { Clock, MapPin, MessageCircle } from 'lucide-react';
import type { BeerCall } from '../../types/dashboard';

const formatCountdown = (dateString: string | undefined, now: number) => {
    if (!dateString) return 'Date inconnue';

    const remaining = new Date(dateString).getTime() - now;
    if (remaining <= 0) return 'Imminent';

    const totalSeconds = Math.floor(remaining / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) return `Dans ${days}j ${hours}h ${minutes}m`;
    return `Dans ${hours}h ${minutes}m ${seconds.toString().padStart(2, '0')}s`;
};

interface ScheduledBeerCallCardProps {
    call: BeerCall;
    id: string;
    navigate: (path: string) => void;
    focusOnLocation: (lng: number, lat: number) => void;
    openCamera: (location?: { lng: number; lat: number }, apero?: BeerCall) => void;
}

export const ScheduledBeerCallCard: React.FC<ScheduledBeerCallCardProps> = ({ call, id, navigate, focusOnLocation, openCamera }) => {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(intervalId);
    }, []);

    const remaining = call.scheduled_for ? new Date(call.scheduled_for).getTime() - now : 0;
    const isImminent = remaining <= 1800000;

    return (
        <div onClick={() => focusOnLocation(call.longitude, call.latitude)}
             className={`w-[220px] h-[130px] relative overflow-hidden rounded-3xl p-3.5 snap-center flex-shrink-0 cursor-pointer active:scale-95 transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between border shadow-[0_8px_20px_rgba(0,0,0,0.05)] group ${
                 isImminent
                     ? 'bg-gradient-to-br from-rose-50 to-white border-rose-200'
                     : 'bg-gradient-to-br from-indigo-50 to-white border-indigo-100'
             }`}>
            <div>
                <div className="flex justify-between items-center mb-1.5">
                    <span className={`flex items-center gap-1 text-[9px] font-black px-2 py-1 rounded-full tracking-widest leading-none ${
                        isImminent ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'
                    }`}>
                        <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                            isImminent ? 'bg-rose-500' : 'bg-indigo-500'
                        }`}></span>
                        {isImminent ? "C'EST L'HEURE" : "PROGRAMMÉ"}
                    </span>
                    <Clock size={14} className={isImminent ? 'text-rose-400 animate-bounce' : 'text-indigo-400'} />
                </div>
                <h3 className="font-black text-gray-900 text-sm uppercase italic mt-0.5 truncate flex items-center gap-1.5 leading-tight">
                    <MapPin size={14} className={isImminent ? 'text-rose-500' : 'text-indigo-500'} />
                    {call.location_name}
                </h3>
            </div>
            <div className={`mt-auto pt-2 border-t flex flex-col gap-1.5 ${isImminent ? 'border-rose-100/50' : 'border-indigo-100/50'}`}>
                <p className={`text-[10px] font-mono font-bold tracking-widest text-center rounded-lg py-1 ${
                    isImminent ? 'text-rose-700 bg-rose-500/10' : 'text-indigo-700 bg-indigo-500/10'
                }`}>
                    {formatCountdown(call.scheduled_for, now)}
                </p>

                <div className="flex items-center gap-1.5">
                    <button onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/squad/${id}/beer-call/${call.id}/chat`);
                    }}
                            className={`flex-1 flex items-center justify-center gap-1 text-[9px] px-2.5 py-1.5 rounded-xl font-black uppercase tracking-wider active:scale-95 transition-all shadow-sm leading-none ${isImminent ? 'bg-white border border-rose-200 text-rose-600 hover:bg-rose-50' : 'bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50'}`}>
                        <MessageCircle size={11}/> Chat
                    </button>
                    <button onClick={(e) => {
                        e.stopPropagation();
                        openCamera({ lat: Number(call.latitude), lng: Number(call.longitude) }, call);
                    }}
                            className={`flex-[1.5] text-white text-[9px] px-2.5 py-1.5 rounded-xl font-black uppercase tracking-wider active:scale-95 transition-all shadow-sm flex items-center justify-center gap-1 leading-none ${isImminent ? 'bg-rose-500 hover:bg-rose-600' : 'bg-indigo-500 hover:bg-indigo-600'}`}>
                        Lancer 📷
                    </button>
                </div>
            </div>
        </div>
    );
};
