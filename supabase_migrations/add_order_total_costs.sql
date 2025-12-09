-- Add order-level total cost and total margin columns to orders table
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS total_cost_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_margin_price numeric DEFAULT 0;

-- Optional: backfill existing orders by computing from orderitems if present (best-effort)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
    UPDATE public.orders
    SET total_cost_price = COALESCE((
      SELECT SUM(( (item->>'costPrice')::numeric * ((item->>'quantity')::numeric) ))
      FROM jsonb_array_elements(orderitems::jsonb) AS elem(item)
      WHERE (item->>'costPrice') IS NOT NULL
    ), 0),
    total_margin_price = COALESCE((
      SELECT SUM(( (item->>'marginPrice')::numeric * ((item->>'quantity')::numeric) ))
      FROM jsonb_array_elements(orderitems::jsonb) AS elem(item)
      WHERE (item->>'marginPrice') IS NOT NULL
    ), 0)
    WHERE orderitems IS NOT NULL;
  END IF;
EXCEPTION WHEN others THEN
  -- If casting fails, skip backfill to avoid blocking migration
  RAISE NOTICE 'Backfill of order totals failed; you may need to run manual backfill.';
END$$;
