const fs = require('fs');
const path = require('path');

// Use the same Supabase URL and anon key from supabaseClient.ts
const SUPABASE_URL = 'https://xsoptewtyrogfepnpsde.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzb3B0ZXd0eXJvZ2ZlcG5wc2RlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1NjE0NTcsImV4cCI6MjA3MzEzNzQ1N30.y42ifDCqqbmK5cnpOxLLA796XMNG1w6EbmuibHgX1PI';

async function run() {
  try {
    const sqlPath = path.join(__dirname, '..', 'supabase_migrations', 'create_collections_table.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Running create_collections_table.sql on', SUPABASE_URL);

    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ query: sql }),
    });

    const text = await res.text();
    if (!res.ok) {
      console.error('Migration failed:', res.status, text);
      process.exit(1);
    }

    console.log('Migration response:', text);
    console.log('✅ Migration applied (or already present).');
  } catch (err) {
    console.error('Error running migration:', err);
    process.exit(1);
  }
}

run();
