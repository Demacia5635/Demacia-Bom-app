import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Appbar } from "./Appbar";
import { Sidebar } from "./Sidebar";
import { useThemeSync } from "../util/misc/useThemeSync";
import '../css/DarkMode.css';
import '../css/LightMode.css';

export default function MainLayout() {
    const [isDrawerOpen, setDrawerOpen] = useState<boolean>(false);
    const { isLight } = useThemeSync();

    const location = useLocation();
    const isSidebar = location.pathname !== "/onshape";

    const layoutBg = isLight 
        ? "bg-zinc-50 text-zinc-900" 
        : "bg-gray-950 text-gray-100";

    return (
        <div className={`min-h-screen flex flex-col font-sans transition-colors duration-200 ${layoutBg}`}>
            <Appbar onOpenDrawer={() => setDrawerOpen(true)} isSidebar={isSidebar} />
            {isSidebar && (
                <Sidebar isOpen={isDrawerOpen} onClose={() => setDrawerOpen(false)} />
            )}
            <main className="flex-1 p-6 items-center justify-center w-full">
                <Outlet />
            </main>
        </div>
    );
}