import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { Dashboard } from './components/pages/Dashboard';
import { Products } from './components/pages/Products';
import { Orders } from './components/pages/Orders';
import { Deliveries } from './components/pages/Deliveries';
import { CustomerManagement } from './components/pages/CustomerManagement';
import { UserManagement } from './components/pages/UserManagement';
import { Settings } from './components/pages/Settings';
import { Login } from './components/pages/Login';
import { Drivers } from './components/pages/Drivers';
import { Suppliers } from './components/pages/Suppliers';
import { DailyTargets } from './components/pages/DailyTargets';
import { Collections } from './components/pages/Collections';
import ChequeManagement from './components/pages/ChequeManagement';
import IssuedCheques from './components/pages/IssuedCheques';
import Expenses from './components/pages/Expenses';
import PartnerInvestment from './components/pages/PartnerInvestment';
import Assets from './components/pages/Assets';

import { MyLocation } from './components/pages/MyLocation';
import { Map } from './components/pages/Map';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DataProvider } from './contexts/DataContext';

const ProtectedRoute = () => {
  const { currentUser } = useAuth();
  return currentUser ? <MainLayout /> : <Navigate to="/login" />;
};

const RoleProtectedRoute: React.FC<{ allowedRoles: string[]; element: React.ReactElement }> = ({ allowedRoles, element }) => {
  const { currentUser } = useAuth();
  if (!currentUser) return <Navigate to="/login" />;
  if (!allowedRoles.includes(currentUser.role)) return <Navigate to="/" />;
  return element;
};

const MainLayout = () => {
    const [isSidebarOpen, setSidebarOpen] = useState(false);
    const toggleSidebar = () => setSidebarOpen(!isSidebarOpen);
    const closeSidebar = () => setSidebarOpen(false);

    // Close sidebar when Escape is pressed
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') closeSidebar();
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, []);

    // Ensure sidebar state stays consistent on resize: when moving to large screens close mobile overlay
    useEffect(() => {
      const onResize = () => {
        try {
          if (window.innerWidth >= 1024) {
            // close mobile-only overlay state
            setSidebarOpen(false);
          }
        } catch (e) {}
      };
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }, []);

    return (
    <div className="relative flex min-h-screen bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200">
            {/* Mobile overlay */}
            {isSidebarOpen && (
                <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={closeSidebar}
          role="button"
          aria-label="Close sidebar"
          tabIndex={0}
                />
            )}
            
            <Sidebar isSidebarOpen={isSidebarOpen} closeSidebar={closeSidebar} />
            
      <div className="flex flex-col flex-1 min-w-0 lg:pl-64">
        <Header toggleSidebar={toggleSidebar} isSidebarOpen={isSidebarOpen} />
        <main className="flex-1 overflow-y-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6 max-w-full lg:max-w-screen-xl lg:mx-auto w-full">
                    <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/products" element={<Products />} />
                        <Route path="/orders" element={<Orders />} />
                        <Route path="/deliveries" element={<RoleProtectedRoute allowedRoles={["Admin", "Secretary", "Manager"]} element={<Deliveries />} />} />
                        <Route path="/customers" element={<CustomerManagement />} />
                        <Route path="/suppliers" element={<Suppliers />} />
                        <Route path="/collections" element={<RoleProtectedRoute allowedRoles={["Admin", "Secretary", "Manager", "Sales Rep", "Driver"]} element={<Collections />} />} />
                        <Route path="/cheques" element={<RoleProtectedRoute allowedRoles={["Admin", "Secretary", "Manager"]} element={<ChequeManagement />} />} />
                        <Route path="/issued-cheques" element={<RoleProtectedRoute allowedRoles={["Admin", "Secretary", "Manager"]} element={<IssuedCheques />} />} />
                        <Route path="/partner-investment" element={<RoleProtectedRoute allowedRoles={["Admin"]} element={<PartnerInvestment />} />} />
                        <Route path="/assets" element={<RoleProtectedRoute allowedRoles={["Admin","Secretary","Manager"]} element={<Assets />} />} />
                        <Route path="/drivers" element={<Drivers />} />
                        <Route path="/expenses" element={<RoleProtectedRoute allowedRoles={["Admin", "Secretary", "Manager"]} element={<Expenses />} />} />

                        <Route path="/my-location" element={<RoleProtectedRoute allowedRoles={["Sales Rep", "Driver"]} element={<MyLocation />} />} />
                        <Route path="/daily-targets" element={<RoleProtectedRoute allowedRoles={["Admin", "Secretary", "Manager"]} element={<DailyTargets />} />} />
                        <Route path="/map" element={<Map />} />
                        
                        {/* Accounting System removed from app routes */}
                        
                        <Route path="/users" element={<UserManagement />} />
                        <Route path="/settings" element={<Settings />} />
                        {/* Redirect any other nested routes to dashboard */}
                        <Route path="*" element={<Navigate to="/" />} />
                    </Routes>
                </main>
            </div>
        </div>
    );
};


function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <DataProvider>
          <HashRouter>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/*" element={<ProtectedRoute />} />
              </Routes>
          </HashRouter>
        </DataProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;