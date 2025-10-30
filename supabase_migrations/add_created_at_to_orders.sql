-- Add created_at column to orders table to track order creation date and time
-- This will store the exact timestamp when an order is created

-- Add the created_at column with timestamp type
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add a comment to describe the column
COMMENT ON COLUMN orders.created_at IS 'Timestamp when the order was created';

-- Update existing orders to use orderdate as created_at if created_at is null
UPDATE orders 
SET created_at = COALESCE(
  -- Try to parse orderdate as timestamp
  CASE 
    WHEN orderdate IS NOT NULL AND orderdate != '' 
    THEN (orderdate || ' 00:00:00')::TIMESTAMP WITH TIME ZONE
    ELSE NOW()
  END
)
WHERE created_at IS NULL;

-- Create an index for better performance on created_at queries
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

-- Verify the migration
SELECT 
  'Migration completed' AS status,
  COUNT(*) AS total_orders,
  COUNT(CASE WHEN created_at IS NOT NULL THEN 1 END) AS orders_with_created_at
FROM orders;