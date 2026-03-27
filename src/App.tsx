// src/App.tsx
import {BrowserRouter, Routes, Route, Navigate} from 'react-router-dom';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {useUserStore} from './store/useUserStore';
import {usePushNotifications} from './hooks/usePushNotifications';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import SignUp from "./pages/SignUp.tsx";
import Profile from "./pages/Profile.tsx";
import Connections from "./pages/Connections.tsx";
import ToastContainer from './components/UI/ToastContainer';
import {useEffect} from "react";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 5,
            refetchOnWindowFocus: true,
        },
    },
});

export default function App() {
    const isAuthenticated = useUserStore((state) => state.isAuthenticated);

    usePushNotifications();

    useEffect(() => {
        const setAppHeight = () => {
            // Récupère la taille exacte de l'écran en pixels
            const doc = document.documentElement;
            doc.style.setProperty('--app-height', `${window.innerHeight}px`);
        };

        // On l'exécute au lancement
        setAppHeight();

        // Et on l'exécute si l'utilisateur tourne son téléphone
        window.addEventListener('resize', setAppHeight);

        return () => window.removeEventListener('resize', setAppHeight);
    }, []);

    return (
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <ToastContainer/>
                <Routes>
                    <Route element={<Layout/>}>
                        <Route path="/login"
                               element={!isAuthenticated ? <Login/> : <Navigate to="/dashboard" replace/>}/>
                        <Route path="/signup"
                               element={!isAuthenticated ? <SignUp/> : <Navigate to="/dashboard" replace/>}/>

                        <Route path="/profile"
                               element={isAuthenticated ? <Profile/> : <Navigate to="/login" replace/>}/>
                        <Route path="/profile/:id"
                               element={isAuthenticated ? <Profile/> : <Navigate to="/login" replace/>}/>
                        <Route path="/connections"
                               element={isAuthenticated ? <Connections/> : <Navigate to="/login" replace/>}/>
                        <Route path="/dashboard"
                               element={isAuthenticated ? <Dashboard/> : <Navigate to="/login" replace/>}/>
                        <Route path="/squad/:id"
                               element={isAuthenticated ? <Dashboard/> : <Navigate to="/login" replace/>}/>

                        <Route path="*" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace/>}/>
                    </Route>
                </Routes>
            </BrowserRouter>
        </QueryClientProvider>
    );
}