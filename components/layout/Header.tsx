import React, { useContext, useState } from 'react';
import { ThemeContext } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
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
  const { upcomingChequesCount = 0 } = useData();

  return (
    <header className="sticky top-0 z-20 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between h-14 sm:h-16 lg:h-20 px-3 sm:px-4 lg:px-6">
        <button 
          onClick={toggleSidebar} 
          className="lg:hidden p-2 -ml-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          aria-label="Toggle sidebar"
        >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16m-7 6h7" />
            </svg>
        </button>
        
        {/* Mobile: Show company name, Desktop: Show search */}
        <div className="flex-1 flex items-center justify-center lg:justify-start">
          {/* Mobile company name */}
          <div className="lg:hidden">
            <h1 className="text-lg font-semibold text-slate-800 dark:text-white">SHIVAM</h1>
          </div>
          
          {/* Desktop search */}
          <div className="relative hidden lg:block lg:ml-8">
            <input
              type="text"
              placeholder="Search..."
              className="w-full max-w-sm pl-10 pr-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-full bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-4">
          {/* Theme toggle - compact on mobile */}
          <div className="flex items-center space-x-1 sm:space-x-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <Switch 
                checked={theme === 'dark'} 
                onChange={() => toggleTheme()} 
                ariaLabel="Toggle dark mode"
            />
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 text-slate-400 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          </div>
          
          <div className="relative">
            <button 
              onClick={() => setDropdownOpen(!isDropdownOpen)} 
              className="flex items-center space-x-2 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              aria-label="User menu"
            >
              {currentUser?.avatarUrl && currentUser.avatarUrl.startsWith('data:image') ? (
                <div className="relative">
                  <img
                    src={currentUser.avatarUrl}
                    alt={currentUser?.name}
                    className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 ${currentUser?.role === 'Admin' && upcomingChequesCount > 0 ? 'border-red-500' : 'border-blue-500'}`}
                  />
                  {currentUser?.role === 'Admin' && upcomingChequesCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-600 rounded-full border-2 border-white" />
                  )}
                </div>
              ) : (
                <div className="relative">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-500 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  </div>
                  {currentUser?.role === 'Admin' && upcomingChequesCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-600 rounded-full border-2 border-white" />
                  )}
                </div>
              )}
              <div className="hidden sm:block text-left min-w-0">
                <p className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate max-w-[120px]">{currentUser?.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{currentUser?.role}</p>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400 hidden sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
             {isDropdownOpen && (
                <div 
                  onMouseLeave={() => setDropdownOpen(false)} 
                  className="absolute right-0 mt-2 w-48 sm:w-52 bg-white dark:bg-slate-800 rounded-lg shadow-lg border dark:border-slate-700 z-30 overflow-hidden"
                >
                    {/* Mobile: Show user info */}
                    <div className="sm:hidden px-4 py-3 border-b dark:border-slate-700">
                        <p className="font-semibold text-sm text-slate-800 dark:text-slate-200">{currentUser?.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{currentUser?.role}</p>
                    </div>
                    
                    <a
                        href="#"
                        onClick={(e) => {
                            e.preventDefault();
                            logout();
                            setDropdownOpen(false);
                        }}
                        className="flex items-center px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                       <span>Logout</span>
                    </a>
                </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};