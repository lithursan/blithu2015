-- Backfill daily_targets: copy a day's targets to the next day when missing
-- Run this in Supabase SQL editor (requires admin/service-role privileges)
-- Edit the SOURCE_DATE value in the "params" CTE below before running.

-- Example: change DATE '2025-12-29' to the date you want to copy from
WITH params AS (
  SELECT DATE '2025-12-29' AS src
)
INSERT INTO daily_targets (
  rep_id, scope_type, scope_id, target_date,
  amount_target, quantity_target, remaining_amount, remaining_quantity,
  created_by, created_at, updated_at
)
SELECT
  dt.rep_id,
  dt.scope_type,
  dt.scope_id,
  (params.src + INTERVAL '1 day')::date AS target_date,
  dt.amount_target,
  dt.quantity_target,
  COALESCE(dt.amount_target, 0) AS remaining_amount,
  COALESCE(dt.quantity_target, 0) AS remaining_quantity,
  dt.created_by,
  now() AS created_at,
  now() AS updated_at
FROM daily_targets dt
CROSS JOIN params
WHERE dt.target_date = params.src
  AND NOT EXISTS (
    SELECT 1 FROM daily_targets t2
    WHERE t2.target_date = (params.src + INTERVAL '1 day')::date
      AND t2.rep_id = dt.rep_id
      AND t2.scope_type = dt.scope_type
      AND (
        (t2.scope_id IS NULL AND dt.scope_id IS NULL)
        OR (t2.scope_id IS NOT NULL AND dt.scope_id IS NOT NULL AND t2.scope_id = dt.scope_id)
      )
  );

-- Notes:
-- 1) Replace the DATE '2025-12-29' in the params CTE with the source date you want to copy from.
-- 2) Run this as a single statement in Supabase SQL editor. It will only insert rows that do not already exist for the next day.
-- 3) If you want to backfill multiple consecutive days, run this repeatedly with different dates or create a small loop script.
-- 4) If Row Level Security (RLS) prevents INSERTs from your client, run this in the Supabase SQL editor (admin) or via a server-side function.
