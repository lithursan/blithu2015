-- Migration: add costamount column to orders
-- Adds a numeric column to store the inventory cost of an order (costPrice * quantity sum)

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS costamount numeric DEFAULT 0;

-- Optional: backfill existing orders based on orderitems if products table has costprice
-- Note: This backfill requires joining JSON orderitems; it's commented out because it may not work on all DB setups.
-- UPDATE public.orders o
-- SET costamount = (
--   SELECT SUM((p.costprice::numeric) * ( (item->>'quantity')::numeric ))
--   FROM jsonb_array_elements(o.orderitems::jsonb) as item
--   JOIN products p ON (p.id::text = item->>'productId')
-- );
