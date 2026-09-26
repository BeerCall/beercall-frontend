// src/App.tsx
import React, { Suspense } from 'react';
import {BrowserRouter, Routes, Route, Navigate} from 'react-router-dom';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {useUserStore} from './store/useUserStore';
import {usePushNotifications} from './hooks/usePushNotifications';
import Layout from './components/Layout';
import ToastContainer from './components/UI/ToastContainer';

// Lazy loading extrême pour tuer le Bundle Size Obèse (LCP optimisé)
const Login = React.lazy(() => import('./pages/Login'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const SignUp = React.lazy(() => import('./pages/SignUp.tsx'));
const Profile = React.lazy(() => import('./pages/Profile.tsx'));
const Connections = React.lazy(() => import('./pages/Connections.tsx'));
const ChatPage = React.lazy(() => import('./pages/ChatPage'));

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 5,
            refetchOnWindowFocus: true,
        },
    },
});

const ProtectedRoute = ({ isAuthenticated, children, requireAuth = true }: { isAuthenticated: boolean, children: React.ReactNode, requireAuth?: boolean }) => {
    if (requireAuth && !isAuthenticated) return <Navigate to="/login" replace />;
    if (!requireAuth && isAuthenticated) return <Navigate to="/dashboard" replace />;
    return <>{children}</>;
};

const LoadingFallback = () => (
    <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-beer"></div>
    </div>
);

export default function App() {
    const isAuthenticated = useUserStore((state) => state.isAuthenticated);

    usePushNotifications();

    return (
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <ToastContainer/>
                <Suspense fallback={<LoadingFallback />}>
                    <Routes>
                        <Route element={<Layout/>}>
                            {/* Public (Guest Only) Routes */}
                            <Route path="/login" element={<ProtectedRoute isAuthenticated={isAuthenticated} requireAuth={false}><Login/></ProtectedRoute>} />
                            <Route path="/signup" element={<ProtectedRoute isAuthenticated={isAuthenticated} requireAuth={false}><SignUp/></ProtectedRoute>} />

                            {/* Protected Routes */}
                            <Route path="/profile" element={<ProtectedRoute isAuthenticated={isAuthenticated}><Profile/></ProtectedRoute>} />
                            <Route path="/profile/:id" element={<ProtectedRoute isAuthenticated={isAuthenticated}><Profile/></ProtectedRoute>} />
                            <Route path="/connections" element={<ProtectedRoute isAuthenticated={isAuthenticated}><Connections/></ProtectedRoute>} />
                            <Route path="/dashboard" element={<ProtectedRoute isAuthenticated={isAuthenticated}><Dashboard/></ProtectedRoute>} />
                            <Route path="/squad/:id" element={<ProtectedRoute isAuthenticated={isAuthenticated}><Dashboard/></ProtectedRoute>} />
                            <Route path="/squad/:squadId/beer-call/:beerCallId/chat" element={<ProtectedRoute isAuthenticated={isAuthenticated}><ChatPage/></ProtectedRoute>} />
                            <Route path="/squad/:id/chat" element={<ProtectedRoute isAuthenticated={isAuthenticated}><ChatPage/></ProtectedRoute>} />

                            {/* Fallback */}
                            <Route path="*" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace/>}/>
                        </Route>
                    </Routes>
                </Suspense>
            </BrowserRouter>
        </QueryClientProvider>
    );
}