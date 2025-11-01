import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { UserRole } from '../../types';

export const MyLocation: React.FC = () => {
  const { currentUser } = useAuth();

  // Check if user is field staff (Sales Rep or Driver)
  const isFieldStaff = currentUser && (
    currentUser.role === UserRole.Sales || 
    currentUser.role === UserRole.Driver
  );

  if (!isFieldStaff) {
    return (
      <div className="p-8 text-center">
        <div className="max-w-md mx-auto">
          <div className="text-6xl mb-4">🚫</div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
            Access Denied
          </h2>
          <p className="text-slate-600 dark:text-slate-400">
            This page is for field staff (Sales Representatives and Drivers) only.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
            📍 My Location Sharing
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2">
            Share your location with managers for better coordination
          </p>
        </div>
        
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
          <span>GPS Active</span>
        </div>
      </div>

      {/* Location Sharing Info */}
      <div className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-slate-800 dark:to-slate-700 rounded-lg p-6 border border-green-200 dark:border-slate-600">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center">
            <span className="text-white text-xl">📱</span>
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">
              Location Sharing Benefits
            </h3>
            <ul className="text-sm text-slate-600 dark:text-slate-400 mt-2 space-y-1">
              <li>• Better coordination with managers</li>
              <li>• Faster emergency assistance if needed</li>
              <li>• Optimized route planning and delivery scheduling</li>
              <li>• Real-time support for customer visits</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Feature Coming Soon */}
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🚧</div>
        <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
          Location Sharing Feature
        </h3>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          This feature will be available soon to help you share your location with managers for better coordination.
        </p>
        <div className="text-sm text-slate-500 dark:text-slate-400">
          Coming features: GPS location sharing, Battery optimization, Privacy controls
        </div>
      </div>
    </div>
  );
};