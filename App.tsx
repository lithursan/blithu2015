import React, { useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { Dashboard } from './components/pages/Dashboard';
import { Products } from './components/pages/Products';
import { Orders } from './components/pages/Orders';
import { Deliveries } from './components/pages/Deliveries';
import { Customers } from './components/pages/Customers';
import { UserManagement } from './components/pages/UserManagement';
import { Settings } from './components/pages/Settings';
import { Login } from './components/pages/Login';
import { Drivers } from './components/pages/Drivers';
import { Suppliers } from './components/pages/Suppliers';
import { Collections } from './components/pages/Collections';
import Expenses from './components/pages/Expenses';
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

    return (
        <div className="flex h-screen bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200">
            <Sidebar isSidebarOpen={isSidebarOpen} closeSidebar={closeSidebar} />
            <div className="flex flex-col flex-1 overflow-y-auto">
                <Header toggleSidebar={toggleSidebar} />
                <main>
                    <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/products" element={<Products />} />
                        <Route path="/orders" element={<Orders />} />
                        <Route path="/deliveries" element={<RoleProtectedRoute allowedRoles={["Admin", "Manager"]} element={<Deliveries />} />} />
                        <Route path="/customers" element={<Customers />} />
                        <Route path="/suppliers" element={<Suppliers />} />
                        <Route path="/collections" element={<Collections />} />
                        <Route path="/drivers" element={<Drivers />} />
                        <Route path="/expenses" element={<RoleProtectedRoute allowedRoles={["Admin", "Manager"]} element={<Expenses />} />} />
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