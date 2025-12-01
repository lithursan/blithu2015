import React, { useState, useEffect, useMemo } from 'react';
import { User, UserRole } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/Card';
import { Badge } from './ui/Badge';
import { useData } from '../contexts/DataContext';
import { supabase } from '../supabaseClient';
import { debugLocationTracking } from '../utils/debugLocationTracking';
import { addDemoLocationData, clearLocationData } from '../utils/demoLocationData';
import { LocationMap } from './LocationMap';

export const LiveLocationMap: React.FC = () => {
  const { users, refetchData } = useData();
  const [locationData, setLocationData] = useState<Record<string, User>>({});
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showAllLogins, setShowAllLogins] = useState<boolean>(false);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'map'>('table');
  
  // Store location coordinates
  const STORE_LOCATION = { latitude: 9.384489, longitude: 80.408737 };

  // Filter users to show on map
  const trackableUsers = useMemo(() => {
    if (showAllLogins) {
      // Show any user that has a currentLocation or a recent lastLogin (considered 'logged in')
      return users.filter(user => (user.currentLocation) || (user.lastLogin));
    }
    return users.filter(user => 
      (user.role === UserRole.Sales || user.role === UserRole.Driver) &&
      user.locationSharing &&
      user.currentLocation
    );
  }, [users, showAllLogins]);

  // Calculate distance between two coordinates
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Calculate distance from store
  const getDistanceFromStore = (user: User): number => {
    if (!user.currentLocation) return 0;
    const STORE_LAT = 9.384489;
    const STORE_LNG = 80.408737;
    return calculateDistance(
      STORE_LAT, STORE_LNG,
      user.currentLocation.latitude,
      user.currentLocation.longitude
    );
  };

  // Get time since last location update
  const getTimeSinceUpdate = (timestamp: string): string => {
    const now = new Date();
    const lastUpdate = new Date(timestamp);
    const diffMs = now.getTime() - lastUpdate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins === 1) return '1 minute ago';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) return '1 hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;
    
    return lastUpdate.toLocaleDateString();
  };

  // Fetch latest location data
  const refreshLocationData = async () => {
    try {
      setDebugInfo('Fetching location data...');
      let query = supabase.from('users').select('*');
      if (!showAllLogins) {
        // keep previous behavior: only Sales Rep and Driver
        query = query.in('role', ['Sales Rep', 'Driver']);
      }

      const { data: userData, error } = await query;

      if (error) {
        console.error('Error fetching location data:', error);
        if (error.message.includes('currentlocation') || error.message.includes('locationsharing')) {
          setDebugInfo('Database missing location columns - migration needed!');
        } else {
          setDebugInfo(`Error: ${error.message}`);
        }
        return;
      }

      setDebugInfo(`Found ${userData?.length || 0} field staff users`);
      console.log('All field staff users:', userData);

      const locationMap: Record<string, User> = {};
      const sharingCount = userData?.filter(u => u.locationsharing).length || 0;
      const locationCount = userData?.filter(u => u.currentlocation).length || 0;
      
      setDebugInfo(`Sharing: ${sharingCount}, With location: ${locationCount}`);
      
      userData?.forEach(user => {
        console.log(`User ${user.name}: sharing=${user.locationsharing}, location=`, user.currentlocation);
        locationMap[user.id] = {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role as UserRole,
          status: user.status,
          avatarUrl: user.avatarurl,
          lastLogin: user.lastlogin,
          settings: user.settings,
          assignedSupplierNames: user.assignedsuppliernames,
          currentLocation: user.currentlocation,
          locationSharing: user.locationsharing
        };
      });

      setLocationData(locationMap);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Error refreshing location data:', err);
      setDebugInfo(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Auto-refresh location data
  useEffect(() => {
    if (autoRefresh) {
      refreshLocationData();
      const interval = setInterval(refreshLocationData, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  // When showAllLogins changes, immediately refresh data
  useEffect(() => {
    refreshLocationData();
  }, [showAllLogins]);

  // Real-time subscription for location updates
  useEffect(() => {
    // Subscribe to user updates. If showing all logins, subscribe broadly; otherwise only location sharing updates.
    const channel = supabase.channel('location_updates');
    if (showAllLogins) {
      channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users' }, (payload) => {
        console.log('Location/user update received (all):', payload);
        refreshLocationData();
      });
    } else {
      channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users', filter: 'locationsharing=eq.true' }, (payload) => {
        console.log('Location update received:', payload);
        refreshLocationData();
      });
    }

    channel.subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch (e) { console.warn('Failed to remove channel', e); }
    };
  }, [showAllLogins]);

  // Open all locations in Google Maps
  const openInGoogleMaps = () => {
    const locations = trackableUsers
      .filter(user => user.currentLocation)
      .map(user => `${user.currentLocation!.latitude},${user.currentLocation!.longitude}`)
      .join('/');
    
    if (locations) {
      const url = `https://www.google.com/maps/dir/9.384489,80.408737/${locations}`;
      window.open(url, '_blank');
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                🗺️ Live Location Tracking
                <Badge variant={autoRefresh ? 'success' : 'secondary'}>
                  {autoRefresh ? 'Live' : 'Paused'}
                </Badge>
              </CardTitle>
              <CardDescription>
                Real-time location tracking for sales reps and drivers
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {/* Toggle to show all logged-in users (not only field staff) */}
              <div className="flex items-center px-2">
                <label className="text-sm mr-2">All Logins</label>
                <button
                  onClick={() => setShowAllLogins(!showAllLogins)}
                  className={`px-2 py-1 text-sm rounded ${showAllLogins ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'}`}
                  title="Toggle showing all logged-in users on the map"
                >
                  {showAllLogins ? 'ON' : 'OFF'}
                </button>
              </div>
              {/* View Mode Toggle */}
              <div className="flex bg-slate-200 dark:bg-slate-700 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-3 py-1 text-sm rounded transition-colors ${
                    viewMode === 'table'
                      ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  📊 Table
                </button>
                <button
                  onClick={() => setViewMode('map')}
                  className={`px-3 py-1 text-sm rounded transition-colors ${
                    viewMode === 'map'
                      ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  🗺️ Map
                </button>
              </div>
              
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                  autoRefresh
                    ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {autoRefresh ? '⏸️ Pause' : '▶️ Resume'}
              </button>
              <button
                onClick={refreshLocationData}
                className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                🔄 Refresh
              </button>
              {trackableUsers.length > 0 && (
                <button
                  onClick={openInGoogleMaps}
                  className="px-3 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                >
                  🗺️ Open Google Maps
                </button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 text-sm text-slate-600 dark:text-slate-400">
            Last updated: {lastUpdate.toLocaleTimeString()} • 
            Active users: {trackableUsers.length} • 
            Auto-refresh: {autoRefresh ? 'ON' : 'OFF'}
            {debugInfo && (
              <>
                <br />
                <span className="text-xs bg-yellow-100 dark:bg-yellow-900 px-2 py-1 rounded">
                  Debug: {debugInfo}
                </span>
              </>
            )}
          </div>

          {/* Debug Controls */}
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              onClick={debugLocationTracking}
              className="px-2 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
            >
              🐛 Debug
            </button>
            <button
              onClick={() => console.log('Current users data:', users)}
              className="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
            >
              📋 Log Users
            </button>
            <button
              onClick={async () => {
                const success = await addDemoLocationData();
                if (success) {
                  setTimeout(() => refreshLocationData(), 1000);
                }
              }}
              className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
            >
              🎯 Add Demo Data
            </button>
            <button
              onClick={async () => {
                const success = await clearLocationData();
                if (success) {
                  setTimeout(() => refreshLocationData(), 1000);
                }
              }}
              className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
            >
              🧹 Clear Data
            </button>
          </div>

          {trackableUsers.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-slate-400 mb-2">📍</div>
              <p className="text-slate-500 dark:text-slate-400">
                No active location sharing found
              </p>
              <p className="text-sm text-slate-400">
                Sales reps and drivers can enable location sharing from their dashboard
              </p>
            </div>
          ) : viewMode === 'table' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-400">
                  <tr>
                    <th className="px-6 py-3">User</th>
                    <th className="px-6 py-3">Role</th>
                    <th className="px-6 py-3">Location</th>
                    <th className="px-6 py-3">Distance from Store</th>
                    <th className="px-6 py-3">Last Update</th>
                    <th className="px-6 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {trackableUsers.map((user) => {
                    const distance = getDistanceFromStore(user);
                    const isRecent = user.currentLocation && 
                      new Date().getTime() - new Date(user.currentLocation.timestamp).getTime() < 300000; // 5 minutes
                    
                    return (
                      <tr key={user.id} className="border-b dark:bg-slate-800 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600">
                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                          <div className="flex items-center gap-3">
                            <img 
                              src={user.avatarUrl} 
                              alt={user.name} 
                              className="w-10 h-10 rounded-full"
                            />
                            <div>
                              <div className="font-semibold">{user.name}</div>
                              <div className="text-sm text-slate-500">{user.phone}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={user.role === UserRole.Driver ? 'secondary' : 'default'}>
                            {user.role === UserRole.Driver ? '🚚' : '👤'} {user.role}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          {user.currentLocation ? (
                            <div className="text-xs">
                              <div>
                                {user.currentLocation.latitude.toFixed(4)}, {user.currentLocation.longitude.toFixed(4)}
                              </div>
                              {user.currentLocation.accuracy && (
                                <div className="text-slate-400">
                                  ±{Math.round(user.currentLocation.accuracy)}m accuracy
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">No location</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`font-medium ${distance < 1 ? 'text-green-600' : distance < 5 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {distance.toFixed(2)} km
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${isRecent ? 'bg-green-500' : 'bg-red-500'}`}></div>
                            <span className={isRecent ? 'text-green-600' : 'text-red-600'}>
                              {user.currentLocation ? getTimeSinceUpdate(user.currentLocation.timestamp) : 'Never'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-1">
                            {user.currentLocation && (
                              <>
                                <button
                                  onClick={() => window.open(
                                    `https://www.google.com/maps?q=${user.currentLocation!.latitude},${user.currentLocation!.longitude}`,
                                    '_blank'
                                  )}
                                  className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                                  title="View on map"
                                >
                                  🗺️
                                </button>
                                <button
                                  onClick={() => window.open(
                                    `https://www.google.com/maps/dir/9.384489,80.408737/${user.currentLocation!.latitude},${user.currentLocation!.longitude}`,
                                    '_blank'
                                  )}
                                  className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                                  title="Get directions"
                                >
                                  🧭
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Map View */
            <LocationMap 
              users={trackableUsers}
              storeLocation={STORE_LOCATION}
              onUserClick={setSelectedUser}
            />
          )}
        </CardContent>
      </Card>

      {/* Selected User Details Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedUser(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                {selectedUser.role === 'Driver' ? '🚚' : '👤'} {selectedUser.name}
              </h3>
              <button 
                onClick={() => setSelectedUser(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-3">
              <div>
                <span className="font-medium text-slate-700 dark:text-slate-300">Role:</span>
                <Badge variant={selectedUser.role === 'Driver' ? 'secondary' : 'default'} className="ml-2">
                  {selectedUser.role}
                </Badge>
              </div>
              
              <div>
                <span className="font-medium text-slate-700 dark:text-slate-300">Phone:</span>
                <span className="ml-2 text-slate-600 dark:text-slate-400">{selectedUser.phone}</span>
              </div>
              
              {selectedUser.currentLocation && (
                <>
                  <div>
                    <span className="font-medium text-slate-700 dark:text-slate-300">Location:</span>
                    <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                      <div>Lat: {selectedUser.currentLocation.latitude.toFixed(6)}</div>
                      <div>Lng: {selectedUser.currentLocation.longitude.toFixed(6)}</div>
                      {selectedUser.currentLocation.accuracy && (
                        <div>Accuracy: ±{Math.round(selectedUser.currentLocation.accuracy)}m</div>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <span className="font-medium text-slate-700 dark:text-slate-300">Distance from Store:</span>
                    <span className="ml-2 text-slate-600 dark:text-slate-400">
                      {getDistanceFromStore(selectedUser).toFixed(2)} km
                    </span>
                  </div>
                  
                  <div>
                    <span className="font-medium text-slate-700 dark:text-slate-300">Last Updated:</span>
                    <span className="ml-2 text-slate-600 dark:text-slate-400">
                      {getTimeSinceUpdate(selectedUser.currentLocation.timestamp)}
                    </span>
                  </div>
                </>
              )}
            </div>
            
            {selectedUser.currentLocation && (
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => window.open(
                    `https://www.google.com/maps?q=${selectedUser.currentLocation!.latitude},${selectedUser.currentLocation!.longitude}`,
                    '_blank'
                  )}
                  className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  🗺️ View on Map
                </button>
                <button
                  onClick={() => window.open(
                    `https://www.google.com/maps/dir/${STORE_LOCATION.latitude},${STORE_LOCATION.longitude}/${selectedUser.currentLocation!.latitude},${selectedUser.currentLocation!.longitude}`,
                    '_blank'
                  )}
                  className="px-3 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                >
                  🧭 Get Directions
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};