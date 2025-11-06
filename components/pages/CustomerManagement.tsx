import React, { useState } from 'react';
import { RouteOverview } from './RouteOverview';

// Import a simplified customer list component
import { Customer, UserRole, OrderStatus } from '../../types';

// Extend Window interface for phone validation timeout and Google Maps
declare global {
  interface Window {
    phoneValidationTimeout: NodeJS.Timeout;
    google: any;
  }
}
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/Card';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabaseClient';
import { validatePhoneFormat, normalizePhoneNumber } from '../../utils/phoneValidation';
import { confirmSecureDelete } from '../../utils/passwordConfirmation';

const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount).replace('$', `${currency} `);
};

// Helper function to format phone numbers nicely
const formatPhoneNumber = (phone: string) => {
  if (!phone) return '';
  
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');
  
  // Handle Sri Lankan numbers (+94)
  if (digits.startsWith('94') && digits.length === 11) {
    // Format: +94 XX XXX XXXX
    return `+94 ${digits.slice(2, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  
  // Handle local numbers (0XXXXXXXXX)
  if (digits.startsWith('0') && digits.length === 10) {
    // Format: 0XX XXX XXXX
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  
  // Handle 9-digit numbers (XXXXXXXXX) 
  if (digits.length === 9) {
    // Format: XX XXX XXXX
    return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
  }
  
  // Default: return as-is if doesn't match expected patterns
  return phone;
};

// Helper function to extract GPS coordinates from location string and create clickable link
const renderLocationWithGPS = (location: string) => {
  const gpsMatch = location.match(/GPS:\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
  
  if (gpsMatch) {
    const [fullMatch, lat, lng] = gpsMatch;
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const addressPart = location.replace(fullMatch, '').replace(/\s*\(\s*\)\s*$/, '').trim();
    const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
    
    return (
      <div className="text-xs text-slate-500 dark:text-slate-400">
        {addressPart && (
          <div className="truncate">{addressPart}</div>
        )}
        <button 
          onClick={() => window.open(mapsUrl, '_blank')}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-colors"
          title={`Open location in Google Maps (${latitude}, ${longitude})`}
        >
          📍 GPS: {latitude.toFixed(4)}, {longitude.toFixed(4)}
        </button>
      </div>
    );
  }
  
  return (
    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{location}</div>
  );
};

interface RouteCustomerListProps {
  selectedRoute: string;
  onBackToRoutes: () => void;
}

const RouteCustomerList: React.FC<RouteCustomerListProps> = ({ selectedRoute, onBackToRoutes }) => {
  const { customers, orders, refetchData } = useData();
  const { currentUser } = useAuth();
  const currency = currentUser?.settings.currency || 'LKR';
  
  const [searchTerm, setSearchTerm] = useState('');
  const [orderStateFilter, setOrderStateFilter] = useState<'all' | 'delivered' | 'pending' | 'no-orders'>('all');
  const [outstandingFilter, setOutstandingFilter] = useState<'all' | 'withOutstanding' | 'noOutstanding'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [currentCustomer, setCurrentCustomer] = useState<Partial<Customer>>({});
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [phoneValidation, setPhoneValidation] = useState<{
    isValid: boolean;
    message: string;
    isChecking: boolean;
  }>({ isValid: true, message: '', isChecking: false });
  
  // Location input states
  const [locationTab, setLocationTab] = useState<'address' | 'gps'>('gps');
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [gpsCoordinates, setGpsCoordinates] = useState<{lat: number, lng: number} | null>(null);

  const canEdit = currentUser?.role === UserRole.Admin || 
                   currentUser?.role === UserRole.Manager ||
                   currentUser?.role === UserRole.Driver ||
                   currentUser?.role === UserRole.Sales;

  const canDelete = currentUser?.role === UserRole.Admin;

  // Calculate metrics for each customer from orders table
  const customerOutstandingMap: Record<string, number> = {};
  const customerSalesMap: Record<string, number> = {};
  const customerOrderCountMap: Record<string, number> = {};
  
  orders.forEach(order => {
    if (!order.customerId) return;
    
    // Outstanding calculation
    const cheque = order.chequeBalance == null || isNaN(Number(order.chequeBalance)) ? 0 : Number(order.chequeBalance);
    const credit = order.creditBalance == null || isNaN(Number(order.creditBalance)) ? 0 : Number(order.creditBalance);
    customerOutstandingMap[order.customerId] = (customerOutstandingMap[order.customerId] || 0) + cheque + credit;
    
    // Sales calculation
    const orderTotal = order.total == null || isNaN(Number(order.total)) ? 0 : Number(order.total);
    customerSalesMap[order.customerId] = (customerSalesMap[order.customerId] || 0) + orderTotal;
    
    // Order count calculation
    customerOrderCountMap[order.customerId] = (customerOrderCountMap[order.customerId] || 0) + 1;
  });

  // Filter customers by selected route and search term (show all customers for all roles)
  const filteredCustomers = customers.filter(customer => {
    const route = customer.route || 'Unassigned';
    const matchesRoute = selectedRoute === 'All Routes' || route === selectedRoute;
    const matchesSearch = !searchTerm || 
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.location.toLowerCase().includes(searchTerm.toLowerCase());
    
    // New requirement: All roles (including Sales) can view all customers route-wise
    const matchesSalesRepAccess = true;

    if (!(matchesRoute && matchesSearch && matchesSalesRepAccess)) return false;

    // Apply order-state filter
    const custOrders = orders.filter(o => o.customerId === customer.id);
    const hasPending = custOrders.some(o => o.status && o.status !== OrderStatus.Delivered);
    const hasDelivered = custOrders.some(o => o.status === OrderStatus.Delivered);
    const noOrders = custOrders.length === 0;

    if (orderStateFilter === 'pending' && !hasPending) return false;
    if (orderStateFilter === 'delivered' && !hasDelivered) return false;
    if (orderStateFilter === 'no-orders' && !noOrders) return false;

    // Apply outstanding filter
    const outstanding = customerOutstandingMap[customer.id] || 0;
    if (outstandingFilter === 'withOutstanding' && outstanding <= 0) return false;
    if (outstandingFilter === 'noOutstanding' && outstanding > 0) return false;

    return true;
  });

  // Build a quick map of which customers have pending orders so we can sort
  const customerHasPendingMap: Record<string, boolean> = {};
  filteredCustomers.forEach(customer => {
    const custOrders = orders.filter(o => o.customerId === customer.id);
    customerHasPendingMap[customer.id] = custOrders.some(o => o.status && o.status !== OrderStatus.Delivered);
  });

  // Sort customers so delivered/no-orders (green) appear first, pending (yellow) appear after.
  const sortedCustomers = filteredCustomers.slice().sort((a, b) => {
    const aPending = customerHasPendingMap[a.id] || false;
    const bPending = customerHasPendingMap[b.id] || false;
    if (aPending === bPending) return (a.name || '').localeCompare(b.name || '');
    return aPending ? 1 : -1; // put pending (true) after non-pending (false)
  });

  const openModal = (mode: 'add' | 'edit', customer?: Customer) => {
    setModalMode(mode);
    if (mode === 'edit' && customer) {
      setCurrentCustomer({ ...customer });
      // Set GPS coordinates if they exist in the location string
      if (customer.location) {
        const gpsMatch = customer.location.match(/GPS:\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
        if (gpsMatch) {
          const [, lat, lng] = gpsMatch;
          setGpsCoordinates({ lat: parseFloat(lat), lng: parseFloat(lng) });
        } else {
          setGpsCoordinates(null);
        }
      } else {
        setGpsCoordinates(null);
      }
    } else {
      const routeToAssign = selectedRoute === 'All Routes' ? 'Unassigned' : selectedRoute;
      console.log('🔍 Debug Add Customer - selectedRoute:', selectedRoute, 'routeToAssign:', routeToAssign);
      
      setCurrentCustomer({ 
        name: '', 
        email: '', 
        phone: '', 
        location: '', 
        route: routeToAssign, 
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
    setPhoneValidation({ isValid: true, message: '', isChecking: false });

    setGpsCoordinates(null);
    setIsGettingLocation(false);
  };

  // GPS location capture function
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
        
        // Update the location field with coordinates
        const coordString = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        
        // Try to get human-readable address using reverse geocoding (if available)
        if (window.google && (window.google as any).maps) {
          const geocoder = new (window.google as any).maps.Geocoder();
          const latlng = { lat: latitude, lng: longitude };
          
          geocoder.geocode({ location: latlng }, (results: any, status: any) => {
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
        alert('GPS location captured successfully!');
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

  // Real-time phone validation function
  const validatePhoneNumber = async (phone: string) => {
    if (!phone.trim()) {
      setPhoneValidation({ isValid: true, message: '', isChecking: false });
      return;
    }

    // First validate format
    const formatValidation = validatePhoneFormat(phone);
    if (!formatValidation.isValid) {
      setPhoneValidation({ 
        isValid: false, 
        message: `❌ ${formatValidation.message}`, 
        isChecking: false 
      });
      return;
    }

    setPhoneValidation({ isValid: true, message: '⏳ Checking availability...', isChecking: true });

    try {
      // Normalize phone number for comparison
      const normalizedPhone = normalizePhoneNumber(phone.trim());
      
      // Check for existing phone numbers (check both original and normalized formats)
      const { data: existingCustomers, error } = await supabase
        .from('customers')
        .select('id, name, phone')
        .or(`phone.eq.${phone.trim()},phone.eq.${normalizedPhone}`)
        .neq('id', modalMode === 'edit' ? (currentCustomer.id || '') : 'never-match');

      if (error) {
        setPhoneValidation({ 
          isValid: false, 
          message: '❌ Error checking phone number availability', 
          isChecking: false 
        });
        return;
      }

      if (existingCustomers && existingCustomers.length > 0) {
        setPhoneValidation({ 
          isValid: false, 
          message: `❌ Already registered to: ${existingCustomers[0].name}`, 
          isChecking: false 
        });
      } else {
        setPhoneValidation({ 
          isValid: true, 
          message: '✅ Phone number available', 
          isChecking: false 
        });
      }
    } catch (error) {
      setPhoneValidation({ 
        isValid: false, 
        message: '❌ Error validating phone number', 
        isChecking: false 
      });
    }
  };

  const handleSave = async () => {
    try {
      if (!currentCustomer.name || !currentCustomer.phone) {
        alert('Please fill in the customer name and phone number');
        return;
      }

      // Validate GPS location is required
      if (!currentCustomer.location || !currentCustomer.location.includes('GPS:')) {
        alert('GPS location is required. Please capture GPS coordinates before saving the customer.');
        return;
      }

      // Validate phone number format using utility
      const formatValidation = validatePhoneFormat(currentCustomer.phone);
      if (!formatValidation.isValid) {
        alert(formatValidation.message);
        return;
      }

      // Check for phone number uniqueness
      const phoneToCheck = normalizePhoneNumber(currentCustomer.phone);
      
  if (modalMode === 'add') {
        // For new customers, check if phone number already exists
        const { data: existingCustomers, error: checkError } = await supabase
          .from('customers')
          .select('id, name, phone')
          .eq('phone', phoneToCheck);
        
        if (checkError) {
          alert(`Error checking phone number: ${checkError.message}`);
          return;
        }
        
        if (existingCustomers && existingCustomers.length > 0) {
          alert(`This phone number (${phoneToCheck}) is already registered with customer "${existingCustomers[0].name}". Please use a different phone number.`);
          return;
        }

        const routeValue = currentCustomer.route || selectedRoute;
        console.log('🔍 Debug Save Customer - currentCustomer.route:', currentCustomer.route, 'selectedRoute:', selectedRoute, 'final routeValue:', routeValue);
        
        const uniqueId = `CUST${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`;
        const newCustomer = {
          id: uniqueId,
          name: currentCustomer.name || '',
          email: currentCustomer.email || '',
          phone: phoneToCheck,
          location: currentCustomer.location || '',
          route: routeValue,
          joindate: new Date().toISOString().split('T')[0],
          totalspent: 0,
          outstandingbalance: 0,
          avatarurl: currentCustomer.avatarUrl || `/lord-shiva-avatar.jpg`,
        };

        // Try insert with created_by first; if column missing, retry without
        let insertError: any = null;
        const attemptWithCreatedBy = { ...newCustomer, created_by: currentUser?.id || 'system' } as any;
        try {
          const { error } = await supabase.from('customers').insert([attemptWithCreatedBy]);
          insertError = error || null;
        } catch (e) {
          insertError = e;
        }

        if (insertError) {
          const msg = String(insertError?.message || '').toLowerCase();
          const code = String(insertError?.code || '').toLowerCase();
          const details = String(insertError?.details || '').toLowerCase();
          const missingCreatedBy = code === '42703' || code === 'pgrst257' || msg.includes('created_by') || details.includes('created_by');
          const uniqueViolation = msg.includes('duplicate') || msg.includes('unique');

          if (uniqueViolation) {
            alert(`This phone number (${phoneToCheck}) is already registered. Please use a different phone number.`);
            return;
          }

          if (missingCreatedBy) {
            const { error: fallbackError } = await supabase.from('customers').insert([newCustomer]);
            if (fallbackError) {
              alert(`Error adding customer: ${fallbackError.message}`);
              return;
            }
            alert('Customer added successfully! Note: Run migration to add created_by column for sales-rep segregation.');
          } else {
            alert(`Error adding customer: ${insertError.message || 'Unknown error'}`);
            return;
          }
        } else {
          alert('Customer added successfully!');
        }
      } else {
        // For editing customers, check if phone number exists for other customers
        const originalCustomer = customers.find(c => c.id === currentCustomer.id);
        
        if (originalCustomer && originalCustomer.phone !== phoneToCheck) {
          // Phone number is being changed, check if new number already exists
          const { data: existingCustomers, error: checkError } = await supabase
            .from('customers')
            .select('id, name, phone')
            .eq('phone', phoneToCheck)
            .neq('id', currentCustomer.id); // Exclude current customer
          
          if (checkError) {
            alert(`Error checking phone number: ${checkError.message}`);
            return;
          }
          
          if (existingCustomers && existingCustomers.length > 0) {
            alert(`This phone number (${phoneToCheck}) is already registered with customer "${existingCustomers[0].name}". Please use a different phone number.`);
            return;
          }
        }

        const { error } = await supabase.from('customers').update({
          name: currentCustomer.name,
          email: currentCustomer.email,
          phone: phoneToCheck,
          location: currentCustomer.location,
          route: currentCustomer.route,
          avatarurl: currentCustomer.avatarUrl,
        }).eq('id', currentCustomer.id);
        
        if (error) {
          // Check if error is due to unique constraint violation
          if (error.message.includes('duplicate') || error.message.includes('unique')) {
            alert(`This phone number (${phoneToCheck}) is already registered with another customer. Please use a different phone number.`);
          } else {
            alert(`Error updating customer: ${error.message}`);
          }
          return;
        }
        alert('Customer updated successfully!');
      }
      
      await refetchData();
      closeModal();
    } catch (error) {
      console.error('Unexpected error:', error);
      alert('An unexpected error occurred. Please try again.');
    }
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
      setCustomerToDelete(null);
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
        await refetchData();
        setCustomerToDelete(null);
      } catch (error) {
        console.error('Unexpected error deleting customer:', error);
        alert('An unexpected error occurred while deleting. Please try again.');
      }
    }
  };

  const totalOutstanding = filteredCustomers.reduce((sum, customer) => 
    sum + (customerOutstandingMap[customer.id] || 0), 0
  );

  // Gradient patterns and route->gradient mapping (so all customers on same route share color)
  const gradientPatterns = [
    'bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-900/30 dark:via-indigo-900/30 dark:to-purple-900/30 border-l-4 border-blue-500 shadow-blue-100',
    'bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-emerald-900/30 dark:via-teal-900/30 dark:to-cyan-900/30 border-l-4 border-emerald-500 shadow-emerald-100',
    'bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 border-l-4 border-orange-500 shadow-orange-100',
    'bg-gradient-to-br from-rose-50 via-pink-50 to-fuchsia-50 dark:from-rose-900/30 dark:via-pink-900/30 dark:to-fuchsia-900/30 border-l-4 border-rose-500 shadow-rose-100',
    'bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-50 dark:from-violet-900/30 dark:via-purple-900/30 dark:to-indigo-900/30 border-l-4 border-violet-500 shadow-violet-100',
    'bg-gradient-to-br from-cyan-50 via-sky-50 to-blue-50 dark:from-cyan-900/30 dark:via-sky-900/30 dark:to-blue-900/30 border-l-4 border-cyan-500 shadow-cyan-100',
    'bg-gradient-to-br from-lime-50 via-green-50 to-emerald-50 dark:from-lime-900/30 dark:via-green-900/30 dark:to-emerald-900/30 border-l-4 border-lime-500 shadow-lime-100',
    'bg-gradient-to-br from-red-50 via-orange-50 to-amber-50 dark:from-red-900/30 dark:via-orange-900/30 dark:to-amber-900/30 border-l-4 border-red-500 shadow-red-100'
  ];

  const distinctRoutes = Array.from(new Set(customers.map(c => c.route || 'Unassigned'))) as string[];
  const routeGradientMap: Record<string, string> = {};
  distinctRoutes.forEach((r, i) => {
    routeGradientMap[(r || 'Unassigned') as string] = gradientPatterns[i % gradientPatterns.length];
  });

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-6 sm:space-y-8">
      {/* Header with back button */}
      <div className="flex flex-col sm:flex-row gap-4 sm:justify-between sm:items-center">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <button
            onClick={onBackToRoutes}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors text-sm sm:text-base self-start"
          >
            ← Back to Routes
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-800 dark:text-slate-100">
              {selectedRoute === 'All Routes' ? (
                '📊 All Customers'
              ) : (
                <>
                  <span className="text-2xl mr-2">{selectedRoute === 'Unassigned' ? '📋' : '🚛'}</span>
                  {selectedRoute} Customers
                </>
              )}
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mt-1">
              {selectedRoute === 'All Routes' 
                ? 'Viewing customers from all routes'
                : `Managing customers in ${selectedRoute} delivery route`
              }
            </p>
          </div>
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto">
          {canEdit && (
            <button 
              onClick={() => openModal('add')}
              className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm sm:text-base min-h-[44px] w-full sm:w-auto flex items-center justify-center"
            >
              <span className="hidden sm:inline">Add Customer to {selectedRoute}</span>
              <span className="sm:hidden">+ Add Customer</span>
            </button>
          )}
        </div>
      </div>

      {/* Summary Statistics */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm sm:text-base">Customers in {selectedRoute}</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Total customer count</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">{filteredCustomers.length}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm sm:text-base">Total Outstanding</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Pending payments</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-red-500 break-words">{formatCurrency(totalOutstanding, currency)}</p>
          </CardContent>
        </Card>
        
        <Card className="sm:col-span-2 lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm sm:text-base">GPS Coverage</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Customers with GPS</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl sm:text-3xl font-bold text-green-600">
              {filteredCustomers.filter(c => c.location?.includes('GPS:')).length}/{filteredCustomers.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Sales Rep Access Information */}
      {currentUser?.role === UserRole.Sales && (
        <Card className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-900/20 dark:via-indigo-900/20 dark:to-purple-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="text-2xl">👤</div>
              <div>
                <h3 className="font-semibold text-blue-800 dark:text-blue-300 text-sm">Sales Rep Access</h3>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  You can view all customers route-wise. Your own customers are marked with "My Customer" for easy tracking.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Admin/Manager View Information */}
      {(currentUser?.role === UserRole.Admin || currentUser?.role === UserRole.Manager) && (
        <Card className="bg-gradient-to-r from-green-50 via-emerald-50 to-teal-50 dark:from-green-900/20 dark:via-emerald-900/20 dark:to-teal-900/20 border-green-200 dark:border-green-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="text-2xl">👥</div>
              <div>
                <h3 className="font-semibold text-green-800 dark:text-green-300 text-sm">Administrative Access</h3>
                <p className="text-xs text-green-600 dark:text-green-400">
                  You can view all customers from all sales reps. Customer cards show ownership badges for tracking.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search and Customer List */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg sm:text-xl">{selectedRoute} Customer List</CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {selectedRoute === 'All Routes' 
              ? 'All customers across routes' 
              : `Customers assigned to ${selectedRoute} route`
            }
          </CardDescription>
          <div className="pt-4">
            <input
              type="text"
              placeholder="Search customers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 sm:px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm sm:text-base min-h-[44px]"
            />
          </div>
        </CardHeader>
        <CardContent>
          {filteredCustomers.length > 0 ? (
            <>
              {/* Unified Card View */}
              <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-slate-600 dark:text-slate-400">Order State:</label>
                  <select
                    value={orderStateFilter}
                    onChange={(e) => setOrderStateFilter(e.target.value as any)}
                    className="text-sm p-2 rounded bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600"
                  >
                    <option value="all">All</option>
                    <option value="pending">Pending</option>
                    <option value="delivered">Delivered</option>
                    <option value="no-orders">No Orders</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-sm text-slate-600 dark:text-slate-400">Outstanding:</label>
                  <select
                    value={outstandingFilter}
                    onChange={(e) => setOutstandingFilter(e.target.value as any)}
                    className="text-sm p-2 rounded bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600"
                  >
                    <option value="all">All</option>
                    <option value="withOutstanding">With Outstanding</option>
                    <option value="noOutstanding">No Outstanding</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {sortedCustomers.map((customer, index) => {
                    // Determine order state for this customer: pending if any non-Delivered exists, delivered if at least one delivered and no pending
                    const custOrders = orders.filter(o => o.customerId === customer.id);
                    const hasPending = custOrders.some(o => o.status && o.status !== OrderStatus.Delivered);
                    const hasDelivered = custOrders.some(o => o.status === OrderStatus.Delivered);

                    // Gradients for pending (yellow) and delivered/no-orders (green)
                    const pendingGradient = 'bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50 dark:from-yellow-900/30 dark:via-amber-900/30 dark:to-orange-900/30 border-l-4 border-yellow-500 shadow-yellow-100';
                    const deliveredGradient = 'bg-gradient-to-br from-emerald-50 via-green-50 to-lime-50 dark:from-emerald-900/30 dark:via-green-900/30 dark:to-lime-900/30 border-l-4 border-emerald-500 shadow-emerald-100';

                    // Default route gradient (kept when no override is needed)
                    let cardGradient = routeGradientMap[customer.route || 'Unassigned'] || gradientPatterns[index % gradientPatterns.length];

                    // Apply overrides per requirement: pending -> yellow; delivered or no orders -> green
                    if (hasPending) {
                      cardGradient = pendingGradient;
                    } else {
                      // delivered or no orders -> green
                      cardGradient = deliveredGradient;
                    }

                    return (
                    <Card key={customer.id} className={`${cardGradient} border-0 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-pointer`}>
                    <CardContent className="p-4">
                      {/* Customer Header: name on its own line; badges moved slightly lower to avoid truncation */}
                      <div className="mb-2">
                        <div className="font-semibold text-slate-900 dark:text-white text-sm sm:text-base truncate">{customer.name}</div>
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex flex-col">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {/* Sales Rep Ownership Indicator */}
                                {(() => {
                                  if (customer.created_by === currentUser?.id) {
                                    return (
                                      <Badge variant="success" className="px-1.5 py-0.5 text-xs font-bold bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-600">
                                        👤 My Customer
                                      </Badge>
                                    );
                                  } else if (currentUser?.role === UserRole.Admin || currentUser?.role === UserRole.Manager) {
                                    const creatorName = customer.created_by ? customer.created_by.slice(0, 8) + '...' : 'System';
                                    return (
                                      <Badge variant="secondary" className="px-1.5 py-0.5 text-xs bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600">
                                        👥 {creatorName}
                                      </Badge>
                                    );
                                  }
                                  return null;
                                })()}

                                {/* Order state indicator: Pending (yellow) takes precedence over Delivered (green) */}
                                {(() => {
                                  if (!custOrders || custOrders.length === 0) {
                                    return <Badge variant="default" className="px-1.5 py-0.5 text-xs bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400">No Orders</Badge>;
                                  }
                                  if (hasPending) {
                                    return <Badge className="px-1.5 py-0.5 text-xs bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400">Pending</Badge>;
                                  }
                                  if (hasDelivered) {
                                    return <Badge className="px-1.5 py-0.5 text-xs bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400">Delivered</Badge>;
                                  }
                                  return null;
                                })()}
                              </div>

                              <div className="flex-shrink-0 ml-2">
                                <Badge variant="default" className="text-xs">
                                  {customer.route === 'Unassigned' ? '📋' : '🚛'} {customer.route || 'Unassigned'}
                                </Badge>
                              </div>
                            </div>

                            <div className="mt-2">
                              <a 
                                href={`tel:${customer.phone}`}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 rounded transition-colors cursor-pointer"
                                title={`Call ${customer.name}`}
                              >
                                📞 {formatPhoneNumber(customer.phone)}
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Location */}
                      <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-3 break-words">
                        {renderLocationWithGPS(customer.location)}
                      </div>
                      
                      {/* Sales Metrics */}
                      <div className="grid grid-cols-3 gap-2 mb-3 p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                        <div className="text-center">
                          <div className="text-xs text-slate-500 dark:text-slate-400">Orders</div>
                          <div className="font-semibold text-sm text-slate-700 dark:text-slate-300">
                            {customerOrderCountMap[customer.id] || 0}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-slate-500 dark:text-slate-400">Sales</div>
                          <div className="font-semibold text-sm text-blue-600 dark:text-blue-400">
                            {formatCurrency(customerSalesMap[customer.id] || 0, currency)}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-slate-500 dark:text-slate-400">Outstanding</div>
                          <div className={`font-semibold text-sm ${(customerOutstandingMap[customer.id] || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatCurrency(customerOutstandingMap[customer.id] || 0, currency)}
                          </div>
                        </div>
                      </div>
                      
                      {/* Actions */}
                      <div className="flex items-center justify-end pt-2 border-t border-slate-200 dark:border-slate-600">
                        <div className="flex gap-2">
                          {canEdit && (
                            <button 
                              onClick={() => openModal('edit', customer)} 
                              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium text-xs bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded min-h-[32px] transition-colors"
                            >
                              Edit
                            </button>
                          )}
                          {canDelete && (
                            <button 
                              onClick={() => setCustomerToDelete(customer)} 
                              className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-medium text-xs bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded min-h-[32px] transition-colors"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="text-center py-8 sm:py-10">
              <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base px-4">
                {searchTerm 
                  ? `No customers found matching "${searchTerm}" in ${selectedRoute}`
                  : `No customers assigned to ${selectedRoute} yet.`
                }
              </p>
              {canEdit && !searchTerm && (
                <button 
                  onClick={() => openModal('add')}
                  className="mt-4 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm sm:text-base min-h-[44px]"
                >
                  Add First Customer to {selectedRoute}
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Modal */}
      <Modal isOpen={isModalOpen} onClose={closeModal} title={modalMode === 'add' ? `Add New Customer to ${selectedRoute}` : 'Edit Customer'}>
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          <div>
            <label className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Name</label>
            <input
              type="text"
              value={currentCustomer.name || ''}
              onChange={(e) => setCurrentCustomer({ ...currentCustomer, name: e.target.value })}
              className="bg-slate-50 border border-slate-300 text-slate-900 text-sm sm:text-base rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-3 sm:p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white min-h-[44px]"
              required
            />
          </div>
          <div>
            <label className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">
              Phone Number <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={currentCustomer.phone || ''}
              onChange={(e) => {
                const newPhone = e.target.value;
                setCurrentCustomer({ ...currentCustomer, phone: newPhone });
                
                // Debounce validation - validate after user stops typing for 500ms
                clearTimeout(window.phoneValidationTimeout);
                window.phoneValidationTimeout = setTimeout(() => {
                  validatePhoneNumber(newPhone);
                }, 500);
              }}
              className={`bg-slate-50 border text-slate-900 text-sm sm:text-base rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-3 sm:p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white min-h-[44px] ${
                phoneValidation.isValid 
                  ? 'border-slate-300 dark:border-slate-600' 
                  : 'border-red-300 dark:border-red-600'
              }`}
              placeholder="Enter unique phone number (e.g., +94771234567)"
              required
            />
            <div className="mt-2 text-xs sm:text-sm">
              {phoneValidation.message && (
                <p className={phoneValidation.isValid ? 'text-green-600' : 'text-red-500'}>
                  {phoneValidation.message}
                </p>
              )}
              <p className="text-slate-500 dark:text-slate-400 mt-1">
                📱 Each phone number can only be used for one customer
              </p>
            </div>
          </div>
          <div>
            <label className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Email (Optional)</label>
            <input
              type="email"
              value={currentCustomer.email || ''}
              onChange={(e) => setCurrentCustomer({ ...currentCustomer, email: e.target.value })}
              className="bg-slate-50 border border-slate-300 text-slate-900 text-sm sm:text-base rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-3 sm:p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white min-h-[44px]"
            />
          </div>
          {/* Location with Tabs */}
          <div>
            <label className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Location</label>
            
            {/* GPS Location Section */}
            <div className="space-y-3">
              {/* GPS Required Indicator */}
              <div className="flex items-center gap-1 mb-2">
                <span className="text-red-500 text-sm">*</span>
                <span className="text-xs text-slate-600 dark:text-slate-400">GPS Location Required</span>
              </div>
              
              {/* Compact GPS Capture Section */}
                <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2">
                    <span className="text-blue-600 text-lg">📍</span>
                    <div>
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-100">GPS Capture</span>
                      <p className="text-xs text-slate-600 dark:text-slate-400">Get precise coordinates</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleGetLocation}
                    disabled={isGettingLocation}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                      isGettingLocation
                        ? 'bg-slate-400 cursor-not-allowed text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {isGettingLocation ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span className="hidden sm:inline">Getting...</span>
                      </>
                    ) : (
                      <>
                        📱 <span className="hidden sm:inline">Capture</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Compact GPS Results */}
                {gpsCoordinates && (
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-green-600 text-lg">✓</span>
                        <div>
                          <span className="text-sm font-medium text-green-800 dark:text-green-200">GPS Captured</span>
                          <p className="text-xs text-green-600 dark:text-green-400">
                            {gpsCoordinates.lat.toFixed(4)}, {gpsCoordinates.lng.toFixed(4)}
                          </p>
                        </div>
                      </div>
                      <a 
                        href={`https://www.google.com/maps?q=${gpsCoordinates.lat},${gpsCoordinates.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 underline"
                      >
                        🗺️ Maps
                      </a>
                    </div>
                  </div>
                )}

                {/* Address Preview */}
                <div>
                  <label className="block mb-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                    Final Location String:
                  </label>
                  <textarea
                    value={currentCustomer.location || ''}
                    onChange={(e) => setCurrentCustomer({ ...currentCustomer, location: e.target.value })}
                    placeholder="Address will appear here after GPS capture, or type manually..."
                    rows={3}
                    className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white resize-none"
                  />
                </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end p-4 sm:p-6 space-y-2 sm:space-y-0 sm:space-x-2 border-t border-slate-200 rounded-b dark:border-slate-600">
          <button 
            onClick={closeModal} 
            className="text-slate-500 bg-white hover:bg-slate-100 focus:ring-4 focus:outline-none focus:ring-blue-300 rounded-lg border border-slate-200 text-sm font-medium px-5 py-3 sm:py-2.5 hover:text-slate-900 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-500 dark:hover:text-white dark:hover:bg-slate-600 min-h-[44px] order-2 sm:order-1"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={!phoneValidation.isValid || phoneValidation.isChecking || !currentCustomer.name || !currentCustomer.phone || !currentCustomer.location || !currentCustomer.location.includes('GPS:')}
            className={`font-medium rounded-lg text-sm px-5 py-3 sm:py-2.5 text-center transition-colors min-h-[44px] order-1 sm:order-2 ${
              !phoneValidation.isValid || phoneValidation.isChecking || !currentCustomer.name || !currentCustomer.phone || !currentCustomer.location || !currentCustomer.location.includes('GPS:')
                ? 'bg-slate-400 cursor-not-allowed text-white'
                : 'text-white bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300'
            }`}
          >
            {phoneValidation.isChecking ? 'Validating...' : 'Save Customer'}
          </button>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={!!customerToDelete} onClose={() => setCustomerToDelete(null)} title="Confirm Deletion">
        <div className="p-4 sm:p-6">
          <p className="text-slate-600 dark:text-slate-300 text-sm sm:text-base">
            Are you sure you want to delete the customer "{customerToDelete?.name}"?
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end p-4 sm:p-6 space-y-2 sm:space-y-0 sm:space-x-2 border-t border-slate-200 rounded-b dark:border-slate-600">
          <button 
            onClick={() => setCustomerToDelete(null)} 
            className="text-slate-500 bg-white hover:bg-slate-100 focus:ring-4 focus:outline-none focus:ring-blue-300 rounded-lg border border-slate-200 text-sm font-medium px-5 py-3 sm:py-2.5 hover:text-slate-900 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-500 dark:hover:text-white dark:hover:bg-slate-600 min-h-[44px] order-2 sm:order-1"
          >
            Cancel
          </button>
          <button 
            onClick={handleDelete} 
            className="text-white bg-red-600 hover:bg-red-700 focus:ring-4 focus:outline-none focus:ring-red-300 font-medium rounded-lg text-sm px-5 py-3 sm:py-2.5 text-center min-h-[44px] order-1 sm:order-2"
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
};

// Main customer management component with route-first navigation
export const CustomerManagement: React.FC = () => {
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [showRouteOverview, setShowRouteOverview] = useState(true);

  const handleRouteSelect = (routeName: string) => {
    setSelectedRoute(routeName);
    setShowRouteOverview(false);
  };

  const handleBackToRoutes = () => {
    setSelectedRoute(null);
    setShowRouteOverview(true);
  };

  if (showRouteOverview) {
    return <RouteOverview onRouteSelect={handleRouteSelect} />;
  }

  return (
    <RouteCustomerList 
      selectedRoute={selectedRoute || 'All Routes'} 
      onBackToRoutes={handleBackToRoutes} 
    />
  );
};

export default CustomerManagement;