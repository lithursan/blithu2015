-- Add route column to customers table for delivery route assignment
-- This allows customers to be organized by delivery routes for better logistics planning

ALTER TABLE customers 
ADD COLUMN route VARCHAR(100) DEFAULT 'Unassigned';

-- Create index on route for better query performance when filtering customers by route
CREATE INDEX IF NOT EXISTS idx_customers_route ON customers (route);

-- Update existing customers to have a default route
UPDATE customers 
SET route = 'Unassigned' 
WHERE route IS NULL;

-- Add comment to document the column
COMMENT ON COLUMN customers.route IS 'Delivery route assignment for logistics planning';