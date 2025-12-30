-- Create functions to backfill daily_targets from a source date to the next day
-- Run this migration in Supabase SQL editor (requires admin/service-role privileges)

-- Function: backfill_prev_day_targets_for_date(src_date date)
CREATE OR REPLACE FUNCTION backfill_prev_day_targets_for_date(src_date date)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO daily_targets (
    rep_id, scope_type, scope_id, target_date,
    amount_target, quantity_target, remaining_amount, remaining_quantity,
    created_by, created_at, updated_at
  )
  SELECT
    dt.rep_id,
    dt.scope_type,
    dt.scope_id,
    (src_date + INTERVAL '1 day')::date AS target_date,
    dt.amount_target,
    dt.quantity_target,
    COALESCE(dt.amount_target, 0) AS remaining_amount,
    COALESCE(dt.quantity_target, 0) AS remaining_quantity,
    dt.created_by,
    now() AS created_at,
    now() AS updated_at
  FROM daily_targets dt
  WHERE dt.target_date = src_date
    AND NOT EXISTS (
      SELECT 1 FROM daily_targets t2
      WHERE t2.target_date = (src_date + INTERVAL '1 day')::date
        AND t2.rep_id = dt.rep_id
        AND t2.scope_type = dt.scope_type
        AND (
          (t2.scope_id IS NULL AND dt.scope_id IS NULL)
          OR (t2.scope_id IS NOT NULL AND dt.scope_id IS NOT NULL AND t2.scope_id = dt.scope_id)
        )
    );
END;
$$;

-- Convenience wrapper: run for yesterday
CREATE OR REPLACE FUNCTION backfill_prev_day_targets_yesterday()
RETURNS void
LANGUAGE sql
AS $$
  SELECT backfill_prev_day_targets_for_date((now()::date - INTERVAL '1 day')::date);
$$;

-- Scheduling example (optional): using pg_cron extension
-- If your DB has pg_cron installed, schedule the wrapper to run daily at 01:30 AM:
-- SELECT cron.schedule('daily_backfill_targets', '30 1 * * *', $$SELECT backfill_prev_day_targets_yesterday();$$);

-- Notes:
-- - Run this as an admin in the Supabase SQL editor.
-- - If pg_cron is not available, you can schedule a server-side call to the wrapper using Supabase Scheduled/Edge Functions or an external cron (e.g., GitHub Actions).
-- - RLS policies must allow the job user to INSERT into `daily_targets`.
