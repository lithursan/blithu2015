-- Add free items column to orders table
-- This will store free items separately from regular order items

ALTER TABLE orders 
ADD COLUMN freeitems TEXT DEFAULT '[]';

-- Update the column comment for clarity
COMMENT ON COLUMN orders.freeitems IS 'JSON array of free items given with the order: [{"productId": "string", "quantity": number}]';