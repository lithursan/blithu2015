-- Fix Orders Primary Key Duplicate Issue
-- This script diagnoses and fixes the "orders_pkey" duplicate key violation

-- Step 1: Check for duplicate IDs in orders table
SELECT 
  id, 
  COUNT(*) as count
FROM orders 
GROUP BY id 
HAVING COUNT(*) > 1
ORDER BY count DESC, id;

-- Step 2: Check current primary key constraint
SELECT 
  tc.table_name, 
  kcu.column_name, 
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
  ON tc.constraint_name = kcu.constraint_name 
  AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_type = 'PRIMARY KEY' 
  AND tc.table_name = 'orders';

-- Step 3: Check sequence information for orders ID
SELECT 
  schemaname,
  sequencename,
  last_value,
  start_value,
  increment_by,
  max_value,
  min_value,
  cache_value,
  log_cnt,
  is_cycled,
  is_called
FROM pg_sequences 
WHERE sequencename LIKE '%orders%';

-- Step 4: Get maximum ID from orders table
SELECT MAX(id) as max_id FROM orders;

-- Step 5: Get next sequence value
SELECT nextval('orders_id_seq') as next_sequence_value;

-- Step 6: Fix sequence if it's out of sync
-- This will reset the sequence to be higher than the maximum existing ID
SELECT setval('orders_id_seq', COALESCE(MAX(id), 0) + 1, false) FROM orders;

-- Step 7: Verify the fix
SELECT 
  'Sequence Fixed' as status,
  MAX(id) as current_max_id,
  currval('orders_id_seq') as sequence_current_value,
  nextval('orders_id_seq') as next_available_id
FROM orders;

-- Step 8: Test insert (should work without error)
-- Uncomment the following lines to test:
-- INSERT INTO orders (customerid, orderdate, status, totalamount) 
-- VALUES (1, CURRENT_DATE::TEXT, 'Pending', 100.00);

-- Step 9: If there are still issues, check for any constraints that might be causing problems
SELECT 
  conname as constraint_name,
  contype as constraint_type,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'orders'::regclass;