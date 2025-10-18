import React, { useContext, useState } from 'react';
import { ThemeContext } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { Switch } from '../ui/Switch';

interface HeaderProps {
    toggleSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({ toggleSidebar }) => {
    const themeContext = useContext(ThemeContext);
    if (!themeContext) {
        throw new Error("Header must be used within a ThemeProvider");
    }
    const { theme, toggleTheme } = themeContext;
    
    const { currentUser, logout } = useAuth();
    const [isDropdownOpen, setDropdownOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between h-20 px-4 sm:px-6 lg:px-8">
        <button onClick={toggleSidebar} className="lg:hidden text-slate-500 dark:text-slate-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
            </svg>
        </button>
        <div className="relative hidden sm:block">
          <input
            type="text"
            placeholder="Search..."
            className="w-full max-w-xs pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-full bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <Switch 
                checked={theme === 'dark'} 
                onChange={() => toggleTheme()} 
                ariaLabel="Toggle dark mode"
            />
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-slate-400 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          </div>
          
          <div className="relative">
            <button onClick={() => setDropdownOpen(!isDropdownOpen)} className="flex items-center space-x-2">
              {currentUser?.avatarUrl && currentUser.avatarUrl.startsWith('data:image') ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser?.name}
                  className="w-10 h-10 rounded-full border-2 border-blue-500"
                />
              ) : null}
              <div className="hidden md:block text-left">
                <p className="font-semibold text-sm text-slate-800 dark:text-slate-200">{currentUser?.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{currentUser?.role}</p>
              </div>
            </button>
             {isDropdownOpen && (
                <div onMouseLeave={() => setDropdownOpen(false)} className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-md shadow-lg py-1 border dark:border-slate-700 z-30">
                    <a
                        href="#"
                        onClick={(e) => {
                            e.preventDefault();
                            logout();
                            setDropdownOpen(false);
                        }}
                        className="flex items-center px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                       Logout
                    </a>
                </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};