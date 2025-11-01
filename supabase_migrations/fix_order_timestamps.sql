-- Fix order timestamps to have varied realistic times instead of all showing 05:30
-- This will update existing orders to have different times throughout the day

-- Update existing orders with varied realistic timestamps
UPDATE orders 
SET created_at = (
  CASE 
    WHEN orderdate IS NOT NULL AND orderdate != '' THEN
      -- Create varied times based on order ID to spread throughout the day
      (orderdate || ' ' || 
        LPAD((8 + (id % 12))::text, 2, '0') || ':' ||  -- Hours between 08:00 and 19:59
        LPAD((id % 60)::text, 2, '0') || ':' ||        -- Minutes 00-59
        LPAD(((id * 7) % 60)::text, 2, '0')           -- Seconds 00-59
      )::TIMESTAMP WITH TIME ZONE
    ELSE 
      -- For orders without dates, use current time minus random hours
      NOW() - INTERVAL '1 hour' * (id % 24)
  END
)
WHERE created_at IS NOT NULL;

-- Verify the update
SELECT 
  'Timestamp fix completed' AS status,
  COUNT(*) AS total_orders,
  COUNT(DISTINCT DATE_TRUNC('hour', created_at)) AS unique_hours,
  MIN(created_at) AS earliest_order,
  MAX(created_at) AS latest_order
FROM orders;