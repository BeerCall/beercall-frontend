import React, { Suspense } from 'react';
import Navbar from '../components/UI/Navbar';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Check, Copy, Key, BellRing } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboard } from '../hooks/useDashboard';
import { MapSection } from '../components/Dashboard/MapSection';
import { Timeline } from '../components/Dashboard/Timeline';
import { isAxiosError } from 'axios';
import { useDashboardActive } from '../lib/dashboardActivity';

const GameScreen = React.lazy(() => import('./GameScreen'));
const CreateSquadModal = React.lazy(() => import('../components/Modals/CreateSquadModal'));
const CreateBeerCallModal = React.lazy(() => import('../components/Modals/CreateBeerCallModal'));
const JoinSquadModal = React.lazy(() => import('../components/Modals/JoinSquadModal'));
const RespondBeerCallModal = React.lazy(() => import('../components/Modals/RespondBeerCallModal'));
const SelectWorldModal = React.lazy(() => import('../components/Modals/SelectWorldModal'));
const ScheduleAperoModal = React.lazy(() => import('../components/Modals/ScheduleAperoModal'));

export default function Dashboard() {
    const routeActive = useDashboardActive();
    const { fileInputRef, mapRef, ...dashboard } = useDashboard();
    const squadErrorStatus = isAxiosError(dashboard.squadError) ? dashboard.squadError.response?.status : undefined;
    const squadErrorMessage = squadErrorStatus === 403 ? 'Accès à cette squad refusé'
        : squadErrorStatus === 404 ? 'Squad introuvable' : 'Squad indisponible';

    return (
        <div className="h-full w-full relative flex flex-col bg-[#f8fafc] overflow-hidden font-sans">
            {/* 🎮 1. L'ÉCRAN DE JEU */}
            <AnimatePresence>
                {dashboard.isGameScreenOpen && dashboard.currentAperoId && (
                    <motion.div
                        initial={{opacity: 0, y: "100%"}} animate={{opacity: 1, y: 0}} exit={{opacity: 0, y: "100%"}}
                        transition={{type: "spring", damping: 25, stiffness: 200}}
                        className="absolute inset-0 z-[100] bg-gray-950"
                    >
                        <Suspense fallback={<div className="flex h-full items-center justify-center text-white"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-beer"></div></div>}>
                            <GameScreen aperoIdProp={dashboard.currentAperoId}/>
                        </Suspense>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 🌍 2. LE RESTE DU DASHBOARD (Carte, timeline, modals...) */}
            <div className={`w-full h-full relative ${dashboard.isGameScreenOpen ? 'hidden' : ''}`}>
                {/* BANNIÈRE PUSH */}
                {dashboard.showPushBanner && (
                    <div className="absolute top-[env(safe-area-inset-top)] left-0 right-0 z-50 bg-gray-900 text-white p-4 flex items-center justify-between shadow-xl">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-beer rounded-full flex items-center justify-center animate-bounce">
                                <BellRing size={20} className="text-white"/>
                            </div>
                            <div className="flex flex-col">
                                <span className="font-black text-sm uppercase italic">Ne rate aucun apéro !</span>
                                <span className="text-xs text-gray-300 font-bold">Active les alertes de la squad.</span>
                            </div>
                        </div>
                        <button onClick={dashboard.handleEnableNotifications} className="bg-white text-gray-900 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest active:scale-95">
                            Activer
                        </button>
                    </div>
                )}

                <input type="file" aria-label="Photo du Beer Call" accept="image/*" capture="environment" ref={fileInputRef}
                       onChange={dashboard.handlePhotoCapture} className="hidden"/>

                <div className="absolute inset-0 z-0">
                    <div className="w-full h-full relative animate-in fade-in duration-500">
                        {/* OVERLAY ACCUEIL SI PAS DE SQUAD */}
                        {!dashboard.id && (
                            <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-white/70 backdrop-blur-xl transition-opacity duration-300">
                                <h1 className="text-4xl font-black text-gray-900 tracking-tighter italic uppercase text-center">Salut {dashboard.profile?.username || 'Soldat'} !</h1>
                                <p className="mt-4 text-gray-700 font-bold uppercase tracking-widest text-center">Choisis une squad en bas<br/>pour rejoindre la zone</p>
                            </div>
                        )}

                        {/* BADGE SQUAD (Seulement si id) */}
                        {dashboard.id && (
                            <div className="absolute top-[calc(15px+env(safe-area-inset-top))] w-full flex justify-center z-10 pointer-events-none">
                                <div className="bg-white backdrop-blur-md max-w-[calc(100vw_-_32px)] px-4 py-2 rounded-[2rem] shadow-xl pointer-events-auto border-2 flex flex-col items-center gap-1 transition-all"
                                     style={{borderColor: dashboard.squadDetails?.color ? `${dashboard.squadDetails.color}40` : 'rgba(217, 119, 6, 0.25)'}}>
                                    <div className="flex w-full min-w-0 items-center justify-center gap-2">
                                    {dashboard.squadDetails && <h2 className="min-w-0 truncate font-black text-gray-900 tracking-widest uppercase italic text-xl leading-none">
                                        {dashboard.squadDetails.name}
                                    </h2>}
                                    {!dashboard.squadDetails && dashboard.isSquadPending && <p role="status" className="text-sm font-bold text-gray-900">Chargement de la squad…</p>}
                                    {dashboard.isSquadError && <div role="alert" className="max-w-[calc(100vw_-_80px)] text-xs text-gray-900 text-center">
                                        <p>{dashboard.squadDetails ? 'Actualisation impossible — dernières données affichées' : squadErrorMessage}</p>
                                        <button onClick={() => dashboard.refetchSquad()} className="mt-2 underline font-bold">Réessayer</button>
                                    </div>}
                                    {dashboard.squadDetails?.invite_code && (
                                        <button onClick={dashboard.handleCopyCode} className="shrink-0 flex items-center gap-2 bg-gray-100 hover:bg-gray-200 px-4 py-1.5 rounded-full transition-all group active:scale-95" title="Copier le code">
                                            <Key size={12} style={{color: dashboard.squadDetails?.color || '#D97706'}}/>
                                            <span className="font-black tracking-[0.25em] text-gray-700 text-xs pt-[2px]">{dashboard.squadDetails.invite_code}</span>
                                            {dashboard.copied ? <Check size={14} className="text-green-500 animate-in zoom-in duration-300"/> :
                                                <Copy size={12} className="text-gray-400 group-hover:text-gray-700 transition-colors"/>}
                                        </button>
                                    )}
                                    </div>
                                    {dashboard.locationMessage && <>
                                        <p role="status" className="w-full text-xs leading-[14px] text-gray-900 [overflow-wrap:anywhere]">{dashboard.locationMessage}</p>
                                        <button onClick={dashboard.retryGPS} className="text-xs leading-[14px] py-1 underline font-bold text-gray-900">Réessayer le GPS</button>
                                    </>}
                                </div>
                            </div>
                        )}

                        <MapSection 
                            mapRef={mapRef}
                            userLocation={dashboard.userLocation}
                            canCreateFromLocation={dashboard.canCreateFromLocation}
                            isNightMode={dashboard.isNightMode}
                            isMapReady={dashboard.isMapReady}
                            handleMapLoaded={dashboard.handleMapLoaded}
                            active={routeActive && !dashboard.isGameScreenOpen && !dashboard.isWorldsModalOpen}
                            visible={routeActive}
                            squadDetails={dashboard.squadDetails}
                            profile={dashboard.profile}
                            handleMapPointerDown={dashboard.handleMapPointerDown}
                            cancelLongPress={dashboard.cancelLongPress}
                            handleMapPointerMove={dashboard.handleMapPointerMove}
                            handleManualRecenter={dashboard.handleManualRecenter}
                            handleBeerCallClick={dashboard.handleBeerCallClick}
                            openCamera={dashboard.openCamera}
                            setIsWorldsModalOpen={dashboard.setIsWorldsModalOpen}
                        />
                    </div>
                </div>

                <div data-testid="dashboard-bottom-wrapper" className="absolute bottom-0 inset-x-0 flex flex-col pointer-events-none z-[70]">
                    {dashboard.id && dashboard.squadDetails && (
                        <Timeline 
                            squadDetails={dashboard.squadDetails}
                            squadId={dashboard.id}
                            navigate={dashboard.navigate}
                            focusOnLocation={dashboard.focusOnLocation}
                            openCamera={dashboard.openCamera}
                            setSelectedBeerCall={dashboard.setSelectedBeerCall}
                            setIsWorldsModalOpen={dashboard.setIsWorldsModalOpen}
                        />
                    )}
                    <Navbar onCreateClick={() => dashboard.setIsSquadModalOpen(true)} onJoinClick={() => dashboard.setIsJoinModalOpen(true)}/>
                </div>
            </div>

            <Suspense fallback={null}>
            {routeActive && dashboard.isSquadModalOpen && <CreateSquadModal isOpen onClose={() => dashboard.setIsSquadModalOpen(false)}/>}
            {routeActive && dashboard.isJoinModalOpen && <JoinSquadModal isOpen onClose={() => dashboard.setIsJoinModalOpen(false)}/>}
            {routeActive && dashboard.photoFile && <CreateBeerCallModal squadId={dashboard.id || ''} photoFile={dashboard.photoFile} location={dashboard.photoLocation}
                                 scheduledApero={dashboard.startingScheduledApero}
                                 onClose={() => {
                                     dashboard.setPhotoFile(null);
                                     dashboard.setPhotoLocation(null);
                                     dashboard.setStartingScheduledApero(null);
                                  }}/>}
            {routeActive && dashboard.selectedBeerCall && <RespondBeerCallModal isOpen onClose={() => dashboard.setSelectedBeerCall(null)}
                                  beerCall={dashboard.selectedBeerCall} squadId={dashboard.id || ''} location={dashboard.userLocation}/>}
            {routeActive && dashboard.isScheduleModalOpen && <ScheduleAperoModal isOpen onClose={() => dashboard.setIsScheduleModalOpen(false)}
                                squadId={dashboard.id || ''} coordinates={dashboard.scheduleCoordinates}/>}
            {routeActive && !dashboard.isGameScreenOpen && dashboard.isWorldsModalOpen && (
                <SelectWorldModal isOpen={!!dashboard.isWorldsModalOpen} onClose={() => dashboard.setIsWorldsModalOpen(null)}
                                  squadId={dashboard.id || ''} beerCallId={dashboard.isWorldsModalOpen || ''} isActiveApero={!!dashboard.isActiveApero}/>
            )}
            </Suspense>
        </div>
    );
}
