
import React, { useState } from 'react';
import type { CompanyProfile, ThemeColor } from '../types';
import { useAuth } from './AuthContext';

type View = 'dashboard' | 'dataManagement';

interface SidebarProps {
    currentView: View;
    setView: (view: View) => void;
    profile: CompanyProfile;
    isReadOnly: boolean;
    isCollapsed: boolean;
    toggleCollapse: () => void;
    themeColor: ThemeColor;
    setThemeColor: (color: ThemeColor) => void;
}

const themeColors: Record<ThemeColor, string> = {
    zinc: 'bg-zinc-600',
    emerald: 'bg-emerald-600',
    rose: 'bg-rose-600',
    amber: 'bg-amber-500',
    indigo: 'bg-indigo-600',
    orange: 'bg-orange-500',
};

const Sidebar: React.FC<SidebarProps> = ({ 
    currentView, 
    setView, 
    profile, 
    isReadOnly, 
    isCollapsed, 
    toggleCollapse,
    themeColor,
    setThemeColor
}) => {
    const { signIn, fbUser } = useAuth();
    const isGuest = fbUser?.uid === 'local-guest-user';
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

    // Dynamic classes based on theme
    const activeItemClass = {
        zinc: 'text-zinc-900 bg-zinc-200/50 dark:bg-zinc-800 dark:text-zinc-100',
        emerald: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400',
        rose: 'text-rose-700 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-400',
        amber: 'text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400',
        indigo: 'text-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-400',
        orange: 'text-orange-700 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400',
    }[themeColor];

    const hoverItemClass = 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200';

    const MenuItem: React.FC<{ 
        view: View; 
        label: string; 
        icon: React.ReactNode; 
        disabled?: boolean;
    }> = ({ view, label, icon, disabled }) => (
        <button
            onClick={() => !disabled && setView(view)}
            disabled={disabled}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 text-sm font-medium ${
                disabled ? 'opacity-50 cursor-not-allowed text-zinc-400' :
                currentView === view ? activeItemClass : hoverItemClass
            }`}
            title={isCollapsed ? label : undefined}
        >
            <span className="flex-shrink-0">{icon}</span>
            {!isCollapsed && <span className="truncate">{label}</span>}
        </button>
    );

    return (
        <aside 
            className={`flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 backdrop-blur-xl h-screen transition-all duration-300 ease-in-out fixed left-0 top-0 z-50 ${
                isCollapsed ? 'w-[72px]' : 'w-[260px]'
            }`}
        >
            {/* Header / Brand */}
            <div className={`flex items-center h-14 px-4 border-b border-zinc-200/50 dark:border-zinc-800/50 ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
                <div className={`flex items-center gap-2 overflow-hidden transition-all ${isCollapsed ? 'w-8' : 'w-full'}`}>
                    {profile.logo ? (
                        <img src={profile.logo} alt="Logo" className="w-6 h-6 rounded-md object-cover flex-shrink-0" />
                    ) : (
                        <div className={`w-6 h-6 rounded-md flex-shrink-0 flex items-center justify-center text-xs font-bold text-white ${themeColors[themeColor]}`}>
                            Y
                        </div>
                    )}
                    {!isCollapsed && (
                        <span className="font-semibold text-zinc-800 dark:text-zinc-100 truncate text-sm">
                            {profile.companyName || 'Yangyu Studio'}
                        </span>
                    )}
                </div>
                {!isCollapsed && (
                    <button onClick={toggleCollapse} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                <MenuItem 
                    view="dashboard" 
                    label="儀表板" 
                    icon={
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                        </svg>
                    } 
                />
                <MenuItem 
                    view="dataManagement" 
                    label="資料管理" 
                    disabled={isReadOnly}
                    icon={
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                        </svg>
                    } 
                />
            </nav>

            {/* Footer / Theme Switcher */}
            <div className="p-3 border-t border-zinc-200 dark:border-zinc-800">
                {/* Theme Dots */}
                {!isCollapsed && (
                    <div className="mb-4 px-2">
                        <p className="text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Theme</p>
                        <div className="flex gap-2 flex-wrap">
                            {(Object.keys(themeColors) as ThemeColor[]).map((color) => (
                                <button
                                    key={color}
                                    onClick={() => setThemeColor(color)}
                                    className={`w-4 h-4 rounded-full transition-transform hover:scale-110 ${themeColors[color]} ${themeColor === color ? 'ring-2 ring-offset-2 ring-zinc-400 dark:ring-offset-zinc-900' : ''}`}
                                    title={color}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {isGuest && !isReadOnly && (
                    <button 
                        onClick={signIn}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors ${isCollapsed ? 'justify-center' : ''}`}
                        title="連接雲端"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        {!isCollapsed && <span>連接雲端</span>}
                    </button>
                )}
                
                {isCollapsed && (
                     <button onClick={toggleCollapse} className="w-full flex justify-center py-2 text-zinc-400 hover:text-zinc-600">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                        </svg>
                    </button>
                )}
            </div>
        </aside>
    );
};

export default Sidebar;
