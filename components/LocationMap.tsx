import React from 'react';
import { User } from '../types';

interface LocationMapProps {
  users: User[];
  storeLocation: { latitude: number; longitude: number };
  onUserClick?: (user: User) => void;
}

export const LocationMap: React.FC<LocationMapProps> = ({ users, storeLocation, onUserClick }) => {
  // Calculate map bounds to include all locations
  const allLocations = users
    .filter(user => user.currentLocation)
    .map(user => user.currentLocation!);
  
  allLocations.push(storeLocation);

  const bounds = allLocations.reduce(
    (acc, location) => ({
      minLat: Math.min(acc.minLat, location.latitude),
      maxLat: Math.max(acc.maxLat, location.latitude),
      minLng: Math.min(acc.minLng, location.longitude),
      maxLng: Math.max(acc.maxLng, location.longitude),
    }),
    {
      minLat: storeLocation.latitude,
      maxLat: storeLocation.latitude,
      minLng: storeLocation.longitude,
      maxLng: storeLocation.longitude,
    }
  );

  // Add padding to bounds
  const padding = 0.01; // Approximately 1km
  const mapBounds = {
    minLat: bounds.minLat - padding,
    maxLat: bounds.maxLat + padding,
    minLng: bounds.minLng - padding,
    maxLng: bounds.maxLng + padding,
  };

  // Convert lat/lng to pixel coordinates for SVG
  const latLngToPixel = (lat: number, lng: number, width: number, height: number) => {
    const x = ((lng - mapBounds.minLng) / (mapBounds.maxLng - mapBounds.minLng)) * width;
    const y = height - ((lat - mapBounds.minLat) / (mapBounds.maxLat - mapBounds.minLat)) * height;
    return { x, y };
  };

  const mapWidth = 600;
  const mapHeight = 400;

  // Generate Google Maps URL for all locations
  const openInGoogleMaps = () => {
    const locationStrings = users
      .filter(user => user.currentLocation)
      .map(user => `${user.currentLocation!.latitude},${user.currentLocation!.longitude}`)
      .join('/');
    
    const storeLocationString = `${storeLocation.latitude},${storeLocation.longitude}`;
    const url = locationStrings 
      ? `https://www.google.com/maps/dir/${storeLocationString}/${locationStrings}`
      : `https://www.google.com/maps?q=${storeLocationString}`;
    
    window.open(url, '_blank');
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          📍 Location Map View
        </h3>
        <div className="flex gap-2">
          <button
            onClick={openInGoogleMaps}
            className="px-3 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
          >
            🗺️ Open in Google Maps
          </button>
        </div>
      </div>

      <div className="relative">
        <svg
          width="100%"
          height="400"
          viewBox={`0 0 ${mapWidth} ${mapHeight}`}
          className="border border-slate-300 dark:border-slate-600 rounded-lg bg-gradient-to-br from-blue-50 to-green-50 dark:from-slate-900 dark:to-slate-800"
        >
          {/* Grid lines */}
          <defs>
            <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e2e8f0" strokeWidth="1" opacity="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* Store location (main hub) */}
          {(() => {
            const storePixel = latLngToPixel(storeLocation.latitude, storeLocation.longitude, mapWidth, mapHeight);
            return (
              <g>
                {/* Store location circle */}
                <circle
                  cx={storePixel.x}
                  cy={storePixel.y}
                  r="20"
                  fill="#3b82f6"
                  stroke="#1e40af"
                  strokeWidth="3"
                  className="drop-shadow-lg"
                />
                {/* Store icon */}
                <text
                  x={storePixel.x}
                  y={storePixel.y + 5}
                  textAnchor="middle"
                  fontSize="16"
                  fill="white"
                >
                  🏢
                </text>
                {/* Store label */}
                <text
                  x={storePixel.x}
                  y={storePixel.y + 35}
                  textAnchor="middle"
                  fontSize="12"
                  fill="#1e40af"
                  fontWeight="bold"
                >
                  Distribution Center
                </text>
              </g>
            );
          })()}

          {/* Field staff locations */}
          {users.filter(user => user.currentLocation).map((user, index) => {
            const userPixel = latLngToPixel(user.currentLocation!.latitude, user.currentLocation!.longitude, mapWidth, mapHeight);
            const isDriver = user.role === 'Driver';
            const color = isDriver ? '#f59e0b' : '#10b981'; // Orange for drivers, green for sales reps
            const darkColor = isDriver ? '#d97706' : '#059669';
            
            return (
              <g key={user.id}>
                {/* Connection line to store */}
                <line
                  x1={latLngToPixel(storeLocation.latitude, storeLocation.longitude, mapWidth, mapHeight).x}
                  y1={latLngToPixel(storeLocation.latitude, storeLocation.longitude, mapWidth, mapHeight).y}
                  x2={userPixel.x}
                  y2={userPixel.y}
                  stroke="#94a3b8"
                  strokeWidth="1"
                  strokeDasharray="3,3"
                  opacity="0.6"
                />
                
                {/* User location circle */}
                <circle
                  cx={userPixel.x}
                  cy={userPixel.y}
                  r="15"
                  fill={color}
                  stroke={darkColor}
                  strokeWidth="2"
                  className="cursor-pointer hover:opacity-80 transition-opacity drop-shadow-md"
                  onClick={() => onUserClick?.(user)}
                />
                
                {/* User role icon */}
                <text
                  x={userPixel.x}
                  y={userPixel.y + 4}
                  textAnchor="middle"
                  fontSize="12"
                  fill="white"
                  className="pointer-events-none"
                >
                  {isDriver ? '🚚' : '👤'}
                </text>
                
                {/* User name label */}
                <text
                  x={userPixel.x}
                  y={userPixel.y + 30}
                  textAnchor="middle"
                  fontSize="10"
                  fill={darkColor}
                  fontWeight="bold"
                  className="pointer-events-none"
                >
                  {user.name}
                </text>
                
                {/* Distance from store */}
                <text
                  x={userPixel.x}
                  y={userPixel.y + 42}
                  textAnchor="middle"
                  fontSize="8"
                  fill="#64748b"
                  className="pointer-events-none"
                >
                  {(() => {
                    // Calculate distance using Haversine formula
                    const R = 6371; // Earth's radius in kilometers
                    const dLat = (user.currentLocation!.latitude - storeLocation.latitude) * Math.PI / 180;
                    const dLng = (user.currentLocation!.longitude - storeLocation.longitude) * Math.PI / 180;
                    const a = 
                      Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(storeLocation.latitude * Math.PI / 180) * Math.cos(user.currentLocation!.latitude * Math.PI / 180) * 
                      Math.sin(dLng/2) * Math.sin(dLng/2);
                    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                    const distance = R * c;
                    return `${distance.toFixed(1)} km`;
                  })()}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Map legend */}
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-600 rounded-full"></div>
            <span className="text-slate-600 dark:text-slate-400">Distribution Center</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500 rounded-full"></div>
            <span className="text-slate-600 dark:text-slate-400">Sales Representatives</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-amber-500 rounded-full"></div>
            <span className="text-slate-600 dark:text-slate-400">Drivers</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 bg-slate-400 opacity-60" style={{borderTop: '1px dashed #94a3b8'}}></div>
            <span className="text-slate-600 dark:text-slate-400">Connection Lines</span>
          </div>
        </div>

        {/* Map info */}
        <div className="mt-4 p-3 bg-blue-50 dark:bg-slate-700 rounded-lg">
          <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200">
            <span>ℹ️</span>
            <span className="font-medium">Map Information:</span>
          </div>
          <div className="text-sm text-blue-700 dark:text-blue-300 mt-1 grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>• Click on user markers for more details</div>
            <div>• Dashed lines show connection to store</div>
            <div>• Distances calculated from store location</div>
            <div>• Real-time updates every 30 seconds</div>
          </div>
        </div>

        {/* No locations message */}
        {users.filter(user => user.currentLocation).length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-800/80 rounded-lg">
            <div className="text-center">
              <div className="text-4xl mb-2">📍</div>
              <p className="text-slate-500 dark:text-slate-400 font-medium">
                No active locations to display
              </p>
              <p className="text-sm text-slate-400">
                Field staff need to enable location sharing
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};