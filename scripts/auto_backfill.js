import { createClient } from '@supabase/supabase-js';

// Usage:
// Set environment variables SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// Run: node scripts/auto_backfill.js

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  console.log('Running carry_over_daily_targets RPC...');
  const { data, error } = await supabase.rpc('carry_over_daily_targets');
  if (error) {
    console.error('Backfill RPC error:', error);
    process.exit(2);
  }
  console.log('Backfill RPC completed:', data);
}

main().catch(err => {
  console.error('Unexpected error', err);
  process.exit(3);
});
