// Debug utility for Supabase 409 error
// Add this to browser console to test customers table directly

async function debugCustomersTable() {
    const { createClient } = await import('@supabase/supabase-js');
    
    const supabaseUrl = 'https://xsoptewtyrogfepnpsde.supabase.co';
    const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzb3B0ZXd0eXJvZ2ZlcG5wc2RlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1NjE0NTcsImV4cCI6MjA3MzEzNzQ1N30.y42ifDCqqbmK5cnpOxLLA796XMNG1w6EbmuibHgX1PI';
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    console.log('🔍 Testing customers table queries...');
    
    // Test 1: Basic select all
    try {
        console.log('Test 1: SELECT * FROM customers');
        const { data, error } = await supabase.from('customers').select('*');
        if (error) {
            console.error('❌ SELECT * failed:', error);
        } else {
            console.log('✅ SELECT * succeeded:', data?.length, 'records');
            if (data && data[0]) {
                console.log('Sample record columns:', Object.keys(data[0]));
            }
        }
    } catch (e) {
        console.error('❌ SELECT * exception:', e);
    }
    
    // Test 2: Select specific columns one by one
    const expectedColumns = ['id', 'name', 'email', 'phone', 'location', 'joindate', 'totalspent', 'outstandingbalance', 'avatarurl'];
    
    for (const col of expectedColumns) {
        try {
            console.log(`Test: SELECT ${col} FROM customers`);
            const { data, error } = await supabase.from('customers').select(col).limit(1);
            if (error) {
                console.error(`❌ Column ${col} failed:`, error);
            } else {
                console.log(`✅ Column ${col} exists`);
            }
        } catch (e) {
            console.error(`❌ Column ${col} exception:`, e);
        }
    }
    
    // Test 3: Check table schema
    try {
        console.log('Test: Table schema information');
        const { data, error } = await supabase.from('customers').select('*').limit(0);
        console.log('Schema test result:', { data, error });
    } catch (e) {
        console.error('❌ Schema test exception:', e);
    }
}

// Run the debug function
debugCustomersTable();