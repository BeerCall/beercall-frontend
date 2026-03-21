import {useState, useEffect} from 'react';
import {X, Beer, Waves, Moon} from 'lucide-react';
import {motion, AnimatePresence} from 'framer-motion';
import {useQuery} from '@tanstack/react-query';
import {Canvas} from '@react-three/fiber';
import {OrbitControls} from '@react-three/drei';
import {api} from '../../lib/api';

// 🌍 IMPORT DE TES 3 MONDES
import BarWorld from '../3D/BarWorld';
import PiscineWorld from '../3D/PiscineWorld';
import FloatyIslandWorld from '../3D/FloatyIslandWorld.tsx';

const silenceWarnings = () => {
    const originalWarn = console.warn;
    console.warn = (...args) => {
        const msg = args.join(' ');
        if (msg.includes('THREE.') || msg.includes('X4122') || msg.includes('skinning weights')) return;
        originalWarn(...args);
    };
};

// --- LA MODALE PRINCIPALE ---
interface SelectWorldModalProps {
    isOpen: boolean;
    onClose: () => void;
    squadId: string;
    beerCallId: string;
}

type WorldTab = 'bar' | 'piscine' | 'dodo';

export default function SelectWorldModal({isOpen, onClose, squadId, beerCallId}: SelectWorldModalProps) {
    const [activeTab, setActiveTab] = useState<WorldTab>('bar');

    useEffect(() => {
        silenceWarnings();
    }, []);

    const {data: worldsData, isLoading} = useQuery({
        queryKey: ['worlds', squadId, beerCallId],
        queryFn: async () => {
            const response = await api.get(`/squads/${squadId}/beer-calls/${beerCallId}/worlds`);
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

    const currentParticipants = worldsData?.[activeTab]?.participants || [];

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
                            <button onClick={onClose}
                                    className="p-2 bg-gray-100 rounded-full text-gray-400 hover:bg-gray-200">
                                <X size={20}/>
                            </button>
                        </div>

                        <div className="flex bg-white px-6 py-2 border-b border-gray-100 z-20 gap-2 shadow-md">
                            {(Object.keys(THEMES) as WorldTab[]).map((tab) => (
                                <button
                                    key={tab} onClick={() => setActiveTab(tab)}
                                    className={`flex-1 flex flex-col items-center p-3 rounded-2xl transition-all ${activeTab === tab ? THEMES[tab].color + ' text-white shadow-lg' : 'bg-gray-50 text-gray-400'}`}
                                >
                                    {THEMES[tab].icon}
                                    <span className="text-[10px] font-black uppercase tracking-widest mt-1">{tab}</span>
                                </button>
                            ))}
                        </div>

                        {/* 🌟 LA SCÈNE 3D 🌟 */}
                        <div className="flex-1 relative transition-colors duration-500"
                             style={{backgroundColor: THEMES[activeTab].bg}}>
                            {isLoading ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center z-50">
                                    <div
                                        className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin border-gray-900"></div>
                                </div>
                            ) : (
                                <Canvas camera={{position: [0, 80, 450], fov: 45}} dpr={[1, 2]}>
                                    <ambientLight intensity={activeTab === 'bar' ? 1 : 1.5}/>
                                    <directionalLight position={[10, 10, 10]} intensity={2.5}/>
                                    <directionalLight position={[-10, 10, -10]} intensity={1}/>

                                    {/* AIGUILLAGE VERS LES BONS COMPOSANTS 3D */}
                                    {activeTab === 'bar' && <BarWorld participants={currentParticipants}/>}
                                    {activeTab === 'piscine' && <PiscineWorld participants={currentParticipants}/>}
                                    {activeTab === 'dodo' && <FloatyIslandWorld participants={currentParticipants}/>}

                                    <OrbitControls
                                        enableZoom={true}
                                        target={[0, 80, 0]}
                                        minPolarAngle={Math.PI / 3} maxPolarAngle={Math.PI / 1.8}
                                        autoRotate={false}
                                        autoRotateSpeed={0.5}
                                    />
                                </Canvas>
                            )}

                            {/* TITRE EN SURIMPRESSION */}
                            <div
                                className="absolute top-6 left-0 right-0 pointer-events-none flex flex-col items-center z-20">
                                <h3 className={`font-black text-2xl uppercase italic drop-shadow-md ${THEMES[activeTab].text}`}>
                                    {THEMES[activeTab].title}
                                </h3>
                                <p className="text-gray-900 bg-white/50 backdrop-blur px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mt-2 border border-white/50 shadow-sm">
                                    {currentParticipants.length} Soldat(s)
                                </p>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}