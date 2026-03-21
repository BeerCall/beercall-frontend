import {useState} from 'react';
import {useNavigate, Link} from 'react-router-dom';
import {LogIn, User, Lock, ChevronRight} from 'lucide-react';
import {useUserStore} from '../store/useUserStore';
import {api} from '../lib/api';

// Interface pour la réponse OAuth2 standard + ton champ username personnalisé
interface LoginResponse {
    access_token: string;
    token_type: string;
    username: string;
}

export default function Login() {
    const navigate = useNavigate();
    const loginAction = useUserStore((state) => state.login);

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            // 1. Formatage OAuth2 (URLSearchParams)
            const params = new URLSearchParams();
            params.append('username', username);
            params.append('password', password);

            // 2. Appel à ton API FastAPI
            const res = await api.post<LoginResponse>('/auth/token/', params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            });

            if (res.data.access_token) {
                // 3. Stockage du token
                localStorage.setItem('token', res.data.access_token);

                // 4. Mise à jour du store Zustand
                // On considère que loginAction() gère le passage à isAuthenticated: true
                loginAction(username);

                // 5. Redirection vers le Hub central
                navigate('/dashboard');
            }
        } catch (err: any) {
            console.error("Erreur Login:", err);
            setError("Identifiants incorrects ou serveur éméché 🥴");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div
            className="h-full w-full bg-[#f8fafc] flex flex-col px-8 justify-center font-sans relative overflow-hidden">

            {/* Background Decor */}
            <div className="absolute top-[-5%] right-[-10%] w-64 h-64 bg-beer opacity-10 rounded-full blur-3xl"/>
            <div className="absolute bottom-[-5%] left-[-10%] w-64 h-64 bg-beer opacity-5 rounded-full blur-3xl"/>

            <div className="text-center mb-12 animate-in fade-in zoom-in duration-500">
                <div
                    className="w-20 h-20 bg-white rounded-[2rem] shadow-xl mx-auto mb-6 flex items-center justify-center border-4 border-beer transform -rotate-6">
                    <span className="text-4xl">🍻</span>
                </div>
                <h1 className="text-4xl font-black text-gray-900 tracking-tighter italic uppercase">Retour au Bar</h1>
                <p className="text-[10px] font-black text-gray-400 mt-2 uppercase tracking-[0.2em]">La Squad
                    t'attend</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4 relative z-10">
                <div className="relative">
                    <User className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300" size={20}/>
                    <input
                        type="text"
                        placeholder="Ton Pseudo"
                        maxLength={14}
                        value={username}
                        onChange={(e) => {
                            const val = e.target.value;
                            if (/^[a-zA-Z0-9]*$/.test(val)) {
                                setUsername(val);
                            }
                        }}
                        className="w-full bg-white p-5 pl-14 rounded-[2rem] shadow-inner text-lg font-bold focus:outline-none border-4 border-transparent focus:border-beer transition-all"
                        required
                    />
                </div>

                <div className="relative">
                    <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300" size={20}/>
                    <input
                        type="password"
                        placeholder="Mot de passe"
                        maxLength={50}
                        value={password}
                        onChange={(e) => {
                            const val = e.target.value;
                            if (/^\S*$/.test(val)) {
                                setPassword(val);
                            }
                        }}
                        className="w-full bg-white p-5 pl-14 rounded-[2rem] shadow-inner text-lg font-bold focus:outline-none border-4 border-transparent focus:border-beer transition-all"
                        required
                    />
                </div>

                {error && (
                    <div className="bg-red-50 p-4 rounded-2xl animate-shake">
                        <p className="text-red-500 text-center font-black text-[10px] uppercase tracking-widest">
                            {error}
                        </p>
                    </div>
                )}

                <button
                    type="submit"
                    disabled={isLoading || !username || !password}
                    className="w-full bg-gray-900 text-white p-6 rounded-[2.5rem] font-black text-xl shadow-2xl flex items-center justify-center gap-3 active:scale-95 transition-all mt-6 disabled:opacity-30"
                >
                    {isLoading ? 'VÉRIFICATION...' : 'SE CONNECTER'} <LogIn size={24}/>
                </button>
            </form>

            <div className="mt-12 text-center relative z-10">
                <p className="text-gray-400 font-bold text-xs uppercase tracking-tighter">
                    Pas encore de Voxel ?
                </p>
                <Link to="/signup"
                      className="mt-2 inline-flex items-center gap-2 text-beer font-black text-lg hover:underline decoration-4">
                    REJOINDRE LA SQUAD <ChevronRight size={20}/>
                </Link>
            </div>
        </div>
    );
}