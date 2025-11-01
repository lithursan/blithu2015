-- Add unique constraint to phone numbers in customers table
-- This ensures phone number uniqueness at the database level

-- First, let's check if there are any duplicate phone numbers
SELECT phone, COUNT(*) as count 
FROM customers 
WHERE phone IS NOT NULL AND phone != ''
GROUP BY phone 
HAVING COUNT(*) > 1;

-- If there are duplicates, you'll need to fix them manually before running the constraint
-- You can update duplicate phone numbers like this:
-- UPDATE customers 
-- SET phone = phone || '_' || id 
-- WHERE id IN (
--   SELECT id FROM customers c1 
--   WHERE EXISTS (
--     SELECT 1 FROM customers c2 
--     WHERE c1.phone = c2.phone AND c1.id != c2.id
--   )
-- );

-- Add unique constraint to phone column
ALTER TABLE customers 
ADD CONSTRAINT unique_phone_number UNIQUE (phone);

-- Add index for better performance on phone lookups
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone);

-- Optional: Add a check constraint to ensure phone is not empty when provided
ALTER TABLE customers 
ADD CONSTRAINT check_phone_not_empty 
CHECK (phone IS NULL OR phone != '');