// Migration runner to add route column to customers table
// Run this file with: node run-migration.js

import { supabase } from './supabaseClient.js';

async function runMigration() {
  console.log('🔄 Starting migration: Add route column to customers table...');
  
  try {
    // Add the route column
    const { error: alterError } = await supabase.rpc('sql', {
      query: `
        ALTER TABLE customers 
        ADD COLUMN IF NOT EXISTS route VARCHAR(100) DEFAULT 'Unassigned';
      `
    });
    
    if (alterError) {
      console.error('❌ Error adding route column:', alterError);
      return;
    }
    
    // Create index for better performance
    const { error: indexError } = await supabase.rpc('sql', {
      query: `
        CREATE INDEX IF NOT EXISTS idx_customers_route ON customers (route);
      `
    });
    
    if (indexError) {
      console.error('❌ Error creating index:', indexError);
      return;
    }
    
    // Update existing customers
    const { error: updateError } = await supabase
      .from('customers')
      .update({ route: 'Unassigned' })
      .is('route', null);
      
    if (updateError) {
      console.error('❌ Error updating existing customers:', updateError);
      return;
    }
    
    console.log('✅ Migration completed successfully!');
    console.log('✅ Route column added to customers table');
    console.log('✅ Index created on route column');
    console.log('✅ Existing customers updated with default route');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

// Run the migration
runMigration().then(() => {
  console.log('Migration process completed.');
}).catch(error => {
  console.error('Migration process failed:', error);
});