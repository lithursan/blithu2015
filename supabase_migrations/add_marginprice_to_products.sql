-- Adds a numeric column `marginprice` to products to store the margin price separately
-- Safe to run multiple times; uses IF NOT EXISTS to avoid errors on repeat
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS marginprice numeric DEFAULT 0;

-- Optionally backfill marginprice from existing costprice when marginprice is NULL or zero
-- Uncomment and run once if you want to backfill existing rows:
-- UPDATE public.products SET marginprice = costprice WHERE (marginprice IS NULL OR marginprice = 0) AND (costprice IS NOT NULL);
