-- Simple SQL script to add created_by column to customers table
-- Run this directly in Supabase SQL editor

-- Add created_by column to customers table
ALTER TABLE customers 
  ADD COLUMN IF NOT EXISTS created_by varchar;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_customers_created_by ON customers(created_by);

-- Verify the column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'customers' 
AND column_name = 'created_by';

-- Show a sample of existing customers to verify structure
SELECT id, name, phone, route, created_by 
FROM customers 
LIMIT 5;