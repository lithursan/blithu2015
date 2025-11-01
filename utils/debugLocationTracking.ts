import { supabase } from '../supabaseClient';

// Debug utility to check database schema and data
export const debugLocationTracking = async () => {
  console.group('🔍 Live Location Tracking Debug');

  try {
    // Check if columns exist
    console.log('1️⃣ Checking database schema...');
    const { data: columns, error: schemaError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable')
      .eq('table_name', 'users')
      .in('column_name', ['currentlocation', 'locationsharing']);

    if (schemaError) {
      console.error('❌ Schema check failed:', schemaError);
    } else {
      console.log('✅ Database columns:', columns);
      
      const hasCurrentLocation = columns?.some(col => col.column_name === 'currentlocation');
      const hasLocationSharing = columns?.some(col => col.column_name === 'locationsharing');
      
      if (!hasCurrentLocation || !hasLocationSharing) {
        console.error('❌ Missing columns! Please run the database migration.');
        console.log('📝 Run this SQL in Supabase:');
        console.log(`
ALTER TABLE users ADD COLUMN IF NOT EXISTS currentlocation JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locationsharing BOOLEAN DEFAULT false;
        `);
        return;
      }
    }

    // Check users data
    console.log('2️⃣ Checking users with location data...');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, name, role, locationsharing, currentlocation')
      .in('role', ['Sales Rep', 'Driver']);

    if (usersError) {
      console.error('❌ Users query failed:', usersError);
    } else {
      console.log('✅ Sales Reps and Drivers:', users);
      
      const sharingUsers = users?.filter(user => user.locationsharing);
      console.log('📍 Users with location sharing enabled:', sharingUsers);
      
      const usersWithLocation = users?.filter(user => user.currentlocation);
      console.log('🗺️ Users with current location:', usersWithLocation);
    }

    // Test location update
    console.log('3️⃣ Testing location update capability...');
    const testUser = await supabase.auth.getUser();
    if (testUser.data?.user) {
      // Create multiple test locations around the store for demonstration
      const testLocations = [
        { latitude: 9.384489, longitude: 80.408737, name: 'Store Location' },
        { latitude: 9.390000, longitude: 80.410000, name: 'Sales Rep 1' },
        { latitude: 9.380000, longitude: 80.405000, name: 'Driver 1' },
        { latitude: 9.388000, longitude: 80.415000, name: 'Sales Rep 2' }
      ];

      const mockLocation = testLocations[1]; // Use Sales Rep 1 location
      const locationData = {
        latitude: mockLocation.latitude,
        longitude: mockLocation.longitude,
        timestamp: new Date().toISOString(),
        accuracy: 10
      };

      const { error: updateError } = await supabase
        .from('users')
        .update({
          currentlocation: locationData,
          locationsharing: true
        })
        .eq('email', testUser.data.user.email);

      if (updateError) {
        console.error('❌ Test location update failed:', updateError);
      } else {
        console.log('✅ Location update test successful');
        console.log('📍 Demo locations available:', testLocations);
      }
    }

    // Check real-time subscriptions
    console.log('4️⃣ Testing real-time subscriptions...');
    const channel = supabase
      .channel('debug_location')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'users',
        filter: 'locationsharing=eq.true'
      }, (payload) => {
        console.log('🔔 Real-time update received:', payload);
      })
      .subscribe((status) => {
        console.log('📡 Subscription status:', status);
      });

    setTimeout(() => {
      supabase.removeChannel(channel);
      console.log('🔚 Debug session completed');
    }, 5000);

  } catch (error) {
    console.error('💥 Debug session failed:', error);
  }

  console.groupEnd();
};

// Helper to check browser geolocation support
export const checkGeolocationSupport = () => {
  console.group('🌍 Geolocation Support Check');
  
  if (!navigator.geolocation) {
    console.error('❌ Geolocation is not supported by this browser');
    return false;
  }
  
  console.log('✅ Geolocation API is available');
  
  // Check permissions
  if ('permissions' in navigator) {
    navigator.permissions.query({ name: 'geolocation' }).then((result) => {
      console.log('📍 Geolocation permission:', result.state);
      if (result.state === 'denied') {
        console.warn('⚠️ Geolocation permission is denied. User needs to enable it.');
      }
    });
  }
  
  console.groupEnd();
  return true;
};

// Export for use in components
declare global {
  interface Window {
    debugLocationTracking: () => Promise<void>;
    checkGeolocationSupport: () => boolean;
  }
}

if (typeof window !== 'undefined') {
  window.debugLocationTracking = debugLocationTracking;
  window.checkGeolocationSupport = checkGeolocationSupport;
}