import { SidebarIcon } from "lucide-react";
import { useThemeSync } from "../util/misc/useThemeSync"; // Adjust relative path if Appbar is in a different folder

export const Appbar: React.FC<{ onOpenDrawer: () => void, title?: string, isSidebar?: boolean }> = ({ onOpenDrawer, title = "Bom App", isSidebar = true }) => {
    const { isLight, toggleTheme } = useThemeSync();

    const headerBg = isLight 
        ? "bg-white border-zinc-200 text-zinc-900 shadow-sm" 
        : "bg-gray-900 border-gray-800 text-gray-100 shadow-md";
    
    const buttonHover = isLight 
        ? "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100" 
        : "text-gray-300 hover:text-white hover:bg-gray-800";
        
    const titleColor = isLight ? "text-zinc-900" : "text-gray-100";

    return (
        <header className={`h-12 border-b px-4 flex items-center justify-between sticky top-0 z-35 transition-colors duration-200 ${headerBg}`}>
            <div className="w-10 flex items-center">
                {isSidebar && (
                    <button
                        onClick={onOpenDrawer}
                        aria-label="Open Sidebar"
                        className={`p-1 rounded-md transition-colors focus:outline-none ${buttonHover}`}>
                        <SidebarIcon className="w-5 h-5" />
                    </button>
                )}
            </div>

            <h1 className={`text-base font-bold tracking-wider flex items-center gap-2 ${titleColor}`}>{title}</h1>

            <div className="w-10 flex items-center justify-end">
                <button
                    type="button"
                    onClick={toggleTheme}
                    aria-label="Toggle Theme"
                    className={`p-1.5 rounded-md text-sm transition-colors ${buttonHover}`}
                >
                    {isLight ? "🌙" : "☀️"}
                </button>
            </div>
        </header>
    );
};