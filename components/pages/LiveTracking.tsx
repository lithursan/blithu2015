import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { UserRole } from '../../types';

export const LiveTracking: React.FC = () => {
  const { currentUser } = useAuth();

  // Check if user has permission to view live tracking
  const canViewTracking = currentUser && (
    currentUser.role === UserRole.Admin || 
    currentUser.role === UserRole.Manager
  );

  if (!canViewTracking) {
    return (
      <div className="p-8 text-center">
        <div className="max-w-md mx-auto">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
            Access Denied
          </h2>
          <p className="text-slate-600 dark:text-slate-400">
            You need Admin or Manager privileges to access live location tracking.
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
            🗺️ Live Location Tracking
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2">
            Monitor real-time locations of sales representatives and drivers
          </p>
        </div>
        
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span>Live Tracking Active</span>
        </div>
      </div>

      {/* Store Location Info */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-700 rounded-lg p-6 border border-blue-200 dark:border-slate-600">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
            <span className="text-white text-xl">🏢</span>
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">
              Distribution Center
            </h3>
            <p className="text-slate-600 dark:text-slate-400">
              📍 Coordinates: 9.384489°N, 80.408737°E
            </p>
            <button
              onClick={() => window.open('https://www.google.com/maps?q=9.384489,80.408737', '_blank')}
              className="mt-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 text-sm underline"
            >
              🗺️ View Store Location on Map
            </button>
          </div>
        </div>
      </div>

      {/* Feature Coming Soon */}
      <div className="text-center py-12">
        <div className="text-6xl mb-4">�</div>
        <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
          Live Tracking Feature
        </h3>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          This feature will be available soon for monitoring field staff locations in real-time.
        </p>
        <div className="text-sm text-slate-500 dark:text-slate-400">
          Coming features: Real-time GPS tracking, Route optimization, Distance calculations
        </div>
      </div>
    </div>
  );
};