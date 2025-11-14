import React from 'react';
import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { UserRole } from '../../types';
import { useData } from '../../contexts/DataContext';

interface SidebarProps {
  isSidebarOpen: boolean;
  closeSidebar: () => void;
}

const Logo = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor" className="h-10 w-10 text-blue-600 dark:text-blue-400 flex-shrink-0">
        <path d="M381.6 224c0 5.2-3.1 9.5-7 9.5-2.3 0-4.4-.9-6-2.4-5.2-4.9-11.7-7.1-18.7-7.1-7 0-13.5 2.2-18.7 7.1-1.6 1.5-3.7 2.4-6 2.4-3.9 0-7-4.2-7-9.5s3.1-9.5 7-9.5c5.2 0 10.1 2 13.8 5.7 2.9-2.2 6.3-3.4 9.9-3.4s7 1.2 9.9 3.4c3.7-3.7 8.6-5.7 13.8-5.7 3.9 0 7 4.3 7 9.5zM256 208c-26.5 0-48 21.5-48 48s21.5 48 48 48 48-21.5 48-48-21.5-48-48-48zm0 80c-17.7 0-32-14.3-32-32s14.3-32 32-32 32 14.3 32 32-14.3 32-32 32zm-64-56c0-4.4-3.6-8-8-8s-8 3.6-8 8 3.6 8 8 8 8-3.6 8-8zm128 0c0-4.4-3.6-8-8-8s-8 3.6-8 8 3.6 8 8 8 8-3.6 8-8zM256 32C132.3 32 32 132.3 32 256s100.3 224 224 224 224-100.3 224-224S379.7 32 256 32zm0 432c-114.9 0-208-93.1-208-208S141.1 48 256 48s208 93.1 208 208-93.1 208-208 208zm-80-168c0-8.8-7.2-16-16-16s-16 7.2-16 16 7.2 16 16 16 16-7.2 16-16zm160 0c0-8.8-7.2-16-16-16s-16 7.2-16 16 7.2 16 16 16 16-7.2 16-16z"/>
        <path d="M256 128c-44.2 0-80 35.8-80 80v32c0 8.8-7.2 16-16 16s-16-7.2-16-16v-32c0-61.9 50.1-112 112-112s112 50.1 112 112v32c0 8.8-7.2 16-16 16s-16-7.2-16-16v-32c0-44.2-35.8-80-80-80zm-48 224h96c8.8 0 16-7.2 16-16s-7.2-16-16-16h-96c-8.8 0-16 7.2-16 16s7.2 16 16 16z"/>
    </svg>
);


export const Sidebar: React.FC<SidebarProps> = ({ isSidebarOpen, closeSidebar }) => {
  const { currentUser } = useAuth();
  const { upcomingChequesCount = 0 } = useData();

  const accessibleNavItems = NAV_ITEMS.filter(item => {
    // Allow cheques access for Admin, Secretary and Manager
    if (item.path === '/cheques' || item.path === '/issued-cheques') {
      return currentUser?.role === UserRole.Admin || currentUser?.role === UserRole.Secretary || currentUser?.role === UserRole.Manager;
    }
    if (item.path === '/users') {
      // Only allow Admins to see User Management (Secretary excluded)
      return currentUser?.role === UserRole.Admin;
    }
    // Allow deliveries, expenses, and live tracking to Admin, Secretary and Manager
    if (item.path === '/deliveries' || item.path === '/expenses' || item.path === '/live-tracking') {
      return currentUser?.role === UserRole.Admin || currentUser?.role === UserRole.Secretary || currentUser?.role === UserRole.Manager;
    }
    // My Location is only for Sales Reps and Drivers
    if (item.path === '/my-location') {
      return currentUser?.role === UserRole.Sales || currentUser?.role === UserRole.Driver;
    }
    // Make Settings visible to Admins, Secretary and Managers
    if (item.path === '/settings') {
      return currentUser?.role === UserRole.Admin || currentUser?.role === UserRole.Secretary || currentUser?.role === UserRole.Manager;
    }
    if (item.path === '/drivers' || item.path === '/suppliers' || item.path === '/collections') {
      return currentUser?.role === UserRole.Admin || currentUser?.role === UserRole.Secretary || currentUser?.role === UserRole.Manager;
    }
    // Cheque alerts settings only for Admin
    
    return true;
  });


  return (
  <aside className={`fixed inset-y-0 left-0 z-30 w-64 sm:w-72 lg:w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:fixed lg:inset-y-0 lg:left-0`}> 
      <div className="flex items-center justify-center h-16 sm:h-20 border-b border-slate-200 dark:border-slate-700 px-3 sm:px-4">
        <div className="relative w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-500 to-blue-700 dark:from-blue-400 dark:to-blue-600 rounded-xl shadow-lg flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 sm:h-7 sm:w-7 text-white">
            <path d="M7.5 6.5C7.5 8.981 9.519 11 12 11s4.5-2.019 4.5-4.5S14.481 2 12 2 7.5 4.019 7.5 6.5zM20 21h1v-1c0-3.859-3.141-7-7-7h-4c-3.859 0-7 3.141-7 7v1h17z"/>
            <path d="M12 12c-1.657 0-3 1.343-3 3v3c0 .553.447 1 1 1h4c.553 0 1-.447 1-1v-3c0-1.657-1.343-3-3-3z"/>
            <circle cx="18" cy="8" r="3" opacity="0.7"/>
            <circle cx="6" cy="8" r="3" opacity="0.7"/>
          </svg>
          <div className="absolute -top-1 -right-1 w-3 h-3 sm:w-4 sm:h-4 bg-green-400 rounded-full border-2 border-white dark:border-slate-800"></div>
        </div>
        <div className="ml-2 sm:ml-3 flex flex-col min-w-0">
          <h1 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white leading-tight tracking-wide truncate">SHIVAM</h1>
          <p className="text-xs font-medium text-blue-600 dark:text-blue-400 tracking-wider truncate">DISTRIBUTORS (PVT) LTD</p>
        </div>
      </div>
      <nav className="p-2 sm:p-2 flex-1">
        <ul className="space-y-0 pr-1">
          {accessibleNavItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `flex items-center px-2 py-2 sm:p-2 my-0.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors duration-200 text-xs sm:text-sm ${
                    isActive ? 'bg-blue-50 text-blue-600 dark:bg-slate-700 dark:text-blue-400' : ''
                  }`
                }
              >
                <div className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0">
                  {item.icon}
                </div>
                <span className="ml-3 sm:ml-4 font-medium truncate">{item.label}</span>
                {item.path === '/cheques' && upcomingChequesCount > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium leading-none text-red-700 bg-red-100 rounded-full">{upcomingChequesCount}</span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
};