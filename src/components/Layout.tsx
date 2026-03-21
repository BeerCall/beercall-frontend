import {Outlet} from 'react-router-dom';

export default function Layout() {
    return (
        <div className="w-full h-[100dvh] bg-white relative overflow-hidden">
            <Outlet/>
        </div>
    );
}