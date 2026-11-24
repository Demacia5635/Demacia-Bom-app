import { HomeIcon, SearchIcon, ClipboardList, Package, X, Activity, HeartPulse, PackageX, ShieldCheck, Server, Factory, HardDrive, History, type LucideProps } from "lucide-react";
import { type ForwardRefExoticComponent, type RefAttributes } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useThemeSync } from "../util/misc/useThemeSync";
import { hasUnsavedEdits } from "../util/saveTracker";
import { LEAVE_WITH_UNSAVED_EDITS } from "./useUnsavedEditsGuard";
import { useAdminUnlocked } from "../util/adminUnlock";

type NavIcon = ForwardRefExoticComponent<Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>>;

/** The unlisted pages, at the bottom of the sidebar once this browser is unlocked (#/admin). */
const ADMIN_ITEMS: { label: string; path: string; icon: NavIcon }[] = [
    { label: 'Activity', path: '/activity', icon: History },
    { label: 'Production', path: '/production', icon: Factory },
    { label: 'Files', path: '/files', icon: HardDrive },
    { label: 'Onshape Footprint', path: '/tele', icon: Activity },
    { label: 'Data Health', path: '/health', icon: HeartPulse },
    { label: 'Parts in No Assembly', path: '/orphans', icon: PackageX },
    { label: 'Server', path: '/server', icon: Server },
    { label: 'Admin', path: '/admin', icon: ShieldCheck },
];

export const Sidebar: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { isLight } = useThemeSync();
    const adminUnlocked = useAdminUnlocked();

    const navItems: { label: string; path: string; icon: NavIcon }[] = [
        { label: 'Home', path: '/home', icon: HomeIcon },
        { label: 'Search Parts', path: '/partSearch', icon: SearchIcon },
        { label: 'Standard Parts', path: '/standardParts', icon: Package },
        { label: 'Work Orders', path: '/workorders', icon: ClipboardList },
    ];

    const handleNavigation = (path: string) => {
        // Edits still on their way (or failed): ask before leaving the page.
        if (path !== location.pathname && hasUnsavedEdits() && !window.confirm(LEAVE_WITH_UNSAVED_EDITS)) return;
        navigate(path);
        onClose();
    };

    // Theme-based styling variables
    const asideBg = isLight 
        ? "bg-white border-zinc-200 text-zinc-900" 
        : "bg-gray-900 border-gray-800 text-gray-100";

    const headerBg = isLight 
        ? "bg-zinc-50 border-zinc-200 text-zinc-500" 
        : "bg-gray-900/50 border-gray-800 text-gray-300";

    const closeBtnHover = isLight 
        ? "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100" 
        : "text-gray-400 hover:text-white hover:bg-gray-800";

    const navActive = isLight 
        ? "bg-zinc-100 text-blue-600 font-semibold" 
        : "bg-gray-800 text-indigo-400 font-semibold";

    const navInactive = isLight 
        ? "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900" 
        : "text-gray-300 hover:bg-gray-800 hover:text-indigo-400";

    const iconColor = isLight ? "text-blue-600" : "text-indigo-400";

    return (
        <div className="print:hidden">
            <div
                onClick={onClose}
                className={`fixed inset-0 bg-black/70 z-40 transition-opacity duration-300 
                            ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'}`}
            />
            {/* inert while closed: its buttons can't be reached with Tab off-screen. */}
            <aside inert={!isOpen} className={`h-full fixed top-0 left-0 bottom-0 w-64 border-r shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${asideBg} ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                
                {/* Header */}
                <div className={`h-12 flex items-center justify-between px-4 border-b ${headerBg}`}>
                    <span className="font-semibold text-xs uppercase tracking-wider">
                        Navigation
                    </span>
                    <button
                        onClick={onClose}
                        aria-label="Close Sidebar"
                        className={`p-1 rounded-md transition-colors ${closeBtnHover}`}>
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Main Nav Items */}
                <nav className="flex-1 px-2 py-3 space-y-1">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path || (item.path === '/home' && location.pathname === '/');

                        return (
                            <button
                                key={item.path}
                                onClick={() => handleNavigation(item.path)}
                                className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? navActive : navInactive}`}>
                                <Icon className={`w-4 h-4 ${iconColor}`} />
                                <span>{item.label}</span>
                            </button>
                        );
                    })}
                </nav>

                {/* Admin pages (this browser unlocked them at #/admin): at the bottom. */}
                {adminUnlocked && (
                    <nav aria-label="Admin pages" className={`px-2 pt-2 pb-3 space-y-1 border-t ${isLight ? "border-zinc-200" : "border-gray-800"}`}>
                        <div className={`px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider ${isLight ? "text-zinc-400" : "text-gray-500"}`}>Admin</div>
                        {ADMIN_ITEMS.map((item) => {
                            const Icon = item.icon;
                            const isActive = location.pathname === item.path;
                            return (
                                <button
                                    key={item.path}
                                    onClick={() => handleNavigation(item.path)}
                                    className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? navActive : navInactive}`}>
                                    <Icon className={`w-4 h-4 ${iconColor}`} />
                                    <span>{item.label}</span>
                                </button>
                            );
                        })}
                    </nav>
                )}

            </aside>
        </div>
    );
};