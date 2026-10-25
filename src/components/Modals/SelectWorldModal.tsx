import {useState, useEffect, useCallback, Suspense, type ComponentType} from 'react';
import {X, Beer, Waves, Moon} from 'lucide-react';
import {motion, AnimatePresence} from 'framer-motion';
import {useQuery} from '@tanstack/react-query';
import {Canvas} from '@react-three/fiber';
import {OrbitControls, Html, useProgress} from '@react-three/drei';
import {api} from '../../lib/api';
import {useGameEngine} from '../../hooks/useGameEngine';
import {useGameUIStore} from '../../store/useGameUIStore';
import type {WorldsResponse, WorldParticipant} from '../../types/api';
import SceneReadyProbe from '../3D/SceneReadyProbe';

// 📸 IMPORT DE TA MODALE
import PhotoModal from '../Modals/PhotoModal';

type WorldComponentProps = {
    participants: WorldParticipant[];
    onReadinessChange?: (isReady: boolean) => void;
    isActiveApero?: boolean;
    aperoId?: string;
    squadId?: string;
    onSelectPhoto?: (url: string) => void;
    participantsReliable?: boolean;
};

type LoadedWorldModule = {
    default: ComponentType<WorldComponentProps>;
};

const silenceWarnings = () => {
    const originalWarn = console.warn;
    console.warn = (...args) => {
        const msg = args.join(' ');
        if (msg.includes('THREE.') || msg.includes('X4122') || msg.includes('skinning weights')) return;
        originalWarn(...args);
    };
};

async function defaultWorldModuleLoader(tab: WorldTab): Promise<LoadedWorldModule> {
    switch (tab) {
        case 'bar':
            return import('../3D/BarWorld') as Promise<LoadedWorldModule>;
        case 'piscine':
            return import('../3D/PiscineWorld') as Promise<LoadedWorldModule>;
        case 'dodo':
            return import('../3D/FloatyIslandWorld') as Promise<LoadedWorldModule>;
        default:
            throw new Error(`Monde inconnu: ${tab}`);
    }
}

// --- LA MODALE PRINCIPALE ---
interface SelectWorldModalProps {
    isOpen: boolean;
    onClose: () => void;
    squadId: string;
    beerCallId: string;
    isActiveApero: boolean;
    worldModuleLoader?: (tab: WorldTab) => Promise<LoadedWorldModule>;
}

type WorldTab = 'bar' | 'piscine' | 'dodo';

// ⏳ COMPOSANT DE CHARGEMENT SÉCURISÉ POUR LE CANVAS
function CanvasLoader() {
    const {progress} = useProgress();
    return (
        <Html center>
            <div className="flex flex-col items-center bg-white/90 p-4 rounded-2xl shadow-xl backdrop-blur-md">
                <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs font-black text-amber-500 mt-2 tracking-widest">{progress.toFixed(0)}%</p>
            </div>
        </Html>
    );
}

export default function SelectWorldModal({
    isOpen,
    onClose,
    squadId,
    beerCallId,
    isActiveApero,
    worldModuleLoader = defaultWorldModuleLoader,
}: SelectWorldModalProps) {
    const [activeTab, setActiveTab] = useState<WorldTab>('bar');
    const [tabGeneration, setTabGeneration] = useState(0);
    const [worldReadiness, setWorldReadiness] = useState<{ tab: WorldTab; generation: number; ready: boolean }>({
        tab: 'bar',
        generation: 0,
        ready: false,
    });

    // Le passage d'onglet réarme une nouvelle génération ; les callbacks de l'ancien monde sont ignorés (T12B / REV-04)
    const isWorldReady = worldReadiness.tab === activeTab && worldReadiness.generation === tabGeneration && worldReadiness.ready;

    const handleTabClick = (tab: WorldTab) => {
        if (tab === activeTab) return;
        setActiveTab(tab);
        setTabGeneration((prev) => prev + 1);
    };

    // 📸 NOUVEAU : STATE POUR LES PHOTOS GÉRÉ ICI
    const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
    const [currentPhotoIndex, setCurrentPhotoIndex] = useState<number>(0);

    useEffect(() => {
        silenceWarnings();
    }, []);

    const handleWorldReadinessChange = useCallback((tab: WorldTab, generation: number, isReady: boolean) => {
        setWorldReadiness((prev) => {
            if (prev.tab === tab && prev.generation === generation && prev.ready === isReady) {
                return prev;
            }
            return { tab, generation, ready: isReady };
        });
    }, []);

    const {data: worldsData, isPending, isError, refetch} = useQuery({
        queryKey: ['worlds', squadId, beerCallId],
        queryFn: async () => {
            const response = await api.get<WorldsResponse>(`/squads/${squadId}/beer-calls/${beerCallId}/worlds`);
            return response.data.worlds;
        },
        enabled: isOpen && !!squadId && !!beerCallId,
    });

    // 🚀 REV-06 : Chargement dynamique du module du monde sélectionné uniquement
    const {
        data: worldModule,
        isPending: isModulePending,
        isError: isModuleError,
        refetch: refetchModule,
    } = useQuery<LoadedWorldModule>({
        queryKey: ['world-module', activeTab],
        queryFn: () => worldModuleLoader(activeTab),
        staleTime: Infinity,
        gcTime: Infinity,
        retry: 1,
        retryDelay: 100,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        enabled: isOpen,
    });

    const ActiveWorld = worldModule?.default;

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

    const currentParticipants = worldsData?.[activeTab]?.participants || [];
    const hasWorldData = worldsData !== undefined && worldsData !== null;
    const participantsReliable = hasWorldData && !isPending && !isError;
    const canLaunchGame = isActiveApero && participantsReliable && currentParticipants.length >= 2;

    // Contrôle accessible de lancement : le levier 3D reste le contrôle visuel,
    // mais un bouton masqué permet aux lecteurs d'écran et aux tests E2E de démarrer la partie.
    const {startGame, isLocked} = useGameEngine(beerCallId, {enabled: isActiveApero});
    const openGameScreen = useGameUIStore((state) => state.openGameScreen);

    // Handler pour mettre à jour la liste des photos et l'index actuel
    const handleSelectPhoto = (url: string) => {
        // Récupérer toutes les preuves de photos des participants de l'onglet actuel
        const allPhotos = currentParticipants
            .map((p) => p.proof_photo_url)
            .filter((url): url is string => url !== null && url !== undefined);
        
        setSelectedPhotos(allPhotos);
        // Trouver l'index de la photo cliquée
        const index = allPhotos.indexOf(url);
        setCurrentPhotoIndex(index >= 0 ? index : 0);
    };

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
                        {activeTab === 'bar' && isActiveApero && hasWorldData && !isError && currentParticipants.length < 2 &&
                            <p className="mx-6 mb-2 text-xs text-gray-700">Au moins 2 participants au Bar sont nécessaires</p>}
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
                            ) : isModuleError ? (
                                <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-white/80 p-6 text-center">
                                    <p className="text-sm font-bold text-gray-900 mb-1">Impossible de charger le monde 3D</p>
                                    <p className="text-xs text-gray-600 mb-3">Vérifiez votre connexion réseau</p>
                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            onClick={() => refetchModule()}
                                            className="px-4 py-2 bg-amber-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow hover:bg-amber-600 transition-colors"
                                        >
                                            Réessayer
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => window.location.reload()}
                                            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-gray-300 transition-colors"
                                        >
                                            Recharger la page
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                {isModulePending && !ActiveWorld && (
                                    <div role="status" className="absolute inset-0 flex flex-col items-center justify-center z-40">
                                        <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin border-gray-900"></div>
                                        <p className="mt-3 text-sm text-gray-900 font-bold">Chargement du monde 3D…</p>
                                    </div>
                                )}
                                <Canvas camera={{position: [0, 80, 450], fov: 45}} dpr={[1, 2]}>
                                    <ambientLight intensity={activeTab === 'bar' ? 1 : 1.5}/>
                                    <directionalLight position={[10, 10, 10]} intensity={2.5}/>
                                    <directionalLight position={[-10, 10, -10]} intensity={1}/>

                                    {/* 🛡️ SUSPENSE: EMPÊCHE LE DEMONTAGE GLOBAL DU DASHBOARD */}
                                    <Suspense fallback={<CanvasLoader />}>
                                        {/* AIGUILLAGE VERS LES BONS COMPOSANTS 3D AVEC LA FONCTION DE PHOTO */}
                                        {ActiveWorld && activeTab === 'bar' && (
                                            <ActiveWorld
                                                isActiveApero={isActiveApero}
                                                aperoId={beerCallId}
                                                squadId={squadId}
                                                participants={currentParticipants}
                                                onSelectPhoto={handleSelectPhoto}
                                                participantsReliable={participantsReliable}
                                                onReadinessChange={(ready) => handleWorldReadinessChange('bar', tabGeneration, ready)}
                                            />
                                        )}
                                        {ActiveWorld && activeTab === 'piscine' && (
                                            <ActiveWorld
                                                participants={currentParticipants}
                                                onReadinessChange={(ready) => handleWorldReadinessChange('piscine', tabGeneration, ready)}
                                            />
                                        )}
                                        {ActiveWorld && activeTab === 'dodo' && (
                                            <ActiveWorld
                                                participants={currentParticipants}
                                                onReadinessChange={(ready) => handleWorldReadinessChange('dodo', tabGeneration, ready)}
                                            />
                                        )}
                                        <SceneReadyProbe
                                            key={`world-probe-${activeTab}-${tabGeneration}`}
                                            kind="world"
                                            id={activeTab}
                                            view={`world-${activeTab}`}
                                            ready={participantsReliable && isWorldReady}
                                        />
                                    </Suspense>

                                    <OrbitControls
                                        enableZoom={true}
                                        target={[0, 80, 0]}
                                        minPolarAngle={Math.PI / 3} maxPolarAngle={Math.PI / 1.8}
                                        autoRotate={false}
                                        autoRotateSpeed={0.5}
                                    />
                                </Canvas>
                                </>
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
