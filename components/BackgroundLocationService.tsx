import React, { useState, useEffect } from 'react';
import { useBackgroundLocationTracking } from '../hooks/useBackgroundLocationTracking';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';

export const BackgroundLocationService: React.FC = () => {
  const { currentUser } = useAuth();
  const { 
    startAutoTracking, 
    stopAutoTracking, 
    isAutoTracking, 
    performManualUpdate 
  } = useBackgroundLocationTracking();
  
  const [nextUpdate, setNextUpdate] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState<string>('5:00');
  const [isMinimized, setIsMinimized] = useState(false);

  // Update countdown every second
  useEffect(() => {
    if (!isAutoTracking || !nextUpdate) return;

    const interval = setInterval(() => {
      const now = new Date();
      const diff = nextUpdate.getTime() - now.getTime();
      
      if (diff <= 0) {
        setCountdown('Updating...');
        // Set next update time (5 minutes from now)
        setNextUpdate(new Date(Date.now() + 5 * 60 * 1000));
        return;
      }
      
      const minutes = Math.floor(diff / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setCountdown(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [isAutoTracking, nextUpdate]);

  // Set initial next update time when tracking starts
  useEffect(() => {
    if (isAutoTracking && !nextUpdate) {
      setNextUpdate(new Date(Date.now() + 5 * 60 * 1000));
    } else if (!isAutoTracking) {
      setNextUpdate(null);
      setCountdown('5:00');
    }
  }, [isAutoTracking, nextUpdate]);

  // Only show for field staff
  if (!currentUser || (currentUser.role !== UserRole.Sales && currentUser.role !== UserRole.Driver)) {
    return null;
  }

  return (
    <div className={`fixed bottom-4 right-4 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg shadow-lg z-50 transition-all duration-300 ${
      isMinimized ? 'w-12 h-12' : 'max-w-xs p-3'
    }`}>
      
      {/* Minimized view */}
      {isMinimized ? (
        <div 
          className="w-full h-full flex items-center justify-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg"
          onClick={() => setIsMinimized(false)}
        >
          <div className={`w-3 h-3 rounded-full ${isAutoTracking ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`}></div>
        </div>
      ) : (
        /* Expanded view */
        <>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isAutoTracking ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`}></div>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                📍 Auto Tracking
              </span>
            </div>
            <button
              onClick={() => setIsMinimized(true)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xs"
            >
              ➖
            </button>
          </div>
          
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
            {isAutoTracking ? (
              <>
                <div>✅ Active (Every 5 minutes)</div>
                <div>🔄 Next update: <span className="font-mono">{countdown}</span></div>
              </>
            ) : (
              <div>⏹️ Location sharing paused</div>
            )}
          </div>
          
          <div className="flex gap-1">
            {!isAutoTracking ? (
              <button
                onClick={() => {
                  startAutoTracking();
                  setNextUpdate(new Date(Date.now() + 5 * 60 * 1000));
                }}
                className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
              >
                ▶️ Start
              </button>
            ) : (
              <button
                onClick={stopAutoTracking}
                className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
              >
                ⏹️ Stop
              </button>
            )}
            
            <button
              onClick={() => {
                performManualUpdate();
                setNextUpdate(new Date(Date.now() + 5 * 60 * 1000));
              }}
              className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              disabled={!isAutoTracking}
            >
              📡 Now
            </button>
          </div>
        </>
      )}
    </div>
  );
};