import { Suspense, useState } from "react";
import { Outlet } from "react-router-dom";
import { Appbar } from "./Appbar";
import { Sidebar } from "./Sidebar";
import Toasts from "./Toasts";
import { useUnsavedEditsGuard } from "./useUnsavedEditsGuard";
import { useThemeSync } from "../util/misc/useThemeSync";
import '../css/table.css';

export default function MainLayout() {
    const [isDrawerOpen, setDrawerOpen] = useState<boolean>(false);
    const { isLight } = useThemeSync();
    // Closing or reloading the tab with unsaved edits asks first.
    useUnsavedEditsGuard();

    // Every page has the sidebar (the old in-Onshape "/onshape" page didn't).
    const isSidebar = true;

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
                {/* Pages load on first visit (App.tsx): the bar and sidebar stay meanwhile. */}
                <Suspense fallback={<div className="p-8 text-center text-sm opacity-60">Loading...</div>}>
                    <Outlet />
                </Suspense>
            </main>
            <Toasts />
        </div>
    );
}