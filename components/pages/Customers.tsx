import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { Customer, UserRole } from '../../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/Card';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { exportCustomers } from '../../utils/exportUtils';
import { confirmSecureDelete } from '../../utils/passwordConfirmation';

const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount).replace('$', `${currency} `);
};

// Helper function to extract GPS coordinates from location string and create clickable link
const renderLocationWithGPS = (location: string) => {
  // Check if location contains GPS coordinates pattern (GPS: lat, lng)
  const gpsMatch = location.match(/GPS:\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
  
  if (gpsMatch) {
    const [fullMatch, lat, lng] = gpsMatch;
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    
    // Split location into address part and GPS part
    const addressPart = location.replace(fullMatch, '').replace(/\s*\(\s*\)\s*$/, '').trim();
    
    // Create Google Maps URL
    const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
    
    return (
      <div className="text-xs text-slate-500 dark:text-slate-400">
        {addressPart && (
          <div className="truncate">{addressPart}</div>
        )}
        <a 
          href={mapsUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 underline truncate block"
          title={`Open location in Google Maps (${latitude}, ${longitude})`}
        >
          📍 GPS: {latitude.toFixed(4)}, {longitude.toFixed(4)}
        </a>
      </div>
    );
  }
  
  // If no GPS coordinates, just show the location normally
  return (
    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{location}</div>
  );
};


interface CustomersProps {
  selectedRoute?: string;
  onBackToRoutes?: () => void;
}

export const Customers: React.FC<CustomersProps> = ({ selectedRoute: propSelectedRoute, onBackToRoutes }) => {
  const { customers, setCustomers, orders, products, suppliers, refetchData } = useData();
  const { currentUser } = useAuth();
  const currency = currentUser?.settings.currency || 'LKR';

  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [currentCustomer, setCurrentCustomer] = useState<Partial<Customer>>({});
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [gpsCoordinates, setGpsCoordinates] = useState<{lat: number, lng: number} | null>(null);
  
  // Route management states
  const [routes, setRoutes] = useState<string[]>(['Route 1', 'Route 2', 'Route 3', 'Unassigned']);
  const [selectedRoute, setSelectedRoute] = useState<string>(propSelectedRoute || 'All Routes');
  const [isAddingRoute, setIsAddingRoute] = useState(false);
  const [newRouteName, setNewRouteName] = useState('');
  const [routesLoaded, setRoutesLoaded] = useState(false);
  
  // Store location (your distribution center)
  const STORE_LOCATION = { lat: 9.384489, lng: 80.408737, name: 'Distribution Center' };
  
  // Route optimization states
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizedOrder, setOptimizedOrder] = useState<Customer[]>([]);

  // Filter states
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const canEdit = useMemo(() => 
    currentUser?.role === UserRole.Admin,
    [currentUser]
  );

  const canDelete = useMemo(() => 
    currentUser?.role === UserRole.Admin,
    [currentUser]
  );

  // Load routes from database on component mount
  const loadRoutesFromDatabase = async () => {
    try {
      // Import the fetchRoutes function from supabaseClient
      const { fetchRoutes } = await import('../../supabaseClient');
      const routeNames = await fetchRoutes();
      setRoutes(routeNames);
      setRoutesLoaded(true);
    } catch (error) {
      console.warn('Could not load routes from database:', error);
      // Keep default routes on error
      setRoutesLoaded(true);
    }
  };

  // Load routes when component mounts
  useEffect(() => {
    loadRoutesFromDatabase();
  }, []);

  // Helper: detect missing created_by column reliably across Supabase/PostgREST variants
  const isCreatedByMissingError = (err: any): boolean => {
    try {
      const code = String(err?.code || '').toLowerCase();
      const message = String(err?.message || '').toLowerCase();
      const details = String(err?.details || '').toLowerCase();
      const hint = String(err?.hint || '').toLowerCase();
      const blob = JSON.stringify(err || {}).toLowerCase();
      // Common patterns
      if (code === '42703' || code === 'pgrst257') return true; // undefined_column / schema cache
      if (message.includes('created_by') || details.includes('created_by') || hint.includes('created_by')) return true;
      if (blob.includes('created_by') && (blob.includes('column') || blob.includes('schema cache'))) return true;
    } catch {}
    return false;
  };



  const openModal = (mode: 'add' | 'edit', customer?: Customer) => {
    setModalMode(mode);
    if (mode === 'edit' && customer) {
      // For edit mode, preserve all existing customer data including outstandingBalance
      setCurrentCustomer({ ...customer });
      // Set GPS coordinates if they exist
      if (customer.gpsCoordinates) {
        const [lat, lng] = customer.gpsCoordinates.split(', ').map(Number);
        setGpsCoordinates({ lat, lng });
      } else {
        setGpsCoordinates(null);
      }
    } else {
      // For add mode, set default values and assign to selected route
      setCurrentCustomer({ 
        name: '', 
        email: '', 
        phone: '', 
        location: '', 
        route: selectedRoute === 'All Routes' ? 'Unassigned' : selectedRoute, 
        outstandingBalance: 0, 
        avatarUrl: `/lord-shiva-avatar.jpg` 
      });
      setGpsCoordinates(null);
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setCurrentCustomer({});
    setGpsCoordinates(null);
    setIsGettingLocation(false);
  };

  const openDeleteConfirm = (customer: Customer) => {
    setCustomerToDelete(customer);
  };

  const closeDeleteConfirm = () => {
    setCustomerToDelete(null);
  };

    const handleSave = () => {
    (async () => {
      try {
        if (!currentCustomer.name) {
          alert('Please fill in the customer name');
          return;
        }

        if (!currentCustomer.phone) {
          alert('Please fill in the phone number');
          return;
        }

        // Check if phone number already exists (only for new customers or when editing phone)
        if (modalMode === 'add' || (modalMode === 'edit' && currentCustomer.phone !== customers.find(c => c.id === currentCustomer.id)?.phone)) {
          const { data: existingCustomers, error: checkError } = await supabase
            .from('customers')
            .select('id, phone')
            .eq('phone', currentCustomer.phone);
          
          if (checkError) {
            alert(`Error checking phone number: ${checkError.message}`);
            return;
          }
          
          if (existingCustomers && existingCustomers.length > 0) {
            // If editing, make sure it's not the same customer
            if (modalMode === 'edit' && existingCustomers[0].id === currentCustomer.id) {
              // Same customer, continue
            } else {
              alert('This phone number is already registered with another customer. Please use a different phone number.');
              return;
            }
          }
        }

        if (modalMode === 'add') {
          // Generate unique ID using timestamp and random number
          const uniqueId = `CUST${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`;
          
          // Create customer object with sales rep segregation support
          const newCustomer = {
            id: uniqueId,
            name: currentCustomer.name || '',
            email: currentCustomer.email || '',
            phone: currentCustomer.phone || '',
            location: currentCustomer.location || '',
            route: currentCustomer.route || 'Unassigned',
            joindate: new Date().toISOString().split('T')[0],
            totalspent: 0,
            outstandingbalance: 0,
            avatarurl: currentCustomer.avatarUrl || `/lord-shiva-avatar.jpg`,
          };

          // Try to add created_by field if the column exists in the database
          try {
            const customerWithCreatedBy = {
              ...newCustomer,
              created_by: currentUser?.id || 'system'
            };
            
            // Force JSON insert and return the created row
            const { error } = await supabase.from('customers').insert([customerWithCreatedBy]);
            
            if (error) {
              // If error is about missing created_by column, try without it
              if (error.message.includes('created_by') || error.message.includes('column')) {
                console.warn('created_by column not found, inserting without sales rep segregation');
                const { error: fallbackError } = await supabase.from('customers').insert([newCustomer]);
                if (fallbackError) {
                  alert(`Error adding customer: ${fallbackError.message}`);
                  return;
                }
                alert('Customer added successfully! Note: Run database migration for sales rep segregation.');
              } else {
                alert(`Error adding customer: ${error.message}`);
                return;
              }
            } else {
              alert('Customer added successfully!');
            }
          } catch (err) {
            console.error('Unexpected error:', err);
            // Fallback to basic customer creation
            const { error: basicError } = await supabase.from('customers').insert([newCustomer]);
            if (basicError) {
              alert(`Error adding customer: ${basicError.message}`);
              return;
            }
            alert('Customer added successfully! (Basic mode - no sales rep segregation)');
          }
          
          // Refresh customers data
          await refetchData();
        } else {
          const { error } = await supabase.from('customers').update({
            name: currentCustomer.name,
            email: currentCustomer.email,
            phone: currentCustomer.phone,
            location: currentCustomer.location,
            route: currentCustomer.route,
            outstandingbalance: currentCustomer.outstandingBalance,
            avatarurl: currentCustomer.avatarUrl,
          }).eq('id', currentCustomer.id);
          
          if (error) {
            alert(`Error updating customer: ${error.message}`);
            return;
          }
          alert('Customer updated successfully!');
          // Refresh customers data
          await refetchData();
        }
        // Close modal after data refresh
        closeModal();
      } catch (error) {
        console.error('Unexpected error in customer operation:', error);
        alert('An unexpected error occurred. Please try again.');
      }
    })();
  };
  
  const handleDelete = async () => {
    if (!customerToDelete || !currentUser?.email) return;
    
    // Require password confirmation for delete
    const confirmed = await confirmSecureDelete(
      customerToDelete.name, 
      'Customer', 
      currentUser.email
    );
    
    if (!confirmed) {
      closeDeleteConfirm();
      return;
    }
    
    if (customerToDelete) {
      try {
        const { error } = await supabase.from('customers').delete().eq('id', customerToDelete.id);
        if (error) {
          alert(`Error deleting customer: ${error.message}`);
          return;
        }
        
        alert('Customer deleted successfully!');
        // Refresh customers data
        await refetchData();
        closeDeleteConfirm();
      } catch (error) {
        console.error('Unexpected error deleting customer:', error);
        alert('An unexpected error occurred while deleting. Please try again.');
      }
    }
  };
  
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result as string;
            setCurrentCustomer(prev => ({ ...prev, avatarUrl: base64String }));
        };
        reader.readAsDataURL(file);
    }
  };

  // Utility function to calculate distance between two GPS coordinates
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in kilometers
  };

  // Extract GPS coordinates from location string
  const extractGPSCoordinates = (location: string): { lat: number, lng: number } | null => {
    const gpsMatch = location.match(/GPS:\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
    if (gpsMatch) {
      return { lat: parseFloat(gpsMatch[1]), lng: parseFloat(gpsMatch[2]) };
    }
    return null;
  };

  // Suggest route for unassigned customer based on proximity to existing route customers
  const suggestRouteForCustomer = (customer: Customer): string | null => {
    if (customer.route !== 'Unassigned') return null;
    
    const customerGPS = extractGPSCoordinates(customer.location);
    if (!customerGPS) return null;

    let closestRoute: string | null = null;
    let shortestDistance = Infinity;

    // Check distance to customers in each assigned route
    routes.forEach(route => {
      if (route === 'Unassigned') return;
      
      const routeCustomers = customers.filter(c => c.route === route && c.id !== customer.id);
      if (routeCustomers.length === 0) return;

      // Find average center of route customers
      let totalLat = 0, totalLng = 0, validCount = 0;
      
      routeCustomers.forEach(rc => {
        const rcGPS = extractGPSCoordinates(rc.location);
        if (rcGPS) {
          totalLat += rcGPS.lat;
          totalLng += rcGPS.lng;
          validCount++;
        }
      });

      if (validCount > 0) {
        const avgLat = totalLat / validCount;
        const avgLng = totalLng / validCount;
        const distance = calculateDistance(customerGPS.lat, customerGPS.lng, avgLat, avgLng);
        
        if (distance < shortestDistance) {
          shortestDistance = distance;
          closestRoute = route;
        }
      }
    });

    return closestRoute;
  };

  // Optimize route using nearest neighbor algorithm
  const optimizeRoute = (customers: Customer[]): Customer[] => {
    const customersWithGPS = customers.filter(customer => extractGPSCoordinates(customer.location));
    if (customersWithGPS.length === 0) return customers;

    const optimized: Customer[] = [];
    const remaining = [...customersWithGPS];
    let currentLocation = STORE_LOCATION;

    while (remaining.length > 0) {
      let nearestIndex = 0;
      let shortestDistance = Infinity;

      remaining.forEach((customer, index) => {
        const customerGPS = extractGPSCoordinates(customer.location);
        if (customerGPS) {
          const distance = calculateDistance(
            currentLocation.lat, currentLocation.lng,
            customerGPS.lat, customerGPS.lng
          );
          if (distance < shortestDistance) {
            shortestDistance = distance;
            nearestIndex = index;
          }
        }
      });

      const nearestCustomer = remaining.splice(nearestIndex, 1)[0];
      optimized.push(nearestCustomer);
      
      const nearestGPS = extractGPSCoordinates(nearestCustomer.location);
      if (nearestGPS) {
        currentLocation = { ...nearestGPS, name: nearestCustomer.name };
      }
    }

    // Add customers without GPS at the end
    const customersWithoutGPS = customers.filter(customer => !extractGPSCoordinates(customer.location));
    return [...optimized, ...customersWithoutGPS];
  };

  // Handle route optimization
  const handleOptimizeRoute = () => {
    if (selectedRoute === 'Unassigned' || selectedRoute === 'All Routes') {
      alert('Please select a specific route to optimize');
      return;
    }

    setIsOptimizing(true);
    
    // Get customers for selected route
    const routeCustomers = customersByRoute[selectedRoute] || [];
    
    if (routeCustomers.length === 0) {
      alert('No customers found in selected route');
      setIsOptimizing(false);
      return;
    }

    // Simulate API call delay for optimization
    setTimeout(() => {
      const optimized = optimizeRoute(routeCustomers);
      setOptimizedOrder(optimized);
      setIsOptimizing(false);
      alert(`Route optimized! Visit order calculated for ${optimized.length} customers.`);
    }, 1000);
  };

  // Calculate total route distance
  const calculateTotalDistance = (customers: Customer[]): number => {
    if (customers.length === 0) return 0;

    let totalDistance = 0;
    let currentLocation = STORE_LOCATION;

    customers.forEach(customer => {
      const customerGPS = extractGPSCoordinates(customer.location);
      if (customerGPS) {
        totalDistance += calculateDistance(
          currentLocation.lat, currentLocation.lng,
          customerGPS.lat, customerGPS.lng
        );
        currentLocation = { ...customerGPS, name: customer.name };
      }
    });

    // Add return distance to store
    if (customers.length > 0) {
      const lastCustomer = customers[customers.length - 1];
      const lastGPS = extractGPSCoordinates(lastCustomer.location);
      if (lastGPS) {
        totalDistance += calculateDistance(
          lastGPS.lat, lastGPS.lng,
          STORE_LOCATION.lat, STORE_LOCATION.lng
        );
      }
    }

    return totalDistance;
  };

  // Route management functions
  const handleAddRoute = async () => {
    const trimmedRouteName = newRouteName.trim();
    
    if (!trimmedRouteName) {
      alert('Route name cannot be empty!');
      return;
    }
    
    if (routes.includes(trimmedRouteName)) {
      alert('Route name already exists!');
      return;
    }

    try {
      // Import the addRoute function from supabaseClient
      const { addRoute } = await import('../../supabaseClient');
      const { data, error } = await addRoute(trimmedRouteName, currentUser?.id);

      if (error) {
        if (error.message?.includes('relation "routes" does not exist')) {
          console.warn('Routes table does not exist. Using local state only.');
          // Fall back to local state
          setRoutes(prev => [...prev, trimmedRouteName]);
          setNewRouteName('');
          setIsAddingRoute(false);
          alert('Route added successfully! (Note: Database table needs to be created. Please run the migration.)');
        } else {
          throw error;
        }
      } else {
        // Successfully saved to database - refresh from DB to ensure canonical state
        console.log('Route add response (data):', data);
        await loadRoutesFromDatabase();
        setNewRouteName('');
        setIsAddingRoute(false);
        alert('Route added successfully and saved to database!');
      }
    } catch (error) {
      console.error('Error adding route:', error);
      // Fall back to local state
      setRoutes(prev => [...prev, trimmedRouteName]);
      setNewRouteName('');
      setIsAddingRoute(false);
      alert('Route added successfully! (Note: Saved locally only due to database error)');
    }
  };

  const handleDeleteRoute = async (routeName: string) => {
    if (routeName === 'Unassigned') {
      alert('Cannot delete the Unassigned route');
      return;
    }
    
    if (!confirm(`Are you sure you want to delete "${routeName}"? All customers will be moved to Unassigned.`)) {
      return;
    }

    try {
      // Import the deleteRoute function from supabaseClient
      const { deleteRoute } = await import('../../supabaseClient');
      const { error } = await deleteRoute(routeName);

      if (error && !error.message?.includes('relation "routes" does not exist')) {
        alert(`Error deleting route: ${error.message}`);
        return;
      }

      // Update local state
      setRoutes(prev => prev.filter(route => route !== routeName));
      if (selectedRoute === routeName) {
        setSelectedRoute('All Routes');
      }

      // Refresh customer data to show updated routes
      await refetchData();
      
      alert('Route deleted successfully!');
    } catch (error) {
      console.error('Error deleting route:', error);
      alert('Error deleting route. Please try again.');
    }
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by this browser');
      return;
    }

    setIsGettingLocation(true);
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setGpsCoordinates({ lat: latitude, lng: longitude });
        
        // Update the location field with coordinates and try to get address
        const coordString = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        
        // Try to get human-readable address using reverse geocoding
        if (window.google && window.google.maps) {
          const geocoder = new window.google.maps.Geocoder();
          const latlng = { lat: latitude, lng: longitude };
          
          geocoder.geocode({ location: latlng }, (results, status) => {
            if (status === 'OK' && results && results[0]) {
              const address = results[0].formatted_address;
              setCurrentCustomer(prev => ({ 
                ...prev, 
                location: `${address} (GPS: ${coordString})`,
                gpsCoordinates: coordString 
              }));
            } else {
              setCurrentCustomer(prev => ({ 
                ...prev, 
                location: `GPS: ${coordString}`,
                gpsCoordinates: coordString 
              }));
            }
          });
        } else {
          // Fallback to coordinates only if Google Maps is not available
          setCurrentCustomer(prev => ({ 
            ...prev, 
            location: `GPS: ${coordString}`,
            gpsCoordinates: coordString 
          }));
        }
        
        setIsGettingLocation(false);
        alert('Location captured successfully!');
      },
      (error) => {
        setIsGettingLocation(false);
        console.error('Error getting location:', error);
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            alert('Location access denied. Please enable location permission and try again.');
            break;
          case error.POSITION_UNAVAILABLE:
            alert('Location information is unavailable.');
            break;
          case error.TIMEOUT:
            alert('Location request timed out.');
            break;
          default:
            alert('An unknown error occurred while getting location.');
            break;
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000 // 5 minutes
      }
    );
  };



  // Calculate outstanding for each customer from orders table
  const customerOutstandingMap: Record<string, number> = {};
  orders.forEach(order => {
    if (!order.customerId) return;
    // Treat null, undefined, or non-number as 0
    const cheque = order.chequeBalance == null || isNaN(Number(order.chequeBalance)) ? 0 : Number(order.chequeBalance);
    const credit = order.creditBalance == null || isNaN(Number(order.creditBalance)) ? 0 : Number(order.creditBalance);
    customerOutstandingMap[order.customerId] = (customerOutstandingMap[order.customerId] || 0) + cheque + credit;
  });

  const filteredCustomers = useMemo(() => {
    let filtered = customers;
    // New requirement: Sales reps should also see all customers; remove Sales-only filter

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(customer =>
        customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.location.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Supplier filter - based on customer's primary supplier from orders
    if (selectedSupplier !== 'all') {
      filtered = filtered.filter(customer => {
        const customerOrders = orders.filter(o => o.customerId === customer.id);
        if (customerOrders.length === 0) return selectedSupplier === 'Unassigned';

        // Find primary supplier based on spending
        const spendingBySupplier: Record<string, number> = {};
        customerOrders.forEach(order => {
          order.orderItems.forEach(item => {
            const product = products.find(p => p.id === item.productId);
            if (product) {
              const supplier = product.supplier || 'Unassigned';
              const itemTotal = item.price * item.quantity * (1 - (item.discount || 0) / 100);
              spendingBySupplier[supplier] = (spendingBySupplier[supplier] || 0) + itemTotal;
            }
          });
        });

        const primarySupplier = Object.keys(spendingBySupplier).reduce((a, b) => 
          spendingBySupplier[a] > spendingBySupplier[b] ? a : b
        ) || 'Unassigned';

        return primarySupplier === selectedSupplier;
      });
    }

    // Customer filter (for specific customer selection)
    if (selectedCustomer !== 'all') {
      filtered = filtered.filter(customer => customer.id === selectedCustomer);
    }

    // Category filter - based on most ordered category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(customer => {
        const customerOrders = orders.filter(o => o.customerId === customer.id);
        if (customerOrders.length === 0) return false;

        const categoryCount: Record<string, number> = {};
        customerOrders.forEach(order => {
          order.orderItems.forEach(item => {
            const product = products.find(p => p.id === item.productId);
            if (product) {
              categoryCount[product.category] = (categoryCount[product.category] || 0) + item.quantity;
            }
          });
        });

        const primaryCategory = Object.keys(categoryCount).reduce((a, b) => 
          categoryCount[a] > categoryCount[b] ? a : b
        ) || '';

        return primaryCategory === selectedCategory;
      });
    }

    // Date range filter - based on join date
    if (startDate) {
      filtered = filtered.filter(customer => customer.joinDate >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter(customer => customer.joinDate <= endDate);
    }

    return filtered;
  }, [customers, searchTerm, selectedSupplier, selectedCustomer, selectedCategory, startDate, endDate, orders, products]);

  // Reset filters function
  const resetFilters = () => {
    setSelectedSupplier('all');
    setSelectedCustomer('all');
    setSelectedCategory('all');
    setStartDate('');
    setEndDate('');
    setSearchTerm('');
  };
  
  const customersByRoute = useMemo(() => {
    const grouped = filteredCustomers.reduce((acc, customer) => {
        const route = customer.route || 'Unassigned';
        if (!acc[route]) {
            acc[route] = [];
        }
        acc[route].push(customer);
        return acc;
    }, {} as Record<string, Customer[]>);

    // Sort customers within each route by outstanding amount (highest first)
    Object.keys(grouped).forEach(routeName => {
        grouped[routeName].sort((a, b) => {
            const outstandingA = customerOutstandingMap[a.id] || 0;
            const outstandingB = customerOutstandingMap[b.id] || 0;
            return outstandingB - outstandingA; // Descending order (highest outstanding first)
        });
    });

    // Filter to show only selected route if a specific route is selected
    // If 'All Routes' is selected, show all routes, otherwise show only the selected route
    let finalGrouped: Record<string, Customer[]> = {};
    
    if (selectedRoute === 'All Routes' || !selectedRoute) {
        // Show all routes in defined order
        routes.forEach(route => {
            if (grouped[route]) {
                finalGrouped[route] = grouped[route];
            }
        });
    } else {
        // Show only the selected route
        if (grouped[selectedRoute]) {
            finalGrouped[selectedRoute] = grouped[selectedRoute];
        }
    }

    return finalGrouped;
  }, [filteredCustomers, routes, customerOutstandingMap, selectedRoute]);

  const allCustomers = Object.values(customersByRoute).flat() as Customer[];
  // Total outstanding from orders table
  const totalOutstanding = useMemo(() => 
    allCustomers.reduce((sum, customer) => sum + (customerOutstandingMap[customer.id] || 0), 0), 
    [allCustomers, customerOutstandingMap]
  );


  // Calculate total spent for each customer from delivered orders
  const customerTotalSpentMap: Record<string, number> = {};
  orders.forEach(order => {
    if (!order.customerId || order.status !== 'Delivered') return;
    // Sum up the total for each delivered order
    customerTotalSpentMap[order.customerId] = (customerTotalSpentMap[order.customerId] || 0) + (order.total || 0);
  });

  // Total spent for visible customers
  const totalSpent = useMemo(() => 
    allCustomers.reduce((sum, customer) => sum + (customerTotalSpentMap[customer.id] || 0), 0),
    [allCustomers, customerTotalSpentMap]
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          {onBackToRoutes && (
            <button
              onClick={onBackToRoutes}
              className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              ← Back to Routes
            </button>
          )}
          <div>
            <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
              {propSelectedRoute && propSelectedRoute !== 'All Routes' ? (
                <>
                  <span className="text-2xl mr-2">{propSelectedRoute === 'Unassigned' ? '📋' : '🚛'}</span>
                  {propSelectedRoute} Customers
                </>
              ) : (
                'All Customers'
              )}
            </h1>
            {propSelectedRoute && propSelectedRoute !== 'All Routes' && (
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                Managing customers in {propSelectedRoute} delivery route
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {/* Export Buttons */}
          <button
            onClick={() => exportCustomers(filteredCustomers, 'csv')}
            className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
            title="Export as CSV"
          >
            📊 CSV
          </button>
          <button
            onClick={() => exportCustomers(filteredCustomers, 'xlsx')}
            className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
            title="Export as Excel"
          >
            📋 Excel
          </button>
          {canEdit && (
              <button 
                  onClick={() => openModal('add')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
              Add Customer to {selectedRoute === 'All Routes' ? 'Unassigned' : selectedRoute}
              </button>
          )}
        </div>
      </div>

      {/* Route Management Section - Only show when not in specific route view */}
      {!propSelectedRoute && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Route Selection</h2>
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  {selectedRoute === 'All Routes' ? (
                    <span className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 px-3 py-1 rounded-full">
                      📊 Showing all {Object.keys(customersByRoute).length} routes
                    </span>
                  ) : (
                    <span className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-3 py-1 rounded-full">
                      🚛 Filtered to: {selectedRoute} ({customersByRoute[selectedRoute]?.length || 0} customers)
                    </span>
                  )}
                </div>
              </div>
            <div className="flex flex-wrap gap-2">
              {/* All Routes Button */}
              <button
                onClick={() => setSelectedRoute('All Routes')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                  selectedRoute === 'All Routes'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                📊 All Routes
              </button>
              
              {routes.map(route => (
                <button
                  key={route}
                  onClick={() => setSelectedRoute(route)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                    selectedRoute === route
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  🚛 {route}
                  {route !== 'Unassigned' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteRoute(route);
                      }}
                      className="ml-1 text-red-500 hover:text-red-700 text-xs"
                      title="Delete route"
                    >
                      ✕
                    </button>
                  )}
                </button>
              ))}
              
              {/* Add New Route */}
              {isAddingRoute ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Route name"
                    value={newRouteName}
                    onChange={(e) => setNewRouteName(e.target.value)}
                    className="px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    onKeyPress={(e) => e.key === 'Enter' && handleAddRoute()}
                  />
                  <button
                    onClick={handleAddRoute}
                    className="px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => {
                      setIsAddingRoute(false);
                      setNewRouteName('');
                    }}
                    className="px-3 py-2 bg-slate-400 text-white text-sm rounded hover:bg-slate-500"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsAddingRoute(true)}
                  className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                >
                  ➕ Add Route
                </button>
              )}
            </div>
          </div>
          
          {/* Route Optimization Section */}
          {selectedRoute !== 'Unassigned' && selectedRoute !== 'All Routes' && customersByRoute[selectedRoute]?.length > 0 && (
            <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div>
                  <h3 className="text-md font-medium text-slate-800 dark:text-slate-100">
                    🗺️ Route Optimization for {selectedRoute}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Optimize delivery order from Distribution Center (9.3845°N, 80.4087°E)
                  </p>
                  {optimizedOrder.length > 0 && selectedRoute !== 'Unassigned' && 
                   optimizedOrder === customersByRoute[selectedRoute] && (
                    <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                      📏 Total Distance: {calculateTotalDistance(optimizedOrder).toFixed(2)} km
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleOptimizeRoute}
                    disabled={isOptimizing}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                      isOptimizing
                        ? 'bg-slate-400 cursor-not-allowed text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {isOptimizing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Optimizing...
                      </>
                    ) : (
                      <>
                        🎯 Optimize Route
                      </>
                    )}
                  </button>
                  {optimizedOrder.length > 0 && (
                    <button
                      onClick={() => window.open(`https://www.google.com/maps/dir/${STORE_LOCATION.lat},${STORE_LOCATION.lng}/${optimizedOrder.map(c => {
                        const gps = extractGPSCoordinates(c.location);
                        return gps ? `${gps.lat},${gps.lng}` : '';
                      }).filter(Boolean).join('/')}`, '_blank')}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                      title="Open optimized route in Google Maps"
                    >
                      🗺️ View in Maps
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        </div>
      )}
      
      {/* Route-specific info when viewing a specific route */}
      {propSelectedRoute && propSelectedRoute !== 'All Routes' && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                {propSelectedRoute === 'Unassigned' ? '📋' : '🚛'} {propSelectedRoute} Route Details
              </h2>
              <div className="flex items-center gap-4 mt-2">
                <span className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-3 py-1 rounded-full text-sm">
                  {customersByRoute[propSelectedRoute]?.length || 0} customers
                </span>
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  Outstanding: {formatCurrency(
                    (customersByRoute[propSelectedRoute] || []).reduce((sum, customer) => 
                      sum + (customerOutstandingMap[customer.id] || 0), 0
                    ), currency
                  )}
                </span>
              </div>
            </div>
            
            {/* Route Optimization for specific route */}
            {propSelectedRoute !== 'Unassigned' && customersByRoute[propSelectedRoute]?.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={handleOptimizeRoute}
                  disabled={isOptimizing}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                    isOptimizing
                      ? 'bg-slate-400 cursor-not-allowed text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {isOptimizing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Optimizing...
                    </>
                  ) : (
                    <>
                      🎯 Optimize Route
                    </>
                  )}
                </button>
                {optimizedOrder.length > 0 && (
                  <button
                    onClick={() => window.open(`https://www.google.com/maps/dir/${STORE_LOCATION.lat},${STORE_LOCATION.lng}/${optimizedOrder.map(c => {
                      const gps = extractGPSCoordinates(c.location);
                      return gps ? `${gps.lat},${gps.lng}` : '';
                    }).filter(Boolean).join('/')}`, '_blank')}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                    title="Open optimized route in Google Maps"
                  >
                    🗺️ View in Maps
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filter Section */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 flex-1">
            {/* Supplier Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Primary Supplier
              </label>
              <select
                value={selectedSupplier}
                onChange={(e) => setSelectedSupplier(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Suppliers</option>
                <option value="Unassigned">Unassigned</option>
                {suppliers.map(supplier => (
                  <option key={supplier.id} value={supplier.name}>{supplier.name}</option>
                ))}
              </select>
            </div>

            {/* Customer Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Specific Customer
              </label>
              <select
                value={selectedCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Customers</option>
                {customers.map(customer => (
                  <option key={customer.id} value={customer.id}>{customer.name}</option>
                ))}
              </select>
            </div>

            {/* Category Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Primary Category
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Categories</option>
                {Array.from(new Set(products.map(p => p.category))).sort().map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Join Date From
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Join Date To
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Reset Button */}
          <button
            onClick={resetFilters}
            className="px-4 py-2 bg-slate-500 hover:bg-slate-600 text-white rounded-lg transition-colors whitespace-nowrap"
          >
            Reset Filters
          </button>
        </div>
      </div>

       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader>
          <CardTitle>Total Customers</CardTitle>
          <CardDescription>Visible in current view</CardDescription>
        </CardHeader>
        <CardContent>
                    <p className="text-3xl font-bold text-slate-900 dark:text-white">{allCustomers.length}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Total Spent</CardTitle>
          <CardDescription>For visible customers</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-green-600">{formatCurrency(totalSpent, currency)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Total Outstanding</CardTitle>
          <CardDescription>For visible customers</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-red-500">{formatCurrency(totalOutstanding, currency)}</p>
        </CardContent>
      </Card>
        </div>


      <Card>
        <CardHeader>
          <CardTitle>Customer List</CardTitle>
          <CardDescription>Manage your customer information, organized by delivery routes.</CardDescription>
           <div className="pt-4">
             <input
                type="text"
                placeholder="Search customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full max-w-sm px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </CardHeader>
        <CardContent>
           <div className="space-y-8">
            {Object.entries(customersByRoute).map(([routeName, routeCustomers]) => {
              // Use optimized order if available for selected route, otherwise use default order
              const displayCustomers = (routeName === selectedRoute && optimizedOrder.length > 0) 
                ? optimizedOrder 
                : routeCustomers as Customer[];
              
              return (
                <div key={routeName}>
                  <div className="flex items-center space-x-3 mb-4">
                    <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      {routeName === 'Unassigned' ? '📋' : '🚛'} {routeName}
                    </h2>
                    <Badge variant="default">{(routeCustomers as Customer[]).length} {(routeCustomers as Customer[]).length === 1 ? 'Customer' : 'Customers'}</Badge>
                    {routeName === 'Unassigned' && (
                      <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                        {(routeCustomers as Customer[]).filter(c => suggestRouteForCustomer(c)).length} Suggestions Available
                      </Badge>
                    )}
                    {routeName === selectedRoute && (
                      <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                        Selected Route
                      </Badge>
                    )}
                    {routeName === selectedRoute && optimizedOrder.length > 0 && (
                      <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        🎯 Optimized Order
                      </Badge>
                    )}
                  </div>
                 <div className="overflow-x-auto border dark:border-slate-700 rounded-lg">
                    <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                      <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-400">
                        <tr>
                          <th scope="col" className="px-4 py-3 w-1/2">Customer</th>
                          <th scope="col" className="px-4 py-3 w-1/4">Join Date</th>
                          <th scope="col" className="px-4 py-3 w-1/4">Outstanding & Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayCustomers.map((customer, index) => {
                          // Calculate primary supplier for this customer
                          const customerOrders = orders.filter(o => o.customerId === customer.id);
                          let primarySupplier = 'Unassigned';
                          let primaryCategory = 'N/A';
                          // Precompute suggested route for Unassigned customers to simplify JSX
                          const suggestedRouteInline = routeName === 'Unassigned' ? suggestRouteForCustomer(customer) : null;
                          
                          if (customerOrders.length > 0) {
                            // Calculate primary supplier based on spending
                            const spendingBySupplier: Record<string, number> = {};
                            const categoryCount: Record<string, number> = {};
                            
                            customerOrders.forEach(order => {
                              order.orderItems.forEach(item => {
                                const product = products.find(p => p.id === item.productId);
                                if (product) {
                                  // Supplier calculation
                                  const supplier = product.supplier || 'Unassigned';
                                  const itemTotal = item.price * item.quantity * (1 - (item.discount || 0) / 100);
                                  spendingBySupplier[supplier] = (spendingBySupplier[supplier] || 0) + itemTotal;
                                  
                                  // Category calculation
                                  categoryCount[product.category] = (categoryCount[product.category] || 0) + item.quantity;
                                }
                              });
                            });
                            
                            // Get primary supplier and category
                            if (Object.keys(spendingBySupplier).length > 0) {
                              primarySupplier = Object.keys(spendingBySupplier).reduce((a, b) => 
                                spendingBySupplier[a] > spendingBySupplier[b] ? a : b
                              );
                            }
                            
                            if (Object.keys(categoryCount).length > 0) {
                              primaryCategory = Object.keys(categoryCount).reduce((a, b) => 
                                categoryCount[a] > categoryCount[b] ? a : b
                              );
                            }
                          }
                          
                          return (
                            <tr key={customer.id} className="border-b dark:bg-slate-800 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600">
                              <td className="px-4 py-4 font-medium text-slate-900 dark:text-white w-1/2">
                                <div className="flex items-center space-x-3">
                                  {/* Visit order number for optimized routes */}
                                  {routeName === selectedRoute && optimizedOrder.length > 0 && (
                                    <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                                      {index + 1}
                                    </div>
                                  )}
                                  <img src={customer.avatarUrl} alt={customer.name} className="w-12 h-12 rounded-full flex-shrink-0" />
                                  <div className="min-w-0 flex-1">
                                    <div className="font-semibold text-sm truncate flex items-center gap-2">
                                      {customer.name}
                                      {routeName === selectedRoute && optimizedOrder.length > 0 && (
                                        <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded dark:bg-blue-900 dark:text-blue-300">
                                          Visit #{index + 1}
                                        </span>
                                      )}
                                      {routeName === 'Unassigned' && (
                                        suggestedRouteInline ? (
                                          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded dark:bg-orange-900 dark:text-orange-300">
                                            Suggest: {suggestedRouteInline}
                                          </span>
                                        ) : (
                                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded dark:bg-slate-700 dark:text-slate-400">
                                            No GPS
                                          </span>
                                        )
                                      )}
                                    </div>
                                    {renderLocationWithGPS(customer.location)}
                                    <div className="text-xs text-blue-600 dark:text-blue-400 truncate">{customer.phone}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-4 text-sm w-1/4">
                                <div className="font-medium">
                                  {customer.joinDate ? new Date(customer.joinDate).toLocaleDateString('en-GB') : 'N/A'}
                                </div>
                              </td>
                              <td className="px-4 py-4 w-1/4">
                                <div className="flex flex-col space-y-2">
                                  <div className={`font-bold text-lg ${(customerOutstandingMap[customer.id] || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    {formatCurrency(customerOutstandingMap[customer.id] || 0, currency)}
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {canEdit && (
                                      <button onClick={() => openModal('edit', customer)} className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium text-xs bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded">
                                        Edit
                                      </button>
                                    )}
                                    {routeName === 'Unassigned' && canEdit && suggestedRouteInline && (
                                      <button 
                                        onClick={async () => {
                                          if (confirm(`Assign ${customer.name} to ${suggestedRouteInline}?`)) {
                                            try {
                                              const { error } = await supabase.from('customers').update({
                                                route: suggestedRouteInline
                                              }).eq('id', customer.id);
                                              if (error) {
                                                alert(`Error: ${error.message}`);
                                              } else {
                                                alert(`${customer.name} assigned to ${suggestedRouteInline}!`);
                                                await refetchData();
                                              }
                                            } catch (err) {
                                              alert('Failed to update route assignment');
                                            }
                                          }
                                        }}
                                        className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 font-medium text-xs bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded"
                                      >
                                        Assign to {suggestedRouteInline}
                                      </button>
                                    )}
                                    {canDelete && (
                                      <button onClick={() => openDeleteConfirm(customer)} className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-medium text-xs bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded">
                                        Delete
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
            {Object.keys(customersByRoute).length === 0 && (
              <div className="text-center py-10">
                <p className="text-slate-500 dark:text-slate-400">No customers found matching your criteria.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
        
        {/* Add/Edit Modal */}
        <Modal isOpen={isModalOpen} onClose={closeModal} title={modalMode === 'add' ? 'Add New Customer' : 'Edit Customer'}>
            <div className="p-6 space-y-4">
                <div className="flex flex-col items-center space-y-2">
                    <img 
                        src={currentCustomer.avatarUrl || '/lord-shiva-avatar.jpg'} 
                        alt="Avatar preview" 
                        className="w-24 h-24 rounded-full object-cover border-4 border-slate-200 dark:border-slate-600"
                    />
                    <label htmlFor="avatar-upload-customer" className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                        Upload Photo
                        <input 
                            id="avatar-upload-customer" 
                            type="file" 
                            className="hidden" 
                            accept="image/png, image/jpeg, image/gif"
                            onChange={handleAvatarChange}
                        />
                    </label>
                </div>
                 <div>
                    <label htmlFor="name" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Name</label>
                    <input
                        type="text"
                        id="name"
                        value={currentCustomer.name || ''}
                        onChange={(e) => setCurrentCustomer({ ...currentCustomer, name: e.target.value })}
                        className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:placeholder-slate-400 dark:text-white"
                        required
                    />
                </div>
                 <div>
                    <label htmlFor="email" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Email <span className="text-slate-400">(Optional)</span></label>
                    <input
                        type="email"
                        id="email"
                        value={currentCustomer.email || ''}
                        onChange={(e) => setCurrentCustomer({ ...currentCustomer, email: e.target.value })}
                        className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:placeholder-slate-400 dark:text-white"
                        placeholder="customer@example.com (optional)"
                    />
                </div>
                <div>
                    <label htmlFor="phone" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Phone Number <span className="text-red-500">*</span></label>
                    <input
                        type="tel"
                        id="phone"
                        value={currentCustomer.phone || ''}
                        onChange={(e) => setCurrentCustomer({ ...currentCustomer, phone: e.target.value })}
                        className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:placeholder-slate-400 dark:text-white"
                        placeholder="Enter unique phone number"
                        required
                    />
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Each phone number must be unique</p>
                </div>
                <div>
                    <label htmlFor="location" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Location</label>
                    <div className="space-y-2">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                id="location"
                                value={currentCustomer.location || ''}
                                onChange={(e) => setCurrentCustomer({ ...currentCustomer, location: e.target.value })}
                                className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:placeholder-slate-400 dark:text-white"
                                placeholder="Enter address or use GPS"
                                required
                            />
                            <button
                                type="button"
                                onClick={handleGetLocation}
                                disabled={isGettingLocation}
                                className={`px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors flex items-center gap-2 ${
                                    isGettingLocation 
                                        ? 'bg-slate-400 cursor-not-allowed' 
                                        : 'bg-green-600 hover:bg-green-700 focus:ring-4 focus:ring-green-300'
                                }`}
                                title="Get current GPS location"
                            >
                                {isGettingLocation ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        <span className="hidden sm:inline">Getting...</span>
                                    </>
                                ) : (
                                    <>
                                        📍
                                        <span className="hidden sm:inline">GPS</span>
                                    </>
                                )}
                            </button>
                        </div>
                        {gpsCoordinates && (
                            <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-600 p-2 rounded">
                                📍 GPS: {gpsCoordinates.lat.toFixed(6)}, {gpsCoordinates.lng.toFixed(6)}
                            </div>
                        )}
                    </div>
                </div>
                <div>
                    <label htmlFor="route" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Route Assignment <span className="text-red-500">*</span></label>
                    <select
                        id="route"
                        value={currentCustomer.route || 'Unassigned'}
                        onChange={(e) => setCurrentCustomer({ ...currentCustomer, route: e.target.value })}
                        className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:placeholder-slate-400 dark:text-white"
                        required
                    >
                        {routes.map(route => (
                            <option key={route} value={route}>
                                🚛 {route}
                            </option>
                        ))}
                    </select>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Select which delivery route this customer belongs to</p>
                </div>
                 {modalMode === 'edit' && (
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="outstandingBalance" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Outstanding Balance</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{currency}</span>
                                <input
                                    type="number"
                                    id="outstandingBalance"
                                    value={currentCustomer.outstandingBalance || ''}
                                    onChange={(e) => setCurrentCustomer({ ...currentCustomer, outstandingBalance: parseFloat(e.target.value) || 0 })}
                                    className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 pl-12 dark:bg-slate-700 dark:border-slate-600 dark:placeholder-slate-400 dark:text-white"
                                    readOnly
                                />
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                This amount is calculated from pending orders and payments
                            </p>
                        </div>
                        
                    </div>
                )}
            </div>
             <div className="flex items-center justify-end p-6 space-x-2 border-t border-slate-200 rounded-b dark:border-slate-600">
                <button onClick={closeModal} type="button" className="text-slate-500 bg-white hover:bg-slate-100 focus:ring-4 focus:outline-none focus:ring-blue-300 rounded-lg border border-slate-200 text-sm font-medium px-5 py-2.5 hover:text-slate-900 focus:z-10 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-500 dark:hover:text-white dark:hover:bg-slate-600">
                    Cancel
                </button>
                <button onClick={handleSave} type="button" className="text-white bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700">
                    Save Customer
                </button>
            </div>
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal isOpen={!!customerToDelete} onClose={closeDeleteConfirm} title="Confirm Deletion">
      <div className="p-6">
        <p className="text-slate-600 dark:text-slate-300">Are you sure you want to delete the customer &quot;{customerToDelete?.name}&quot;?</p>
      </div>
            <div className="flex items-center justify-end p-6 space-x-2 border-t border-slate-200 rounded-b dark:border-slate-600">
                <button onClick={closeDeleteConfirm} type="button" className="text-slate-500 bg-white hover:bg-slate-100 focus:ring-4 focus:outline-none focus:ring-blue-300 rounded-lg border border-slate-200 text-sm font-medium px-5 py-2.5 hover:text-slate-900 focus:z-10 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-500 dark:hover:text-white dark:hover:bg-slate-600">
                    Cancel
                </button>
                <button onClick={handleDelete} type="button" className="text-white bg-red-600 hover:bg-red-700 focus:ring-4 focus:outline-none focus:ring-red-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-red-600 dark:hover:bg-red-700">
                    Delete
                </button>
            </div>
        </Modal>
    </div>
  );
};

export default Customers;
