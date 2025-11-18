import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { exportToPDF } from '../../utils/pdfExport';

// Declare Google Maps types for TypeScript
declare global {
  interface Window {
    google: any;
    initMap: () => void;
  }
}

interface MapLocation {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  type: 'customer' | 'supplier' | 'delivery';
  details?: string;
  route?: string;
  pendingOrders?: string[]; // Array of pending order IDs
  pendingOrderCount?: number;
}

export const Map: React.FC = () => {
  const { customers, suppliers, orders } = useData();
  const { currentUser } = useAuth();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<MapLocation | null>(null);
  const [mapLocations, setMapLocations] = useState<MapLocation[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'customer' | 'supplier' | 'delivery'>('all');
  const [availableRoutes, setAvailableRoutes] = useState<string[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<string>('all');
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [optimizedRoute, setOptimizedRoute] = useState<any>(null);
  const [directionsRenderer, setDirectionsRenderer] = useState<any>(null);
  const [showOnlyPendingOrders, setShowOnlyPendingOrders] = useState(false);

  // Load Google Maps API
  useEffect(() => {
    const loadGoogleMaps = () => {
      if (window.google) {
        setIsMapLoaded(true);
        return;
      }

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=AIzaSyA66bhp8lk_Z2aA870Rcth8JFqU7ChbXLI&libraries=places,geometry&callback=initMap&v=weekly`;
      script.async = true;
      script.defer = true;
      
      // Add error handling
      script.onerror = () => {
        console.error('Failed to load Google Maps API');
      };
      
      window.initMap = () => {
        setIsMapLoaded(true);
      };

      document.head.appendChild(script);
    };

    loadGoogleMaps();
  }, []);

  // Process locations from customers and suppliers
  useEffect(() => {
    const locations: MapLocation[] = [];
    const routes = new Set<string>();

    console.log('🔍 Debug Map: Processing customers data:', customers.length, 'customers');
    console.log('🔍 Debug Map: Orders data:', orders.length, 'orders');

    // First, let's analyze all pending orders
    const allPendingOrders = orders.filter(order => 
      order.status === 'Pending' || order.status === 'Processing'
    );
    console.log('🔍 Debug Map: All pending orders:', allPendingOrders.length);
    allPendingOrders.forEach(order => {
      console.log(`📋 Pending Order: ${order.id} - Customer: ${order.customerName} (ID: ${order.customerId}) - Status: ${order.status}`);
    });

    let customersWithGPS = 0;
    let customersWithoutGPS = 0;
    let customersWithPendingAndGPS = 0;
    let customersWithPendingNoGPS = 0;

    // Add customer locations
    customers.forEach((customer, index) => {
      console.log(`🔍 Debug Customer ${index}:`, {
        name: customer.name,
        id: customer.id,
        route: customer.route,
        location: customer.location ? customer.location.substring(0, 50) + '...' : 'NO LOCATION'
      });

      // Find pending orders for this customer
      const pendingOrders = orders.filter(order => 
        order.customerId === customer.id && 
        (order.status === 'Pending' || order.status === 'Processing')
      );

      if (customer.location) {
        const gpsMatch = customer.location.match(/GPS:\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
        
        if (gpsMatch) {
          customersWithGPS++;
          if (pendingOrders.length > 0) {
            customersWithPendingAndGPS++;
          }
          
          const [, lat, lng] = gpsMatch;
          const customerRoute = customer.route || 'Unassigned';
          routes.add(customerRoute);
          
          console.log(`✅ Adding customer location: ${customer.name} - Route: ${customerRoute} - Pending Orders: ${pendingOrders.length}`);
          if (pendingOrders.length > 0) {
            console.log(`📍 Customer ${customer.name} has ${pendingOrders.length} pending orders:`, pendingOrders.map(o => `${o.id} (${o.status})`));
          }
          
          const pendingOrderIds = pendingOrders.map(order => order.id);
          const pendingOrderDetails = pendingOrders.length > 0 
            ? `Pending Orders: ${pendingOrderIds.join(', ')}` 
            : 'No pending orders';
          
          locations.push({
            id: `customer-${customer.id}`,
            name: customer.name,
            address: customer.location.replace(/GPS:\s*-?\d+\.?\d*,\s*-?\d+\.?\d*\s*\(?\)?/g, '').trim() || 'No address',
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            type: 'customer',
            route: customerRoute,
            pendingOrders: pendingOrderIds,
            pendingOrderCount: pendingOrders.length,
            details: `Phone: ${customer.phone || 'N/A'} | Route: ${customerRoute} | ${pendingOrderDetails}`
          });
        } else {
          customersWithoutGPS++;
          if (pendingOrders.length > 0) {
            customersWithPendingNoGPS++;
            console.log(`❌ Customer with pending orders but NO GPS: ${customer.name} - ${pendingOrders.length} orders`);
          } else {
            console.log(`❌ No GPS coordinates found for customer: ${customer.name}`);
          }
        }
      } else {
        customersWithoutGPS++;
        if (pendingOrders.length > 0) {
          customersWithPendingNoGPS++;
          console.log(`❌ Customer with pending orders but NO LOCATION: ${customer.name} - ${pendingOrders.length} orders`);
        } else {
          console.log(`❌ No location data for customer: ${customer.name}`);
        }
      }
    });

    console.log('🔍 Debug Map Summary:');
    console.log(`- Total customers: ${customers.length}`);
    console.log(`- Customers with GPS: ${customersWithGPS}`);
    console.log(`- Customers without GPS: ${customersWithoutGPS}`);
    console.log(`- Customers with pending orders AND GPS: ${customersWithPendingAndGPS}`);
    console.log(`- Customers with pending orders but NO GPS: ${customersWithPendingNoGPS}`);
    console.log(`- Total pending orders: ${allPendingOrders.length}`);
    console.log(`- Locations added to map: ${locations.filter(l => l.type === 'customer').length}`);

    // Add supplier locations (if they have GPS data)
    suppliers.forEach(supplier => {
      if (supplier.location) {
        const gpsMatch = supplier.location.match(/GPS:\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
        
        if (gpsMatch) {
          const [, lat, lng] = gpsMatch;
          locations.push({
            id: `supplier-${supplier.id}`,
            name: supplier.name,
            address: supplier.location.replace(/GPS:\s*-?\d+\.?\d*,\s*-?\d+\.?\d*\s*\(?\)?/g, '').trim() || 'No address',
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            type: 'supplier',
            details: `Contact: ${supplier.contactPerson || 'N/A'} | Phone: ${supplier.phone || 'N/A'}`
          });
        }
      }
    });

    console.log('🔍 Debug Map: Final locations:', locations.length);
    console.log('🔍 Debug Map: Available routes:', Array.from(routes));
    console.log('🔍 Debug Map: All locations:', locations);

    setMapLocations(locations);
    setAvailableRoutes(Array.from(routes).sort());
  }, [customers, suppliers]);

  // Initialize map when Google Maps is loaded
  useEffect(() => {
    if (isMapLoaded && mapRef.current && !mapInstanceRef.current) {
      const map = new window.google.maps.Map(mapRef.current, {
        center: { lat: 9.661, lng: 80.025 }, // Centered on Kilinochchi, Sri Lanka
        zoom: 12,
        styles: [
          {
            featureType: 'poi',
            elementType: 'labels',
            stylers: [{ visibility: 'on' }]
          }
        ]
      });

      // Initialize directions renderer
      const renderer = new window.google.maps.DirectionsRenderer({
        suppressMarkers: false,
        polylineOptions: {
          strokeColor: '#2563eb',
          strokeWeight: 4,
          strokeOpacity: 0.8
        }
      });
      renderer.setMap(map);
      setDirectionsRenderer(renderer);

      mapInstanceRef.current = map;
      addMarkersToMap(map);
    }
  }, [isMapLoaded, mapLocations]);

  // Add markers to map
  const addMarkersToMap = (map: any) => {
    const bounds = new window.google.maps.LatLngBounds();
    let addedMarkers = 0;

    console.log('🔍 Debug Markers: Adding markers with filters:', {
      filterType,
      selectedRoute,
      totalLocations: mapLocations.length
    });

    mapLocations.forEach((location, index) => {
      console.log(`🔍 Debug Marker ${index}:`, {
        name: location.name,
        type: location.type,
        route: location.route,
        pendingOrders: location.pendingOrderCount || 0,
        willShow: (filterType === 'all' || location.type === filterType) && 
                  (selectedRoute === 'all' || location.type !== 'customer' || location.route === selectedRoute) &&
                  (!showOnlyPendingOrders || location.type !== 'customer' || (location.pendingOrderCount && location.pendingOrderCount > 0))
      });

      // Filter by type
      if (filterType !== 'all' && location.type !== filterType) {
        console.log(`❌ Filtered out by type: ${location.name}`);
        return;
      }
      
      // Filter by route (only apply to customers)
      if (selectedRoute !== 'all' && location.type === 'customer' && location.route !== selectedRoute) {
        console.log(`❌ Filtered out by route: ${location.name} (route: ${location.route})`);
        return;
      }

      // Filter by pending orders (only apply to customers when filter is enabled)
      if (showOnlyPendingOrders && location.type === 'customer' && (!location.pendingOrderCount || location.pendingOrderCount === 0)) {
        console.log(`❌ Filtered out by pending orders: ${location.name} (no pending orders)`);
        return;
      }

      console.log(`✅ Adding marker: ${location.name}`);
      addedMarkers++;

      const marker = new window.google.maps.Marker({
        position: { lat: location.lat, lng: location.lng },
        map: map,
        title: location.name,
        icon: {
          url: getMarkerIcon(location.type, location.route),
          scaledSize: new window.google.maps.Size(40, 40)
        }
      });

      // Add pending order indicator for customers with pending orders
      if (location.type === 'customer' && location.pendingOrderCount && location.pendingOrderCount > 0) {
        const pendingLabel = new window.google.maps.Marker({
          position: { 
            lat: location.lat + 0.0005, // Slightly offset above the main marker
            lng: location.lng 
          },
          map: map,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 12,
            fillColor: '#EF4444', // Red color for pending orders
            fillOpacity: 0.9,
            strokeColor: '#FFFFFF',
            strokeWeight: 2
          },
          label: {
            text: location.pendingOrderCount.toString(),
            color: '#FFFFFF',
            fontSize: '12px',
            fontWeight: 'bold'
          },
          zIndex: 1000 // Higher z-index to show above main marker
        });

        markersRef.current.push(pendingLabel);
      }

      // Store marker reference for cleanup
      markersRef.current.push(marker);

      // Enhanced info window content with pending orders
      let infoContent = `
        <div style="padding: 10px; max-width: 350px;">
          <h3 style="margin: 0 0 10px 0; color: #1f2937; font-size: 16px; font-weight: bold;">${location.name}</h3>
          <p style="margin: 0 0 5px 0; color: #6b7280; font-size: 14px;"><strong>Address:</strong> ${location.address}</p>
          <p style="margin: 0 0 5px 0; color: #6b7280; font-size: 14px;"><strong>Type:</strong> ${location.type.charAt(0).toUpperCase() + location.type.slice(1)}</p>
      `;

      // Add pending orders section for customers
      if (location.type === 'customer' && location.pendingOrders && location.pendingOrders.length > 0) {
        infoContent += `
          <div style="margin: 10px 0; padding: 8px; background-color: #FEF2F2; border-left: 3px solid #EF4444; border-radius: 4px;">
            <p style="margin: 0 0 5px 0; color: #DC2626; font-size: 14px; font-weight: bold;">🔴 Pending Orders (${location.pendingOrderCount})</p>
            <p style="margin: 0; color: #7F1D1D; font-size: 12px;">Order IDs: ${location.pendingOrders.join(', ')}</p>
          </div>
        `;
      } else if (location.type === 'customer') {
        infoContent += `
          <div style="margin: 10px 0; padding: 8px; background-color: #F0FDF4; border-left: 3px solid: #22C55E; border-radius: 4px;">
            <p style="margin: 0; color: #15803D; font-size: 12px;">✅ No pending orders</p>
          </div>
        `;
      }

      infoContent += `
          <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 12px;"><strong>Details:</strong> ${location.details || 'No details available'}</p>
        </div>
      `;

      const infoWindow = new window.google.maps.InfoWindow({
        content: infoContent
      });

      marker.addListener('click', () => {
        infoWindow.open(map, marker);
        setSelectedLocation(location);
      });

      bounds.extend({ lat: location.lat, lng: location.lng });
    });

    console.log(`🔍 Debug Markers: Total markers added: ${addedMarkers}`);

    if (addedMarkers > 0) {
      map.fitBounds(bounds);
    } else {
      console.log('⚠️ No markers to display, keeping default view');
    }
  };

  // Color palette for different routes
  const routeColors = [
    'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
    'https://maps.google.com/mapfiles/ms/icons/blue-dot.png', 
    'https://maps.google.com/mapfiles/ms/icons/green-dot.png',
    'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png',
    'https://maps.google.com/mapfiles/ms/icons/purple-dot.png',
    'https://maps.google.com/mapfiles/ms/icons/pink-dot.png',
    'https://maps.google.com/mapfiles/ms/icons/orange-dot.png',
    'https://maps.google.com/mapfiles/ms/icons/ltblue-dot.png'
  ];

  // Get marker icon based on location type and route
  const getMarkerIcon = (type: string, route?: string) => {
    if (type === 'customer') {
      if (route && route !== 'Unassigned') {
        // Assign different colors based on route
        const routeIndex = availableRoutes.indexOf(route);
        if (routeIndex !== -1) {
          return routeColors[routeIndex % routeColors.length];
        }
      }
      // Default blue for customers without route or unassigned
      return 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png';
    }
    
    switch (type) {
      case 'supplier':
        return 'https://maps.google.com/mapfiles/ms/icons/green-dot.png';
      case 'delivery':
        return 'https://maps.google.com/mapfiles/ms/icons/red-dot.png';
      default:
        return 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png';
    }
  };

  // Store markers reference to clear them later
  const markersRef = useRef<any[]>([]);

  // Update map when filter changes
  useEffect(() => {
    if (mapInstanceRef.current) {
      // Clear existing markers
      markersRef.current.forEach(marker => {
        if (marker && marker.setMap) {
          marker.setMap(null);
        }
      });
      markersRef.current = [];
      
      // Clear existing route if any
      if (directionsRenderer) {
        directionsRenderer.setDirections({routes: []});
      }
      
      // Re-add markers to existing map (don't recreate the map)
      addMarkersToMap(mapInstanceRef.current);
    }
  }, [filterType, selectedRoute, showOnlyPendingOrders]);

  // AI Route Planning Function
  const calculateOptimizedRoute = async (routeName: string) => {
    if (!window.google || !mapInstanceRef.current || !directionsRenderer) {
      alert('Google Maps is not loaded yet. Please wait and try again.');
      return;
    }

    const routeCustomers = mapLocations.filter(location => 
      location.type === 'customer' && location.route === routeName
    );

    if (routeCustomers.length < 2) {
      alert('Need at least 2 customers in this route to calculate optimal path.');
      return;
    }

    setIsCalculatingRoute(true);
    
    try {
      const directionsService = new window.google.maps.DirectionsService();
      
      // Store location (distribution center)
      const origin = { lat: 9.384489, lng: 80.408737 }; // Kilinochchi area
      
      // Get all customer locations for this route
      const waypoints = routeCustomers.slice(0, -1).map(customer => ({
        location: { lat: customer.lat, lng: customer.lng },
        stopover: true
      }));
      
      // Last customer as destination
      const destination = {
        lat: routeCustomers[routeCustomers.length - 1].lat,
        lng: routeCustomers[routeCustomers.length - 1].lng
      };

      // Calculate optimized route
      const request = {
        origin: origin,
        destination: destination,
        waypoints: waypoints,
        optimizeWaypoints: true, // This enables AI optimization
        travelMode: window.google.maps.TravelMode.DRIVING,
        unitSystem: window.google.maps.UnitSystem.METRIC
      };

      directionsService.route(request, (result: any, status: any) => {
        setIsCalculatingRoute(false);
        
        if (status === 'OK') {
          directionsRenderer.setDirections(result);
          setOptimizedRoute(result);
          
          // Calculate total distance and time
          let totalDistance = 0;
          let totalTime = 0;
          
          result.routes[0].legs.forEach((leg: any) => {
            totalDistance += leg.distance.value;
            totalTime += leg.duration.value;
          });
          
          const distanceKm = (totalDistance / 1000).toFixed(1);
          const timeHours = Math.floor(totalTime / 3600);
          const timeMinutes = Math.floor((totalTime % 3600) / 60);
          
          alert(`🗺️ Optimized Route Calculated!\n\n` +
                `📍 Route: ${routeName}\n` +
                `👥 Customers: ${routeCustomers.length}\n` +
                `📏 Total Distance: ${distanceKm} km\n` +
                `⏱️ Estimated Time: ${timeHours}h ${timeMinutes}m\n\n` +
                `🚛 The blue route shows the most efficient path to visit all customers!`);
        } else {
          console.error('Directions request failed:', status);
          alert('Failed to calculate route. Please check customer locations have valid GPS coordinates.');
        }
      });
    } catch (error) {
      setIsCalculatingRoute(false);
      console.error('Route calculation error:', error);
      alert('Error calculating route. Please try again.');
    }
  };

  // Clear route function
  const clearRoute = () => {
    if (directionsRenderer) {
      directionsRenderer.setDirections({routes: []});
      setOptimizedRoute(null);
    }
  };

  // PDF Export function
  const exportMapPDF = () => {
    let filteredLocations = mapLocations.filter(location => 
      filterType === 'all' || location.type === filterType
    );
    
    // Further filter by route if selected
    if (selectedRoute !== 'all') {
      filteredLocations = filteredLocations.filter(location => 
        location.type !== 'customer' || location.route === selectedRoute
      );
    }

    // Further filter by pending orders if enabled
    if (showOnlyPendingOrders) {
      filteredLocations = filteredLocations.filter(location => 
        location.type !== 'customer' || (location.pendingOrderCount && location.pendingOrderCount > 0)
      );
    }

    const columns = [
      { key: 'name', title: 'Name' },
      { key: 'type', title: 'Type' },
      { key: 'route', title: 'Route' },
      { key: 'address', title: 'Address' },
      { key: 'coordinates', title: 'GPS Coordinates' },
      { key: 'details', title: 'Details' }
    ];

    const data = filteredLocations.map(location => ({
      name: location.name,
      type: location.type.charAt(0).toUpperCase() + location.type.slice(1),
      route: location.route || 'N/A',
      address: location.address,
      coordinates: `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`,
      details: location.details || 'No details available'
    }));

    const title = `Map Locations Report${selectedRoute !== 'all' ? ` - ${selectedRoute} Route` : ''}${filterType !== 'all' ? ` - ${filterType.charAt(0).toUpperCase() + filterType.slice(1)}s` : ''}${showOnlyPendingOrders ? ' - Pending Orders Only' : ''}`;
    
    exportToPDF(title, columns, data, {
      summary: {
        'Total Locations': filteredLocations.length.toString(),
        'Route Filter': selectedRoute === 'all' ? 'All Routes' : selectedRoute,
        'Type Filter': filterType === 'all' ? 'All Locations' : `${filterType.charAt(0).toUpperCase() + filterType.slice(1)}s Only`,
        'Pending Orders Filter': showOnlyPendingOrders ? 'Enabled - Showing only customers with pending orders' : 'Disabled',
        'Generated By': currentUser?.name || 'Unknown User'
      }
    });
  };

  const filteredCount = mapLocations.filter(location => {
    // Filter by type
    if (filterType !== 'all' && location.type !== filterType) return false;
    
    // Filter by route (only apply to customers)
    if (selectedRoute !== 'all' && location.type === 'customer' && location.route !== selectedRoute) return false;
    
    // Filter by pending orders (only apply to customers when filter is enabled)
    if (showOnlyPendingOrders && location.type === 'customer' && (!location.pendingOrderCount || location.pendingOrderCount === 0)) return false;
    
    return true;
  }).length;

  return (
    <div className="p-3 sm:p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6 lg:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 sm:justify-between sm:items-center">
        <div className="flex-1">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-800 dark:text-slate-100">Map View</h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mt-1 sm:mt-2">
            View customers, suppliers, and delivery locations on the map
          </p>
        </div>
        <button
          onClick={exportMapPDF}
          className="px-3 py-2 sm:px-4 sm:py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base w-full sm:w-auto"
        >
          📄 <span className="sm:inline">Export PDF</span>
        </button>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Map Controls & Route Planning</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filter Controls */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">Type:</label>
                <select 
                  value={filterType} 
                  onChange={(e) => setFilterType(e.target.value as any)}
                  className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm w-full sm:w-auto min-w-0"
                >
                  <option value="all">All Locations ({mapLocations.length})</option>
                  <option value="customer">Customers ({mapLocations.filter(l => l.type === 'customer').length})</option>
                  <option value="supplier">Suppliers ({mapLocations.filter(l => l.type === 'supplier').length})</option>
                  <option value="delivery">Deliveries ({mapLocations.filter(l => l.type === 'delivery').length})</option>
                </select>
              </div>
              
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">Route:</label>
                <select 
                  value={selectedRoute} 
                  onChange={(e) => {
                    console.log('🔍 Debug Route Change:', e.target.value);
                    setSelectedRoute(e.target.value);
                    clearRoute(); // Clear any existing route when changing selection
                  }}
                  className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm w-full sm:w-auto min-w-0"
                >
                  <option value="all">All Routes</option>
                  {availableRoutes.map(route => {
                    const customerCount = mapLocations.filter(l => l.type === 'customer' && l.route === route).length;
                    console.log(`🔍 Debug Route Option: ${route} - ${customerCount} customers`);
                    return (
                      <option key={route} value={route}>
                        {route} ({customerCount})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Pending Orders Filter */}
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center">
                  <input
                    id="pending-orders-filter"
                    type="checkbox"
                    checked={showOnlyPendingOrders}
                    onChange={(e) => setShowOnlyPendingOrders(e.target.checked)}
                    className="w-4 h-4 text-red-600 bg-gray-100 border-gray-300 rounded focus:ring-red-500 dark:focus:ring-red-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <label 
                    htmlFor="pending-orders-filter" 
                    className="ml-2 text-sm font-medium text-amber-800 dark:text-amber-200 cursor-pointer"
                  >
                    🔴 Show only customers with pending orders
                  </label>
                </div>
                <div className="text-xs text-amber-600 dark:text-amber-400">
                  ({(() => {
                    // Count only customers with GPS coordinates AND pending orders (customers actually visible on map)
                    const customersWithGPSAndPending = mapLocations.filter(l => 
                      l.type === 'customer' && 
                      l.pendingOrderCount && 
                      l.pendingOrderCount > 0
                    ).length;
                    
                    // Count total pending orders across all customers (for comparison)
                    const totalPendingOrders = orders.filter(order => 
                      order.status === 'Pending' || order.status === 'Processing'
                    ).length;
                    
                    return `${customersWithGPSAndPending} mapped customers with pending orders • ${totalPendingOrders} total pending orders`;
                  })()})
                </div>
              </div>
            </div>
          </div>
          
          {/* Route Planning Controls */}
          {selectedRoute !== 'all' && (
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 p-3 sm:p-4 rounded-lg border border-blue-200 dark:border-blue-700">
              <div className="flex flex-col gap-3">
                <div>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2 text-sm sm:text-base">
                    🗺️ AI Route Optimization for {selectedRoute}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Calculate the shortest route to visit all customers in this route
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                  <button
                    onClick={() => calculateOptimizedRoute(selectedRoute)}
                    disabled={isCalculatingRoute}
                    className="px-3 py-2 sm:px-4 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base w-full sm:w-auto"
                  >
                    {isCalculatingRoute ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span className="hidden sm:inline">Calculating...</span>
                        <span className="sm:hidden">Planning...</span>
                      </>
                    ) : (
                      <>
                        🚛 <span className="hidden sm:inline">Plan Route</span>
                        <span className="sm:hidden">Plan</span>
                      </>
                    )}
                  </button>
                  {optimizedRoute && (
                    <button
                      onClick={clearRoute}
                      className="px-3 py-2 sm:px-4 sm:py-2 bg-slate-500 text-white rounded-lg hover:bg-slate-600 transition-colors text-sm sm:text-base w-full sm:w-auto"
                    >
                      Clear Route
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* Legend */}
          <div className="space-y-3">
            <h4 className="font-medium text-slate-700 dark:text-slate-300 text-sm sm:text-base">Map Legend</h4>
            
            {/* Route Colors */}
            {availableRoutes.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">Customer Routes:</h5>
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3">
                  {availableRoutes.map((route, index) => {
                    const colorMap = {
                      0: 'bg-red-500',     // red
                      1: 'bg-blue-500',    // blue  
                      2: 'bg-green-500',   // green
                      3: 'bg-yellow-500',  // yellow
                      4: 'bg-purple-500',  // purple
                      5: 'bg-pink-500',    // pink
                      6: 'bg-orange-500',  // orange
                      7: 'bg-cyan-400'     // light blue
                    };
                    const colorClass = colorMap[index % 8] || 'bg-blue-500';
                    const customerCount = mapLocations.filter(l => l.type === 'customer' && l.route === route).length;
                    
                    return (
                      <div key={route} className="flex items-center gap-2 min-w-0">
                        <div className={`w-3 h-3 sm:w-4 sm:h-4 ${colorClass} rounded-full flex-shrink-0`}></div>
                        <span className="text-xs sm:text-xs text-slate-600 dark:text-slate-400 truncate">
                          {route} ({customerCount})
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* Other Types */}
            <div className="flex flex-wrap gap-3 sm:gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 sm:w-4 sm:h-4 bg-green-500 rounded-full"></div>
                <span className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">Suppliers</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 sm:w-4 sm:h-4 bg-red-500 rounded-full"></div>
                <span className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">Deliveries</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 sm:w-4 sm:h-4 bg-red-500 rounded-full border-2 border-white"></div>
                <span className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">Pending Orders</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Map Container */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6">
        <div className="xl:col-span-2">
          <Card>
            <CardHeader className="pb-3 sm:pb-6">
              <CardTitle className="text-lg sm:text-xl">Interactive Map</CardTitle>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                Showing {filteredCount} location{filteredCount !== 1 ? 's' : ''}
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="relative">
                <div 
                  ref={mapRef} 
                  className="w-full h-64 sm:h-80 md:h-96 xl:h-[600px] rounded-lg"
                  style={{ minHeight: '250px' }}
                >
                  {!isMapLoaded && (
                    <div className="flex items-center justify-center h-full bg-slate-100 dark:bg-slate-700 rounded-lg">
                      <div className="text-center p-4">
                        <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-600 mx-auto mb-3 sm:mb-4"></div>
                        <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm">Loading Google Maps...</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Location Details Panel */}
        <div>
          <Card>
            <CardHeader className="pb-3 sm:pb-6">
              <CardTitle className="text-lg sm:text-xl">Location Details</CardTitle>
            </CardHeader>
            <CardContent className="max-h-64 sm:max-h-80 xl:max-h-[600px] overflow-y-auto">
              {selectedLocation ? (
                <div className="space-y-3 sm:space-y-4">
                  <div>
                    <h3 className="font-semibold text-base sm:text-lg text-slate-800 dark:text-slate-100 mb-2">
                      {selectedLocation.name}
                    </h3>
                    <Badge variant={selectedLocation.type === 'customer' ? 'default' : selectedLocation.type === 'supplier' ? 'success' : 'warning'}>
                      {selectedLocation.type.charAt(0).toUpperCase() + selectedLocation.type.slice(1)}
                    </Badge>
                  </div>
                  
                  <div className="space-y-3 text-xs sm:text-sm">
                    <div>
                      <span className="font-medium text-slate-700 dark:text-slate-300 block mb-1">Address:</span>
                      <p className="text-slate-600 dark:text-slate-400 break-words">{selectedLocation.address}</p>
                    </div>
                    
                    <div>
                      <span className="font-medium text-slate-700 dark:text-slate-300 block mb-1">Coordinates:</span>
                      <p className="text-slate-600 dark:text-slate-400 font-mono text-xs">
                        {selectedLocation.lat.toFixed(6)}, {selectedLocation.lng.toFixed(6)}
                      </p>
                    </div>
                    
                    {/* Pending Orders Section */}
                    {selectedLocation.type === 'customer' && (
                      <div>
                        <span className="font-medium text-slate-700 dark:text-slate-300 block mb-1">Pending Orders:</span>
                        {selectedLocation.pendingOrders && selectedLocation.pendingOrders.length > 0 ? (
                          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-2">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                              <span className="text-red-700 dark:text-red-300 font-medium text-xs">
                                {selectedLocation.pendingOrderCount} Pending Order{selectedLocation.pendingOrderCount !== 1 ? 's' : ''}
                              </span>
                            </div>
                            <p className="text-red-600 dark:text-red-400 text-xs font-mono">
                              IDs: {selectedLocation.pendingOrders.join(', ')}
                            </p>
                          </div>
                        ) : (
                          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-2">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                              <span className="text-green-700 dark:text-green-300 text-xs">No pending orders</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div>
                      <span className="font-medium text-slate-700 dark:text-slate-300 block mb-1">Details:</span>
                      <p className="text-slate-600 dark:text-slate-400 break-words">{selectedLocation.details}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      const url = `https://www.google.com/maps?q=${selectedLocation.lat},${selectedLocation.lng}`;
                      window.open(url, '_blank');
                    }}
                    className="w-full px-3 py-2 sm:px-4 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm sm:text-base mt-4"
                  >
                    🗺️ Open in Google Maps
                  </button>
                </div>
              ) : (
                <div className="text-center py-6 sm:py-8">
                  <div className="text-3xl sm:text-4xl mb-3 sm:mb-4">📍</div>
                  <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-base px-2">
                    Click on a marker to view location details
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card className="mt-4 md:mt-6">
            <CardHeader className="pb-3 sm:pb-6">
              <CardTitle>Map Statistics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Total Locations:</span>
                <span className="font-semibold">{mapLocations.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Customers:</span>
                <span className="font-semibold text-blue-600">{mapLocations.filter(l => l.type === 'customer').length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Suppliers:</span>
                <span className="font-semibold text-green-600">{mapLocations.filter(l => l.type === 'supplier').length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Deliveries:</span>
                <span className="font-semibold text-red-600">{mapLocations.filter(l => l.type === 'delivery').length}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};