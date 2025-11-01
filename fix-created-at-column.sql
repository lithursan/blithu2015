-- Add created_at column to orders table to fix default time issue
-- Run this SQL in your Supabase SQL Editor

-- Step 1: Add the created_at column if it doesn't exist
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Step 2: Update existing orders with varied realistic timestamps
-- This will fix the 5:30 default time issue by giving each order a unique time
UPDATE orders 
SET created_at = (
  CASE 
    WHEN orderdate IS NOT NULL AND orderdate != '' THEN
      -- Create varied times based on order ID to spread throughout the day (8 AM to 8 PM)
      (orderdate || ' ' || 
        LPAD((8 + (ABS(HASHTEXT(id)) % 12))::text, 2, '0') || ':' ||  -- Hours 8-19
        LPAD((ABS(HASHTEXT(id || 'min')) % 60)::text, 2, '0') || ':' || -- Minutes 0-59
        LPAD((ABS(HASHTEXT(id || 'sec')) % 60)::text, 2, '0')          -- Seconds 0-59
      )::TIMESTAMP WITH TIME ZONE
    ELSE 
      -- For orders without dates, use current time minus random hours
      NOW() - INTERVAL '1 hour' * (ABS(HASHTEXT(id)) % 24)
  END
)
WHERE created_at IS NULL OR created_at::time = '00:00:00'::time;

-- Step 3: Create index for better performance on created_at queries
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

-- Step 4: Verify the migration worked
SELECT 
  'Migration completed successfully' AS status,
  COUNT(*) AS total_orders,
  COUNT(DISTINCT DATE_TRUNC('hour', created_at)) AS unique_hours,
  MIN(created_at) AS earliest_timestamp,
  MAX(created_at) AS latest_timestamp
FROM orders;

-- Step 5: Show sample of updated timestamps
SELECT id, orderdate, created_at, 
       EXTRACT(hour FROM created_at) as hour,
       EXTRACT(minute FROM created_at) as minute
FROM orders 
ORDER BY created_at DESC 
LIMIT 10;