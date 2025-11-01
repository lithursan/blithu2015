import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';

interface LocationTrackerProps {
  onLocationUpdate?: (location: { latitude: number; longitude: number; timestamp: string; accuracy?: number }) => void;
}

export const LocationTracker: React.FC<LocationTrackerProps> = ({ onLocationUpdate }) => {
  const { currentUser, updateUser } = useAuth();
  const [isTracking, setIsTracking] = useState(false);
  const [lastLocation, setLastLocation] = useState<{ latitude: number; longitude: number; timestamp: string } | null>(null);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Update location in database
  const updateLocationInDB = useCallback(async (location: { latitude: number; longitude: number; timestamp: string; accuracy?: number }) => {
    if (!currentUser) {
      console.error('No current user for location update');
      return;
    }

    try {
      console.log('Updating location in DB for user:', currentUser.id, location);
      
      const { error } = await supabase
        .from('users')
        .update({
          currentlocation: location,
          lastlogin: new Date().toISOString() // Update last seen
        })
        .eq('id', currentUser.id);

      if (error) {
        console.error('Error updating location:', error);
        if (error.message.includes('currentlocation')) {
          setLocationError('Database missing location columns. Please run the database migration.');
        } else {
          setLocationError(`DB Error: ${error.message}`);
        }
        return;
      }

      console.log('Location updated successfully in database');

      // Update local user state
      updateUser({
        ...currentUser,
        currentLocation: location,
        lastLogin: new Date().toISOString()
      });

      setLastLocation(location);
      onLocationUpdate?.(location);

    } catch (err) {
      console.error('Unexpected error updating location:', err);
    }
  }, [currentUser, updateUser, onLocationUpdate]);

  // Get current position
  const getCurrentPosition = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported');
      return;
    }

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000 // 1 minute
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: new Date().toISOString(),
          accuracy: position.coords.accuracy
        };
        updateLocationInDB(location);
        setLocationError(null);
      },
      (error) => {
        console.error('Location error:', error);
        setLocationError(error.message);
      },
      options
    );
  }, [updateLocationInDB]);

  // Start tracking location
  const startTracking = useCallback(() => {
    if (!navigator.geolocation || isTracking) return;

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000 // 30 seconds
    };

    const id = navigator.geolocation.watchPosition(
      (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: new Date().toISOString(),
          accuracy: position.coords.accuracy
        };
        updateLocationInDB(location);
        setLocationError(null);
      },
      (error) => {
        console.error('Location tracking error:', error);
        setLocationError(error.message);
      },
      options
    );

    setWatchId(id);
    setIsTracking(true);

    // Also update location sharing status in DB
    if (currentUser) {
      console.log('Enabling location sharing for user:', currentUser.id);
      supabase
        .from('users')
        .update({ locationsharing: true })
        .eq('id', currentUser.id)
        .then(({ error }) => {
          if (error) {
            console.error('Error enabling location sharing:', error);
            if (error.message.includes('locationsharing')) {
              setLocationError('Database missing location columns. Please run the database migration.');
            } else {
              setLocationError(`Sharing Error: ${error.message}`);
            }
          } else {
            console.log('Location sharing enabled successfully');
            updateUser({
              ...currentUser,
              locationSharing: true
            });
          }
        });
    }
  }, [isTracking, updateLocationInDB, currentUser, updateUser]);

  // Stop tracking location
  const stopTracking = useCallback(() => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
    setIsTracking(false);

    // Update location sharing status in DB
    if (currentUser) {
      console.log('Disabling location sharing for user:', currentUser.id);
      supabase
        .from('users')
        .update({ locationsharing: false })
        .eq('id', currentUser.id)
        .then(({ error }) => {
          if (error) {
            console.error('Error disabling location sharing:', error);
            setLocationError(`Sharing Error: ${error.message}`);
          } else {
            console.log('Location sharing disabled successfully');
            updateUser({
              ...currentUser,
              locationSharing: false
            });
          }
        });
    }
  }, [watchId, currentUser, updateUser]);

  // Auto-start tracking for sales reps and drivers
  useEffect(() => {
    if (currentUser && (currentUser.role === 'Sales Rep' || currentUser.role === 'Driver')) {
      if (currentUser.locationSharing && !isTracking) {
        startTracking();
      }
    }
    
    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [currentUser, startTracking, isTracking, watchId]);

  // Only show for sales reps and drivers
  if (!currentUser || (currentUser.role !== 'Sales Rep' && currentUser.role !== 'Driver')) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isTracking ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`}></div>
          <div>
            <h3 className="font-medium text-slate-900 dark:text-slate-100">
              📍 Location Tracking
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {isTracking ? 'Sharing live location' : 'Location sharing disabled'}
            </p>
            {lastLocation && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Last updated: {new Date(lastLocation.timestamp).toLocaleTimeString()}
              </p>
            )}
            {locationError && (
              <p className="text-xs text-red-500">
                Error: {locationError}
              </p>
            )}
          </div>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={getCurrentPosition}
            className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            disabled={isTracking}
          >
            📡 Update Now
          </button>
          
          {isTracking ? (
            <button
              onClick={stopTracking}
              className="px-3 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            >
              🛑 Stop Sharing
            </button>
          ) : (
            <button
              onClick={startTracking}
              className="px-3 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            >
              ▶️ Start Sharing
            </button>
          )}
        </div>
      </div>
      
      {lastLocation && (
        <div className="mt-3 p-2 bg-slate-50 dark:bg-slate-700 rounded text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="font-medium">Latitude:</span> {lastLocation.latitude.toFixed(6)}
            </div>
            <div>
              <span className="font-medium">Longitude:</span> {lastLocation.longitude.toFixed(6)}
            </div>
          </div>
          <button
            onClick={() => window.open(`https://www.google.com/maps?q=${lastLocation.latitude},${lastLocation.longitude}`, '_blank')}
            className="mt-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 underline"
          >
            🗺️ View on Map
          </button>
        </div>
      )}
    </div>
  );
};