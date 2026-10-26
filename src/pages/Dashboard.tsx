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
                {/* PILE HAUTE : identité d'abord, bannière push ensuite, jamais superposées */}
                <div className="absolute top-[calc(8px+env(safe-area-inset-top))] left-4 right-20 z-50 flex flex-col items-start gap-2 pointer-events-none">
                    {dashboard.id && (
                        <div data-dashboard-identity
                             className={`pointer-events-auto w-fit max-w-[calc(100vw_-_96px)] px-4 py-2 rounded-[1.75rem] shadow-xl border-2 flex flex-col items-start gap-1 transition-all ${dashboard.isNightMode ? 'bg-[#0F081C] text-beer-light' : 'bg-white text-gray-900'}`}
                             style={{borderColor: dashboard.squadDetails?.color ? `${dashboard.squadDetails.color}40` : 'rgba(217, 119, 6, 0.25)'}}>
                            <div className="w-full min-w-0">
                                {dashboard.squadDetails && (
                                    <h2 className="min-w-0 line-clamp-2 break-words font-black tracking-widest uppercase italic text-xl leading-tight">
                                        {dashboard.squadDetails.name}
                                    </h2>
                                )}
                                {!dashboard.squadDetails && dashboard.isSquadPending && (
                                    <p role="status" className="text-sm font-bold">Chargement de la squad…</p>
                                )}
                                {dashboard.isSquadError && (
                                    <div role="alert" className="max-w-[calc(100vw_-_96px)] text-xs text-center">
                                        <p>{dashboard.squadDetails ? 'Actualisation impossible — dernières données affichées' : squadErrorMessage}</p>
                                        <button onClick={() => dashboard.refetchSquad()} className="mt-1 min-h-11 underline font-bold">Réessayer</button>
                                    </div>
                                )}
                            </div>
                            {dashboard.squadDetails?.invite_code && (
                                <button onClick={dashboard.handleCopyCode}
                                        aria-label={`Copier le code ${dashboard.squadDetails.invite_code}`}
                                        className="shrink-0 min-h-11 flex items-center gap-2 hover:opacity-80 px-2 -mx-2 rounded-full transition-all group active:scale-95" title="Copier le code">
                                    <Key size={12} style={{color: dashboard.squadDetails?.color || '#D97706'}}/>
                                    <span className="font-black tracking-[0.25em] text-xs pt-[2px]">{dashboard.squadDetails.invite_code}</span>
                                    {dashboard.copied ? <Check size={14} className="text-green-500 animate-in zoom-in duration-300"/> :
                                        <Copy size={12} className="opacity-60 group-hover:opacity-100 transition-opacity"/>}
                                </button>
                            )}
                            {dashboard.locationMessage && (
                                <p role="status" className="w-full text-xs leading-[14px] [overflow-wrap:anywhere]">{dashboard.locationMessage}</p>
                            )}
                        </div>
                    )}

                    {dashboard.showPushBanner && (
                        <div data-push-banner
                             className="pointer-events-auto w-full max-w-[calc(100vw_-_96px)] bg-gray-900 text-white p-3 rounded-2xl flex flex-wrap items-center justify-between gap-2 shadow-xl">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div className="w-9 h-9 shrink-0 bg-beer rounded-full flex items-center justify-center">
                                    <BellRing size={18} className="text-white"/>
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className="font-black text-sm uppercase italic leading-tight">Ne rate aucun apéro !</span>
                                    <span className="text-xs text-gray-300 font-bold leading-tight">Active les alertes de la squad.</span>
                                </div>
                            </div>
                            <button onClick={dashboard.handleEnableNotifications}
                                    className="shrink-0 min-h-11 min-w-11 bg-white text-gray-900 px-4 rounded-xl font-black text-xs uppercase tracking-widest active:scale-95">
                                Activer
                            </button>
                        </div>
                    )}
                </div>

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
                    <Navbar isNightMode={dashboard.isNightMode} onCreateClick={() => dashboard.setIsSquadModalOpen(true)} onJoinClick={() => dashboard.setIsJoinModalOpen(true)}/>
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
