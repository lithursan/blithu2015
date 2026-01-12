#!/usr/bin/env node
/*
  Script to apply order cost/margin columns to the `orders` table
  Usage: node scripts/apply-order-costs.js
*/
import { supabase } from '../supabaseClient.js';

async function run() {
  console.log('🔄 Applying order cost/margin migrations...');

  const sql = `
    ALTER TABLE public.orders
      ADD COLUMN IF NOT EXISTS costamount numeric DEFAULT 0;

    ALTER TABLE public.orders
      ADD COLUMN IF NOT EXISTS total_cost_price numeric DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_margin_price numeric DEFAULT 0;

    -- Optional best-effort backfill (may fail if JSON structure differs)
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
        UPDATE public.orders
        SET total_cost_price = COALESCE((
          SELECT SUM(((item->>'costPrice')::numeric) * ((item->>'quantity')::numeric))
          FROM jsonb_array_elements(orderitems::jsonb) AS elem(item)
          WHERE (item->>'costPrice') IS NOT NULL
        ), 0),
        total_margin_price = COALESCE((
          SELECT SUM(((item->>'marginPrice')::numeric) * ((item->>'quantity')::numeric))
          FROM jsonb_array_elements(orderitems::jsonb) AS elem(item)
          WHERE (item->>'marginPrice') IS NOT NULL
        ), 0)
        WHERE orderitems IS NOT NULL;
      END IF;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Backfill of order totals failed; manual backfill may be required.';
    END$$;
  `;

  try {
    const { data, error } = await supabase.rpc('sql', { query: sql });
    if (error) {
      console.error('❌ Migration error:', error);
      process.exitCode = 2;
      return;
    }

    console.log('✅ Migration query executed.');
    console.log('Note: If you are running a local dev server, restart it to refresh schema cache.');
  } catch (err) {
    console.error('❌ Unexpected error running migration:', err);
    process.exitCode = 2;
  }
}

run();
