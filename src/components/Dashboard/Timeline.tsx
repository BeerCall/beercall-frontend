import React from 'react';
import { BellRing } from 'lucide-react';
import { ScheduledBeerCallCard } from './ScheduledBeerCallCard';
import { ActiveBeerCallCard } from './ActiveBeerCallCard';
import { PastBeerCallCard } from './PastBeerCallCard';
import type { BeerCall, SquadDetails } from '../../types/dashboard';

const timeAgo = (dateString?: string) => {
    if (!dateString) return 'À venir';
    const diff = Date.now() - new Date(dateString).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `Il y a ${days} j`;
    if (hours > 0) return `Il y a ${hours} h`;
    if (minutes > 0) return `Il y a ${minutes} min`;
    return 'À l\'instant';
};

interface TimelineProps {
    squadDetails: SquadDetails | null | undefined;
    squadId: string;
    navigate: (path: string) => void;
    focusOnLocation: (lng: number, lat: number) => void;
    openCamera: (location?: { lng: number; lat: number }, apero?: BeerCall) => void;
    setSelectedBeerCall: (call: BeerCall | null) => void;
    setIsWorldsModalOpen: (id: string) => void;
}

export const Timeline: React.FC<TimelineProps> = ({
    squadDetails,
    squadId,
    navigate,
    focusOnLocation,
    openCamera,
    setSelectedBeerCall,
    setIsWorldsModalOpen
}) => {
    return (
        <div
            className="absolute bottom-[calc(130px_+_env(safe-area-inset-top))] w-full px-4 z-[70] pointer-events-none">
            <div
                className="flex gap-4 overflow-x-auto pb-6 pt-2 px-2 snap-x snap-mandatory hide-scrollbar pointer-events-auto items-center">

            {/* 1. CARTE PROGRAMMÉE (Dynamique) */}
            {squadDetails?.scheduled_beer_calls?.map((call: BeerCall) => (
                <ScheduledBeerCallCard
                    key={call.id}
                    call={call}
                    id={squadId}
                    navigate={navigate}
                    focusOnLocation={focusOnLocation}
                    openCamera={openCamera}
                />
            ))}

            {/* 2. CARTE ACTIVE (En cours) */}
            {squadDetails?.active_beer_call?.map((call: BeerCall) => (
                <ActiveBeerCallCard
                    key={call.id}
                    call={call}
                    squadId={squadId}
                    focusOnLocation={focusOnLocation}
                    navigate={navigate}
                    setSelectedBeerCall={setSelectedBeerCall}
                    setIsWorldsModalOpen={setIsWorldsModalOpen}
                    timeAgo={timeAgo}
                />
            ))}

            {/* 3. CARTE TERMINÉE */}
            {squadDetails?.past_beer_calls?.map((call: BeerCall) => (
                <PastBeerCallCard
                    key={call.id}
                    call={call}
                    squadId={squadId}
                    focusOnLocation={focusOnLocation}
                    navigate={navigate}
                    setIsWorldsModalOpen={setIsWorldsModalOpen}
                    timeAgo={timeAgo}
                />
            ))}

            {/* CARTE VIDE (Si aucun apéro) */}
            {(!squadDetails?.active_beer_call || squadDetails.active_beer_call.length === 0) && (!squadDetails?.past_beer_calls || squadDetails.past_beer_calls.length === 0) && (!squadDetails?.scheduled_beer_calls || squadDetails.scheduled_beer_calls.length === 0) && (
                <div
                    className="w-[220px] h-[130px] bg-white/60 backdrop-blur-md rounded-3xl p-4 shadow-sm border-2 border-dashed border-gray-300/50 snap-center flex-shrink-0 flex flex-col items-center justify-center">
                    <div
                        className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center mb-2">
                        <BellRing size={16} className="text-gray-400"/>
                    </div>
                    <p className="text-xs font-bold text-gray-500 text-center uppercase tracking-wider leading-tight">
                        Aucun événement.<br/>Lance le premier !
                    </p>
                </div>
            )}
        </div>
    </div>
    );
};
