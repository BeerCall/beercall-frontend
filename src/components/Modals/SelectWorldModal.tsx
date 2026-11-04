import {useState, useMemo} from 'react';
import {X, Beer, Waves, Moon} from 'lucide-react';
import {motion, AnimatePresence} from 'framer-motion';
import {useQuery} from '@tanstack/react-query';
import {api} from '../../lib/api';
import {useGameEngine} from '../../hooks/useGameEngine';
import {useGameUIStore} from '../../store/useGameUIStore';
import type {WorldsResponse} from '../../types/api';
import type {WorldTab} from '../../lib/worldResources';
import {WorldScene} from '../../worlds/WorldScene';

// 📸 IMPORT DE TA MODALE
import PhotoModal from '../Modals/PhotoModal';

// --- LA MODALE PRINCIPALE ---
interface SelectWorldModalProps {
    isOpen: boolean;
    onClose: () => void;
    squadId: string;
    beerCallId: string;
    isActiveApero: boolean;
}

// --- LA MODALE PRINCIPALE ---
interface SelectWorldModalProps {
    isOpen: boolean;
    onClose: () => void;
    squadId: string;
    beerCallId: string;
    isActiveApero: boolean;
}

export default function SelectWorldModal({
    isOpen,
    onClose,
    squadId,
    beerCallId,
    isActiveApero,
}: SelectWorldModalProps) {
    const [activeTab, setActiveTab] = useState<WorldTab>('bar');
    const [tabGeneration, setTabGeneration] = useState(0);
    const contextKey = isOpen ? JSON.stringify([squadId, beerCallId]) : null;
    const [sceneContext, setSceneContext] = useState(contextKey);
    if (sceneContext !== contextKey) {
        // Reopen / another Beer Call requires a fresh readiness cycle, even on the same tab.
        setSceneContext(contextKey);
        setTabGeneration(generation => generation + 1);
    }
    const handleTabClick = (tab: WorldTab) => {
        if (tab === activeTab) return;
        setActiveTab(tab);
        setTabGeneration((prev) => prev + 1);
    };

    // 📸 NOUVEAU : STATE POUR LES PHOTOS GÉRÉ ICI
    const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
    const [currentPhotoIndex, setCurrentPhotoIndex] = useState<number>(0);

    const {data: worldsData, isPending, isError, refetch} = useQuery({
        queryKey: ['worlds', squadId, beerCallId],
        queryFn: async () => {
            const response = await api.get<WorldsResponse>(`/squads/${squadId}/beer-calls/${beerCallId}/worlds`);
            return response.data.worlds;
        },
        enabled: isOpen && !!squadId && !!beerCallId,
    });

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
    const hasWorldData = worldsData !== undefined && worldsData !== null;
    const participantsReliable = hasWorldData && !isPending && !isError;
    const canLaunchGame = isActiveApero && participantsReliable && currentParticipants.length >= 2;

    // Contrôle accessible de lancement : le levier 3D reste le contrôle visuel,
    // mais un bouton masqué permet aux lecteurs d'écran et aux tests E2E de démarrer la partie.
    const {startGame, isLocked} = useGameEngine(beerCallId, {enabled: isActiveApero});
    const openGameScreen = useGameUIStore((state) => state.openGameScreen);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}}
                        className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100]"
                        onClick={onClose}
                    />

                    <motion.div
                        initial={{y: "100%", opacity: 0}} animate={{y: 0, opacity: 1}} exit={{y: "100%", opacity: 0}}
                        transition={{type: "spring", damping: 25, stiffness: 200}}
                        className="fixed top-12 bottom-0 left-0 right-0 bg-white rounded-t-[3rem] z-[101] shadow-2xl flex flex-col overflow-hidden"
                    >
                        <div className="flex justify-between items-center p-6 bg-white shadow-sm z-20">
                            <h2 className="text-2xl font-black text-gray-900 uppercase italic tracking-tighter">Les 3
                                Mondes</h2>
                            <div className="flex items-center gap-2">
                                <button onClick={onClose}
                                        className="p-2 bg-gray-100 rounded-full text-gray-400 hover:bg-gray-200">
                                    <X size={20}/>
                                </button>
                            </div>
                        </div>

                        <div className="flex bg-white px-6 py-2 border-b border-gray-100 z-20 gap-2 shadow-md">
                            {(Object.keys(THEMES) as WorldTab[]).map((tab) => (
                                <button
                                    key={tab} onClick={() => handleTabClick(tab)}
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
                            onClick={() => startGame({
                                onSuccess: () => {
                                    openGameScreen(beerCallId);
                                    onClose();
                                },
                            })}
                        >
                            Démarrer la partie
                        </button>

                        {/* 🌟 LA SCÈNE 3D 🌟 */}
                        {isError && hasWorldData && <div role="alert" className="mx-6 my-2 text-xs text-gray-900">
                            Actualisation impossible — dernières données affichées
                            <button onClick={() => refetch()} className="ml-2 underline font-bold">Réessayer</button>
                        </div>}
                        <div className="flex-1 relative transition-colors duration-500"
                             style={{backgroundColor: THEMES[activeTab].bg}}>
                             {!hasWorldData ? (
                                 <div className="absolute inset-0 flex flex-col items-center justify-center z-50">
                                     {isError ? <div role="alert" className="text-sm text-gray-900 text-center">
                                         <p>Participants indisponibles</p>
                                         <button onClick={() => refetch()} className="mt-3 underline font-bold">Réessayer</button>
                                     </div> : <>
                                         <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin border-gray-900"></div>
                                         <p role="status" className="mt-3 text-sm text-gray-900">Chargement des participants…</p>
                                     </>}
                                </div>
                            ) : (
                                <WorldScene
                                    key={`${activeTab}-${tabGeneration}`}
                                    world={activeTab}
                                    participants={currentParticipants}
                                />
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
                    </motion.div>

                    {/* 📸 LA MODALE PHOTO RENDUE ICI, TOTALEMENT SÉCURISÉE HORS DU CANVAS */}
                    {selectedPhotos.length > 0 && (
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
            )}
        </AnimatePresence>
    );
}
