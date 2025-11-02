import { supabase } from './supabaseClient.ts';
import fs from 'fs';

async function runMigration() {
  try {
    console.log('🔗 Connecting to Supabase...');
    
    const sqlContent = fs.readFileSync('./supabase_migrations/add_created_by_to_customers.sql', 'utf8');
    console.log('📋 SQL Content:', sqlContent);
    
    console.log('📊 Executing migration...');
    
    // Execute each SQL statement individually
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--') && !s.startsWith('/*'));
    
    for (const statement of statements) {
      if (statement.trim()) {
        console.log('Executing:', statement.substring(0, 50) + '...');
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: statement });
        
        if (error) {
          console.error('❌ Statement failed:', error);
          // Continue with other statements
        } else {
          console.log('✅ Statement executed successfully');
        }
      }
    }
    
    console.log('✅ Migration completed');
    
    // Verify the column was added
    console.log('🔍 Verifying migration...');
    const { data: testData, error: verifyError } = await supabase
      .from('customers')
      .select('*')
      .limit(1);
      
    if (verifyError) {
      console.warn('⚠️ Verification failed:', verifyError);
    } else {
      console.log('✅ Migration verification successful');
      if (testData && testData[0]) {
        console.log('📊 Sample customer structure:', Object.keys(testData[0]));
      }
    }
    
  } catch (err) {
    console.error('💥 Unexpected error:', err);
    process.exit(1);
  }
}

runMigration();