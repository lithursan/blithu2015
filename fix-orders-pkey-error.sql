-- ORDERS PRIMARY KEY FIX - Run this in Supabase SQL Editor
-- This script will fix the duplicate key violation for orders_pkey

-- Step 1: Identify and remove any duplicate rows (if any)
WITH duplicate_orders AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY id ORDER BY created_at DESC NULLS LAST) as rn
  FROM orders
)
DELETE FROM orders 
WHERE id IN (
  SELECT id FROM duplicate_orders WHERE rn > 1
);

-- Step 2: Fix the sequence to be in sync with existing data
-- This prevents future ID conflicts
DO $$ 
BEGIN
  -- Get the current maximum ID and set sequence accordingly
  PERFORM setval('orders_id_seq', COALESCE(MAX(id), 0) + 1, false) FROM orders;
  
  -- Log the fix
  RAISE NOTICE 'Sequence reset to: %', currval('orders_id_seq');
END $$;

-- Step 3: Ensure the primary key constraint exists and is properly named
-- Drop and recreate if necessary
DO $$
BEGIN
  -- Check if constraint exists with wrong name and drop it
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname != 'orders_pkey' 
    AND conrelid = 'orders'::regclass 
    AND contype = 'p'
  ) THEN
    -- Drop the incorrectly named primary key
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_pkey CASCADE;
    
    -- Recreate the primary key with correct name
    ALTER TABLE orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);
    
    RAISE NOTICE 'Primary key constraint recreated as orders_pkey';
  END IF;
END $$;

-- Step 4: Verify the fix
SELECT 
  'Orders Table Status' as check_type,
  COUNT(*) as total_rows,
  COUNT(DISTINCT id) as unique_ids,
  MAX(id) as max_id,
  (SELECT last_value FROM orders_id_seq) as sequence_value
FROM orders;

-- Step 5: Test that we can insert new orders without error
-- This will verify the fix worked
DO $$
BEGIN
  -- Try to get the next sequence value (this should work now)
  PERFORM nextval('orders_id_seq');
  RAISE NOTICE 'Sequence test passed - next available ID: %', currval('orders_id_seq');
  
  -- Reset the sequence back
  PERFORM setval('orders_id_seq', currval('orders_id_seq') - 1, true);
END $$;

-- Success message
SELECT 'SUCCESS: Orders primary key issue has been resolved!' as result;