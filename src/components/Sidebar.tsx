import { HomeIcon, SearchIcon, ClipboardList, X, LogInIcon, LogOutIcon, type LucideProps } from "lucide-react";
import type { ForwardRefExoticComponent, RefAttributes } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useThemeSync } from "../util/misc/useThemeSync";

export const Sidebar: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { isLight } = useThemeSync();

    const username = localStorage.getItem("username");

    const navItems: { label: string; path: string; icon: ForwardRefExoticComponent<Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>> }[] = [
        { label: 'Home', path: '/home', icon: HomeIcon },
        { label: 'Search Parts', path: '/partSearch', icon: SearchIcon },
        { label: 'Work Orders', path: '/workorders', icon: ClipboardList },
    ];

    const handleNavigation = (path: string) => {
        navigate(path);
        onClose();
    };

    const handleLogout = () => {
        localStorage.removeItem("username");
        navigate("/signin");
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
        <div>
            <div
                onClick={onClose}
                className={`fixed inset-0 bg-black/70 z-40 transition-opacity duration-300 
                            ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'}`}
            />
            <aside className={`h-full fixed top-0 left-0 bottom-0 w-64 border-r shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${asideBg} ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                
                {/* Header */}
                <div className={`h-12 flex items-center justify-between px-4 border-b ${headerBg}`}>
                    <span className="font-semibold text-xs uppercase tracking-wider">
                        {username ? `User: ${username}` : "Navigation"}
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

                {/* Footer Auth Action */}
                <div className={`p-3 border-t ${isLight ? "border-zinc-200 bg-zinc-50" : "border-gray-800 bg-gray-900/50"}`}>
                    {username ? (
                        <button
                            onClick={handleLogout}
                            className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-red-500 ${isLight ? "hover:bg-red-50" : "hover:bg-red-950/40"}`}
                        >
                            <LogOutIcon className="w-4 h-4 text-red-500" />
                            <span>Sign Out</span>
                        </button>
                    ) : (
                        <button
                            onClick={() => handleNavigation("/signin")}
                            className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${navInactive}`}
                        >
                            <LogInIcon className={`w-4 h-4 ${iconColor}`} />
                            <span>Sign In</span>
                        </button>
                    )}
                </div>

            </aside>
        </div>
    );
};