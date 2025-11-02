-- Migration: add_created_by_to_customers.sql
-- Adds created_by column to customers table for sales rep segregation
-- Each sales rep can only see and manage customers they created

-- Add created_by column to track which sales rep created each customer
ALTER TABLE customers 
  ADD COLUMN IF NOT EXISTS created_by varchar;

-- Add index for better performance on filtering
CREATE INDEX IF NOT EXISTS idx_customers_created_by ON customers(created_by);

-- Update existing customers to have a default created_by (optional - can be set to admin or null)
-- UPDATE customers SET created_by = 'admin' WHERE created_by IS NULL;

-- Add comment to the column for clarity
COMMENT ON COLUMN customers.created_by IS 'ID of the sales rep/user who created this customer';

-- Note: 
-- 1. Sales reps will only see customers where created_by = currentUser.id
-- 2. When creating customers, set created_by = currentUser.id
-- 3. Admin users can see all customers regardless of created_by