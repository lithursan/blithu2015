const { createClient } = require('@supabase/supabase-js');

// You'll need to replace these with your actual Supabase credentials
const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseKey = 'YOUR_SUPABASE_ANON_KEY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function addCreatedAtColumn() {
  try {
    console.log('Adding created_at column to orders table...');
    
    // Add the created_at column with current timestamp as default
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE orders 
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        
        -- Update existing orders with varied realistic timestamps
        UPDATE orders 
        SET created_at = (
          CASE 
            WHEN orderdate IS NOT NULL AND orderdate != '' THEN
              -- Create varied times based on order ID to spread throughout the day
              (orderdate || ' ' || 
                LPAD((8 + (CAST(SUBSTRING(id FROM '[0-9]+') AS INTEGER) % 12))::text, 2, '0') || ':' ||
                LPAD((CAST(SUBSTRING(id FROM '[0-9]+') AS INTEGER) % 60)::text, 2, '0') || ':' ||
                LPAD(((CAST(SUBSTRING(id FROM '[0-9]+') AS INTEGER) * 7) % 60)::text, 2, '0')
              )::TIMESTAMP WITH TIME ZONE
            ELSE 
              -- For orders without dates, use current time minus random hours
              NOW() - INTERVAL '1 hour' * (CAST(SUBSTRING(id FROM '[0-9]+') AS INTEGER) % 24)
          END
        )
        WHERE created_at IS NULL OR created_at::time = '00:00:00'::time;
        
        -- Create index for better performance
        CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
      `
    });

    if (error) {
      console.error('Error adding column:', error);
      return;
    }

    console.log('✅ Successfully added created_at column and updated existing orders');
    
    // Verify the results
    const { data: verifyData, error: verifyError } = await supabase
      .from('orders')
      .select('id, created_at')
      .limit(5);
      
    if (verifyData) {
      console.log('Sample updated orders:');
      verifyData.forEach(order => {
        console.log(`Order ${order.id}: ${order.created_at}`);
      });
    }
    
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

addCreatedAtColumn();