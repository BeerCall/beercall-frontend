import {Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo} from 'react';
import {X, Beer, Waves, Moon} from 'lucide-react';
import {motion} from 'framer-motion';
import {useQuery} from '@tanstack/react-query';
import {api} from '../../lib/api';
import {useGameEngine} from '../../hooks/useGameEngine';
import {useGameUIStore} from '../../store/useGameUIStore';
import {useDashboardActive} from '../../lib/dashboardActivity';
import type {WorldsResponse} from '../../types/api';
import type {WorldTab} from '../../lib/worldResources';
import {beginWorldOpen, endWorldOpen} from '../../lib/worldOpenState';
import {WorldViewport} from '../../worlds/WorldViewport';
import {
    grantAllPreparationAvatars,
    markPreparationCanvasReady,
    markPreparationDataReady,
    markPreparationLabelsReady,
    resetPreparationForTarget,
    setPreparationOpenWorld,
    setPreparationPriority,
} from '../../worlds/worldPreparation';
import {
    beginFirstOpen,
    failFirstOpen,
    markFirstOpenAvatars,
    markFirstOpenCanvas,
    markFirstOpenData,
    markFirstOpenFrame,
    markFirstOpenLabels,
} from '../../worlds/firstOpenMeasurement';
import {countWorldLabels, expectedLabels, labelsSatisfied} from '../../perf/worldProbeMetrics';
import {WORLD_PROBE_ENABLED} from '../../perf/worldProbeGate';
import {WorldProbePanel} from 'virtual:world-probe';

// 📸 IMPORT DE TA MODALE
import PhotoModal from '../Modals/PhotoModal';

// --- LA MODALE PRINCIPALE ---
interface SelectWorldModalProps {
    isOpen: boolean;
    onClose: () => void;
    squadId: string;
    beerCallId: string;
    isActiveApero: boolean;
    /** Beer Call affiché sur la carte : préparation au repos même modale fermée. */
    preparationBeerCallId?: string | null;
    /** Ouvre le profil de l'avatar touché (Bar, Piscine ou Dodo). */
    onSelectUser?: (userId: string) => void;
}

export default function SelectWorldModal({
    isOpen,
    onClose,
    squadId,
    beerCallId,
    isActiveApero,
    preparationBeerCallId = null,
    onSelectUser,
}: SelectWorldModalProps) {
    const dashboardActive = useDashboardActive();
    const [activeTab, setActiveTab] = useState<WorldTab>('bar');
    const [hasViewportData, setHasViewportData] = useState(false);
    const firstOpenBegan = useRef(false);
    const [readyWorlds, setReadyWorlds] = useState<Partial<Record<WorldTab, boolean>>>({});
    // Signal de disponibilité de la scène, consommé uniquement par le probe.
    const [sceneReady, setSceneReady] = useState<{world: WorldTab | null; tick: number}>({
        world: null,
        tick: 0,
    });

    const markSceneReady = useCallback((world: WorldTab) => {
        setReadyWorlds((previous) => previous[world] ? previous : {...previous, [world]: true});
        setSceneReady((previous) => ({world, tick: previous.tick + 1}));
        if (WORLD_PROBE_ENABLED && isOpen && world === activeTab) {
            markFirstOpenAvatars();
        }
    }, [activeTab, isOpen]);

    // Le préchargement GLB au repos laisse la place au monde ouvert.
    useEffect(() => {
        if (!isOpen) return;
        beginWorldOpen();
        return () => endWorldOpen();
    }, [isOpen]);

    // Conserve le dernier Beer Call pour garder le Canvas vivant après fermeture.
    const [lastContext, setLastContext] = useState({squadId: '', beerCallId: ''});
    if (isOpen && (lastContext.squadId !== squadId || lastContext.beerCallId !== beerCallId)) {
        setLastContext({squadId, beerCallId});
    }
    const activeSquadId = isOpen ? squadId : (preparationBeerCallId ? squadId : lastContext.squadId);
    const activeBeerCallId = isOpen ? beerCallId : (preparationBeerCallId || lastContext.beerCallId);

    const {data: worldsData, isPending, isError, refetch} = useQuery({
        queryKey: ['worlds', activeSquadId, activeBeerCallId],
        queryFn: async () => {
            const response = await api.get<WorldsResponse>(
                `/squads/${activeSquadId}/beer-calls/${activeBeerCallId}/worlds`,
            );
            return response.data.worlds;
        },
        enabled: !!activeSquadId && !!activeBeerCallId,
    });

    // Ajustement pendant le rendu : le Canvas doit rester monté dès la première
    // donnée, même quand une nouvelle requête repasse par `undefined`.
    if (worldsData && !hasViewportData) setHasViewportData(true);

    // La préparation suit le Beer Call réellement affiché/ouvert. Layout effect :
    // le magasin doit connaître la cible avant les effets de montage des couches.
    // Au changement de squad, l'ancienne cible est invalidée immédiatement : le
    // badge ne montre jamais le total de la squad quittée pendant le chargement.
    const preparationSquadId = useRef(squadId);
    useLayoutEffect(() => {
        if (preparationSquadId.current === squadId) return;
        preparationSquadId.current = squadId;
        resetPreparationForTarget(null);
    }, [squadId]);

    useLayoutEffect(() => {
        const target = isOpen ? beerCallId : preparationBeerCallId;
        if (target) resetPreparationForTarget(target);
    }, [isOpen, beerCallId, preparationBeerCallId]);

    useEffect(() => {
        if (!worldsData || !activeBeerCallId) return;
        markPreparationDataReady();
    }, [worldsData, activeBeerCallId]);

    // Le Canvas persiste d'une cible à l'autre : onCreated ne rejoue pas, donc
    // on réarme explicitement l'état Canvas quand une nouvelle cible est prête.
    useEffect(() => {
        if (!hasViewportData || !activeBeerCallId) return;
        const timer = window.setTimeout(() => markPreparationCanvasReady(), 0);
        return () => window.clearTimeout(timer);
    }, [hasViewportData, activeBeerCallId]);

    // Une nouvelle version de données reconstruit les couches (jamais le Canvas).
    const dataVersion = worldsData
        ? `${activeBeerCallId}:${(['bar', 'piscine', 'dodo'] as WorldTab[])
            .map((world) => `${world}:${worldsData[world]?.participants.length ?? 0}`)
            .join('|')}`
        : `none:${activeBeerCallId}`;
    const [readyVersion, setReadyVersion] = useState(dataVersion);
    if (readyVersion !== dataVersion) {
        setReadyVersion(dataVersion);
        setReadyWorlds({});
        setSceneReady({world: null, tick: 0});
    }

    const handleTabClick = (tab: WorldTab) => {
        if (tab === activeTab) return;
        setActiveTab(tab);
    };

    // 📸 NOUVEAU : STATE POUR LES PHOTOS GÉRÉ ICI
    const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
    const [currentPhotoIndex, setCurrentPhotoIndex] = useState<number>(0);

    const THEMES = {
        bar: {
            color: 'bg-amber-500',
            text: 'text-amber-500',
            icon: <Beer size={20}/>,
            title: 'La Table des Braves',
            bg: '#fffbeb'
        },
        piscine: {
            color: 'bg-cyan-500',
            text: 'text-cyan-500',
            icon: <Waves size={20}/>,
            title: 'Le Bassin des Lâches',
            bg: '#ecfeff'
        },
        dodo: {
            color: 'bg-purple-600',
            text: 'text-purple-600',
            icon: <Moon size={20}/>,
            title: 'Le Dortoir Fantôme',
            bg: '#f3e8ff'
        }
    };

    const currentParticipants = useMemo(
        () => worldsData?.[activeTab]?.participants || [],
        [worldsData, activeTab],
    );
    const proofPhotos = useMemo(
        () => currentParticipants
            .map(participant => participant.proof_photo_url)
            .filter((url): url is string => Boolean(url)),
        [currentParticipants],
    );
    const hasWorldData = worldsData !== undefined && worldsData !== null;
    const participantsReliable = hasWorldData && !isPending && !isError;
    const canLaunchGame = isActiveApero && participantsReliable && currentParticipants.length >= 2;

    // Priorité au monde affiché. Si on ouvre avant la fin (et même avant les
    // données), on accorde tout de suite les avatars de ce monde dès qu'elles arrivent.
    useEffect(() => {
        setPreparationPriority(activeTab);
        setPreparationOpenWorld(isOpen ? activeTab : null);
        if (isOpen && hasWorldData) grantAllPreparationAvatars(activeTab);
    }, [isOpen, activeTab, activeBeerCallId, hasWorldData]);

    // Libellés du monde affiché déjà montés pour la préparation.
    useEffect(() => {
        if (!hasWorldData) return;
        const expected = expectedLabels(activeTab, currentParticipants);
        let cancelled = false;
        let raf = 0;
        const tick = () => {
            if (cancelled) return;
            if (labelsSatisfied(countWorldLabels(), expected)) {
                markPreparationLabelsReady();
                return;
            }
            raf = window.requestAnimationFrame(tick);
        };
        tick();
        return () => {
            cancelled = true;
            window.cancelAnimationFrame(raf);
        };
    }, [hasWorldData, activeTab, currentParticipants]);

    // Mesure de la vraie première ouverture, sans passer par le probe.
    useEffect(() => {
        if (!isOpen) {
            firstOpenBegan.current = false;
            return;
        }
        if (!WORLD_PROBE_ENABLED || firstOpenBegan.current || !worldsData) return;
        firstOpenBegan.current = true;
        const expected = expectedLabels(activeTab, currentParticipants);
        const entry = beginFirstOpen(beerCallId, activeTab, expected, Boolean(readyWorlds[activeTab]));
        if (entry.dataAt === null) markFirstOpenData();
    }, [isOpen, worldsData, beerCallId, activeTab, currentParticipants, readyWorlds]);

    useEffect(() => {
        if (!isOpen || !WORLD_PROBE_ENABLED || !hasWorldData) return;
        const expected = expectedLabels(activeTab, currentParticipants);
        let cancelled = false;
        let raf = 0;
        // Un monde qui progresse lentement (réseau froid) reste mesuré ; on
        // n'échoue que si plus aucun libellé n'apparaît pendant 30 s.
        let lastCount = -1;
        let lastProgressAt = performance.now();
        const tick = () => {
            if (cancelled) return;
            const labels = countWorldLabels();
            const count = labels.names + labels.photos + labels.excuses;
            if (count > lastCount) {
                lastCount = count;
                lastProgressAt = performance.now();
            }
            if (labelsSatisfied(labels, expected)) {
                markFirstOpenLabels(labels);
                return;
            }
            if (performance.now() - lastProgressAt > 30_000) {
                failFirstOpen(new Error('Libellés bloqués : aucun nouveau libellé depuis 30 s'));
                return;
            }
            raf = window.requestAnimationFrame(tick);
        };
        tick();
        return () => {
            cancelled = true;
            window.cancelAnimationFrame(raf);
        };
    }, [isOpen, hasWorldData, activeTab, currentParticipants]);

    const handleCanvasCreated = useCallback(() => {
        markPreparationCanvasReady();
        if (WORLD_PROBE_ENABLED) markFirstOpenCanvas();
    }, []);

    const handleFirstFrame = useCallback(() => {
        if (WORLD_PROBE_ENABLED) markFirstOpenFrame();
    }, []);

    // Contrôle accessible de lancement : le levier 3D reste le contrôle visuel,
    // mais un bouton masqué permet aux lecteurs d'écran et aux tests E2E de démarrer la partie.
    const {gameState, startGame, isLocked} = useGameEngine(beerCallId, {enabled: isActiveApero});
    const openGameScreen = useGameUIStore((state) => state.openGameScreen);

    // 8l — le levier du Bar et le bouton accessible partagent ce lancement :
    // la modale se referme (le Canvas reste monté) et le jeu prend l'écran.
    const handleStartGame = useCallback(() => {
        startGame({
            onSuccess: () => {
                openGameScreen(beerCallId);
                onClose();
            },
            onError: (error) => {
                console.error('[world] démarrage du jeu impossible', error);
            },
        });
    }, [startGame, openGameScreen, beerCallId, onClose]);

    const handleSelectPhoto = (url: string) => {
        const urls = proofPhotos.length ? proofPhotos : [url];
        setSelectedPhotos(urls);
        setCurrentPhotoIndex(Math.max(0, urls.indexOf(url)));
    };

    return (
        <>
            {isOpen && (
                <motion.div
                    initial={{opacity: 0}} animate={{opacity: 1}}
                    className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100]"
                    onClick={onClose}
                />
            )}

            {/* La feuille reste montée : le Canvas persistant vit dedans, même fermé. */}
            <motion.div
                initial={false}
                animate={isOpen ? {y: 0, opacity: 1} : {y: '100%', opacity: 0}}
                transition={{type: 'spring', damping: 25, stiffness: 200}}
                aria-hidden={!isOpen}
                className={`fixed top-12 bottom-0 left-0 right-0 bg-white rounded-t-[3rem] z-[101] shadow-2xl flex flex-col overflow-hidden ${isOpen ? '' : 'pointer-events-none'}`}
            >
                <div className="flex justify-between items-center p-6 bg-white shadow-sm z-20">
                    <h2 className="text-2xl font-black text-gray-900 uppercase italic tracking-tighter">Les 3
                        Mondes</h2>
                    <div className="flex items-center gap-2">
                        <button onClick={onClose} aria-label="Fermer les mondes"
                                className="p-2 bg-gray-100 rounded-full text-gray-400 hover:bg-gray-200">
                            <X size={20}/>
                        </button>
                    </div>
                </div>

                <div className="flex bg-white px-6 py-2 border-b border-gray-100 z-20 gap-2 shadow-md">
                    {(Object.keys(THEMES) as WorldTab[]).map((tab) => (
                        <button
                            key={tab} onClick={() => handleTabClick(tab)}
                            data-world-tab={tab}
                            className={`flex-1 flex flex-col items-center p-3 rounded-2xl transition-all ${activeTab === tab ? THEMES[tab].color + ' text-white shadow-lg' : 'bg-gray-50 text-gray-400'}`}
                        >
                            {THEMES[tab].icon}
                            <span className="text-[10px] font-black uppercase tracking-widest mt-1">{tab}</span>
                        </button>
                    ))}
                </div>

                <button
                    type="button"
                    aria-label="Démarrer la partie"
                    className="sr-only"
                    disabled={!canLaunchGame || isLocked}
                    onClick={handleStartGame}
                >
                    Démarrer la partie
                </button>

                {isError && hasWorldData && <div role="alert" className="mx-6 my-2 text-xs text-gray-900">
                    Actualisation impossible — dernières données affichées
                    <button onClick={() => refetch()} className="ml-2 underline font-bold">Réessayer</button>
                </div>}
                <div className="flex-1 relative transition-colors duration-500"
                     style={{backgroundColor: THEMES[activeTab].bg}}>
                    {dashboardActive && hasViewportData && (
                        <WorldViewport
                            open={isOpen}
                            activeTab={activeTab}
                            worlds={worldsData}
                            dataKey={`${activeSquadId}:${activeBeerCallId}`}
                            dataVersion={dataVersion}
                            onLayerReady={markSceneReady}
                            onSelectPhoto={handleSelectPhoto}
                            onSelectUser={onSelectUser}
                            onPullLever={handleStartGame}
                            gameInProgress={Boolean(gameState)}
                            gameLocked={isLocked}
                            canLaunchGame={canLaunchGame}
                            onCanvasCreated={handleCanvasCreated}
                            onFirstFrame={handleFirstFrame}
                        />
                    )}

                    {!hasWorldData && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center z-50">
                            {isError ? <div role="alert" className="text-sm text-gray-900 text-center">
                                <p>Participants indisponibles</p>
                                <button onClick={() => refetch()} className="mt-3 underline font-bold">Réessayer</button>
                            </div> : <>
                                <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin border-gray-900"></div>
                                <p role="status" className="mt-3 text-sm text-gray-900">Chargement des participants…</p>
                            </>}
                        </div>
                    )}

                    {/* TITRE EN SURIMPRESSION */}
                    {hasWorldData && <div
                        className="absolute top-6 left-0 right-0 pointer-events-none flex flex-col items-center z-20">
                        <h3 className={`font-black text-2xl uppercase italic drop-shadow-md ${THEMES[activeTab].text}`}>
                            {THEMES[activeTab].title}
                        </h3>
                        <p className="text-gray-900 bg-white/50 backdrop-blur px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mt-2 border border-white/50 shadow-sm">
                            {currentParticipants.length} Soldat(s)
                        </p>
                        {!isError && currentParticipants.length === 0 && <p className="mt-3 text-xs text-gray-900 bg-white p-2 rounded-xl">Aucun participant dans ce monde</p>}
                    </div>}
                </div>

                {isOpen && WORLD_PROBE_ENABLED && WorldProbePanel && (
                    <Suspense fallback={null}>
                        <WorldProbePanel
                            worlds={worldsData}
                            sceneReady={sceneReady}
                            readyWorlds={readyWorlds}
                        />
                    </Suspense>
                )}
            </motion.div>

            {/* 📸 LA MODALE PHOTO RENDUE ICI, TOTALEMENT SÉCURISÉE HORS DU CANVAS */}
            {isOpen && selectedPhotos.length > 0 && (
                <PhotoModal
                    imageUrls={selectedPhotos}
                    currentIndex={currentPhotoIndex}
                    onClose={() => {
                        setSelectedPhotos([]);
                        setCurrentPhotoIndex(0);
                    }}
                    onIndexChange={setCurrentPhotoIndex}
                />
            )}
        </>
    );
}
