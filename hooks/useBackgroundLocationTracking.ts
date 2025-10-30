import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import { UserRole } from '../types';

export const useBackgroundLocationTracking = () => {
  const { currentUser, updateUser } = useAuth();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isTrackingRef = useRef<boolean>(false);
  const lastUpdateRef = useRef<Date | null>(null);

  // Update location in database
  const updateLocationInDB = useCallback(async (location: { latitude: number; longitude: number; timestamp: string; accuracy?: number }) => {
    if (!currentUser) return;

    try {
      console.log(`📍 [${new Date().toLocaleTimeString()}] Auto-updating location for ${currentUser.name}:`, location);
      
      const { error } = await supabase
        .from('users')
        .update({
          currentlocation: location,
          lastlogin: new Date().toISOString(),
          locationsharing: true // Ensure sharing is enabled
        })
        .eq('id', currentUser.id);

      if (error) {
        console.error('❌ Auto location update failed:', error);
        return false;
      }

      console.log('✅ Auto location updated successfully');
      
      // Update local user state
      updateUser({
        ...currentUser,
        currentLocation: location,
        lastLogin: new Date().toISOString(),
        locationSharing: true
      });

      // Update last update time
      lastUpdateRef.current = new Date();

      return true;
    } catch (err) {
      console.error('💥 Unexpected error in auto location update:', err);
      return false;
    }
  }, [currentUser, updateUser]);

  // Get current position
  const getCurrentPosition = useCallback((): Promise<{ latitude: number; longitude: number; timestamp: string; accuracy?: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        console.error('❌ Geolocation not supported');
        resolve(null);
        return;
      }

      const options: PositionOptions = {
        enableHighAccuracy: true,
        timeout: 15000, // 15 seconds timeout
        maximumAge: 300000 // Accept 5-minute old location
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            timestamp: new Date().toISOString(),
            accuracy: position.coords.accuracy
          };
          resolve(location);
        },
        (error) => {
          console.error('📍 Auto location capture failed:', error.message);
          resolve(null);
        },
        options
      );
    });
  }, []);

  // Auto location update function
  const performAutoLocationUpdate = useCallback(async () => {
    if (!currentUser || !isTrackingRef.current) return;

    // Only for Sales Reps and Drivers
    if (currentUser.role !== UserRole.Sales && currentUser.role !== UserRole.Driver) {
      return;
    }

    console.log(`🔄 [${new Date().toLocaleTimeString()}] Performing auto location update for ${currentUser.name}`);

    try {
      const location = await getCurrentPosition();
      if (location) {
        await updateLocationInDB(location);
      }
    } catch (error) {
      console.error('💥 Auto location update error:', error);
    }
  }, [currentUser, getCurrentPosition, updateLocationInDB]);

  // Restart interval (used when manual update resets the timer)
  const restartInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    intervalRef.current = setInterval(() => {
      performAutoLocationUpdate();
    }, 5 * 60 * 1000); // 5 minutes = 5 * 60 * 1000 milliseconds
  }, [performAutoLocationUpdate]);

  // Start automatic location tracking
  const startAutoTracking = useCallback(() => {
    if (!currentUser) return;

    // Only start for Sales Reps and Drivers
    if (currentUser.role !== UserRole.Sales && currentUser.role !== UserRole.Driver) {
      return;
    }

    if (isTrackingRef.current || intervalRef.current) {
      console.log('🔄 Auto tracking already running');
      return;
    }

    console.log(`🚀 Starting auto location tracking for ${currentUser.name} (${currentUser.role})`);
    isTrackingRef.current = true;

    // Immediate first update
    performAutoLocationUpdate();

    // Set up 5-minute interval
    restartInterval();

    console.log('⏰ Auto location updates scheduled every 5 minutes');
  }, [currentUser, performAutoLocationUpdate, restartInterval]);

  // Stop automatic location tracking
  const stopAutoTracking = useCallback(() => {
    console.log('🛑 Stopping auto location tracking');
    isTrackingRef.current = false;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Disable location sharing in database
    if (currentUser) {
      supabase
        .from('users')
        .update({ locationsharing: false })
        .eq('id', currentUser.id)
        .then(({ error }) => {
          if (error) {
            console.error('❌ Error disabling location sharing:', error);
          } else {
            console.log('✅ Location sharing disabled');
          }
        });
    }
  }, [currentUser]);

  // Auto-start tracking when user logs in (if they're field staff)
  useEffect(() => {
    if (currentUser && (currentUser.role === UserRole.Sales || currentUser.role === UserRole.Driver)) {
      // Small delay to ensure everything is loaded
      const timer = setTimeout(() => {
        console.log(`👤 Field staff logged in: ${currentUser.name} (${currentUser.role})`);
        startAutoTracking();
      }, 2000); // 2 second delay

      return () => clearTimeout(timer);
    }
  }, [currentUser, startAutoTracking]);

  // Cleanup on unmount or user logout
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Also cleanup when user changes or logs out
  useEffect(() => {
    if (!currentUser) {
      stopAutoTracking();
    }
  }, [currentUser, stopAutoTracking]);

  // Manual update with timer reset
  const performManualUpdateWithReset = useCallback(async () => {
    await performAutoLocationUpdate();
    if (isTrackingRef.current) {
      console.log('🔄 Manual update completed, restarting 5-minute timer');
      restartInterval();
    }
  }, [performAutoLocationUpdate, restartInterval]);

  return {
    startAutoTracking,
    stopAutoTracking,
    isAutoTracking: isTrackingRef.current,
    performManualUpdate: performManualUpdateWithReset,
    lastUpdate: lastUpdateRef.current
  };
};