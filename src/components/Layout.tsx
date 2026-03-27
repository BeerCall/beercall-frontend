import {Outlet} from 'react-router-dom';

export default function Layout() {
    return (
        <div className="w-full h-dvh bg-yellow-400 relative overflow-hidden">
            <Outlet/>
        </div>
    );
}