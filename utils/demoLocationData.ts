import { supabase } from '../supabaseClient';

// Function to test and add demo location data
export const addDemoLocationData = async () => {
  console.group('🎯 Adding Demo Location Data');
  
  try {
    // First, let's check if the columns exist by trying to query them
    console.log('1️⃣ Testing database columns...');
    
    const { data: testQuery, error: testError } = await supabase
      .from('users')
      .select('id, name, role, locationsharing, currentlocation')
      .limit(1);
    
    if (testError) {
      console.error('❌ Database columns missing:', testError.message);
      console.log('📋 Please run this SQL in Supabase:');
      console.log(`
ALTER TABLE users ADD COLUMN IF NOT EXISTS currentlocation JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locationsharing BOOLEAN DEFAULT false;
      `);
      return false;
    }
    
    console.log('✅ Database columns exist');
    
    // Get all users with Sales Rep or Driver roles
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .in('role', ['Sales Rep', 'Driver']);
    
    if (usersError) {
      console.error('❌ Error fetching users:', usersError);
      return false;
    }
    
    if (!users || users.length === 0) {
      console.log('⚠️ No Sales Rep or Driver users found in database');
      return false;
    }
    
    console.log(`📋 Found ${users.length} field staff users:`, users.map(u => `${u.name} (${u.role})`));
    
    // Demo locations around the store (9.384489, 80.408737)
    const demoLocations = [
      { latitude: 9.390000, longitude: 80.410000, name: 'North Area' },
      { latitude: 9.380000, longitude: 80.405000, name: 'South Area' }, 
      { latitude: 9.388000, longitude: 80.415000, name: 'East Area' },
      { latitude: 9.382000, longitude: 80.400000, name: 'West Area' }
    ];
    
    // Update each user with demo location data
    for (let i = 0; i < Math.min(users.length, demoLocations.length); i++) {
      const user = users[i];
      const demoLocation = demoLocations[i];
      
      const locationData = {
        latitude: demoLocation.latitude,
        longitude: demoLocation.longitude,
        timestamp: new Date().toISOString(),
        accuracy: Math.floor(Math.random() * 20) + 5 // 5-25 meters accuracy
      };
      
      console.log(`📍 Setting demo location for ${user.name}:`, locationData);
      
      const { error: updateError } = await supabase
        .from('users')
        .update({
          currentlocation: locationData,
          locationsharing: true
        })
        .eq('id', user.id);
      
      if (updateError) {
        console.error(`❌ Failed to update ${user.name}:`, updateError);
      } else {
        console.log(`✅ Updated ${user.name} with demo location`);
      }
    }
    
    console.log('🎉 Demo location data added successfully!');
    console.log('🔄 Refresh the Live Tracking page to see the locations');
    
    return true;
    
  } catch (error) {
    console.error('💥 Error adding demo data:', error);
    return false;
  } finally {
    console.groupEnd();
  }
};

// Function to clear all location data  
export const clearLocationData = async () => {
  console.group('🧹 Clearing Location Data');
  
  try {
    const { error } = await supabase
      .from('users')
      .update({
        currentlocation: null,
        locationsharing: false
      })
      .in('role', ['Sales Rep', 'Driver']);
    
    if (error) {
      console.error('❌ Error clearing location data:', error);
      return false;
    }
    
    console.log('✅ All location data cleared');
    return true;
    
  } catch (error) {
    console.error('💥 Error clearing data:', error);
    return false;
  } finally {
    console.groupEnd();
  }
};

// Add functions to window for easy access
declare global {
  interface Window {
    addDemoLocationData: () => Promise<boolean>;
    clearLocationData: () => Promise<boolean>;
  }
}

if (typeof window !== 'undefined') {
  window.addDemoLocationData = addDemoLocationData;
  window.clearLocationData = clearLocationData;
}