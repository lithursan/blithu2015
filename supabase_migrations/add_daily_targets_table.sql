-- Create `daily_targets` table to store per-sales-rep daily targets
-- Supports scoping by supplier, category or product and tracks both amount and quantity targets.

BEGIN;

-- Create table
CREATE TABLE IF NOT EXISTS daily_targets (
  id BIGSERIAL PRIMARY KEY,
  rep_id TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('supplier','category','product')),
  scope_id TEXT NULL,
  target_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount_target NUMERIC(14,2) DEFAULT NULL,
  quantity_target BIGINT DEFAULT NULL,
  remaining_amount NUMERIC(14,2) DEFAULT 0,
  remaining_quantity BIGINT DEFAULT 0,
  carry_over BOOLEAN DEFAULT TRUE,
  created_by TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Foreign key references (best-effort; adjust if your users table is named differently)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dailytargets_rep') THEN
    ALTER TABLE daily_targets
      ADD CONSTRAINT fk_dailytargets_rep
        FOREIGN KEY (rep_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dailytargets_createdby') THEN
    ALTER TABLE daily_targets
      ADD CONSTRAINT fk_dailytargets_createdby
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END$$;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_dailytargets_rep_date ON daily_targets(rep_id, target_date);
CREATE INDEX IF NOT EXISTS idx_dailytargets_scope ON daily_targets(scope_type, scope_id, target_date);

-- Enforce one row per rep+scope+date to allow upserts during carry-over
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_dailytargets_unique') THEN
    ALTER TABLE daily_targets
      ADD CONSTRAINT uq_dailytargets_unique UNIQUE (rep_id, scope_type, scope_id, target_date);
  END IF;
END$$;

-- Trigger to update `updated_at` timestamp on update
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_on_daily_targets ON daily_targets;
CREATE TRIGGER set_updated_at_on_daily_targets
  BEFORE UPDATE ON daily_targets
  FOR EACH ROW
  EXECUTE PROCEDURE trg_set_updated_at();

-- Comment describing purpose
COMMENT ON TABLE daily_targets IS 'Daily sales targets for field staff (amount and/or quantity), scoped by supplier/category/product.';

COMMIT;

-- Notes:
-- 1) Application code should set `remaining_amount` and `remaining_quantity` equal to the targets when creating a new target for the day.
-- 2) Access control: only Admin / Manager / Secretary should be allowed to INSERT/UPDATE/DELETE; Sales Rep view-only.
-- 3) When orders are created, backend should decrement `remaining_amount` and/or `remaining_quantity` for matching targets (by rep and matching scope) in a transactional manner.

-- Idempotent attempt to convert existing `scope_id` to TEXT when table was previously created
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_targets' AND column_name='scope_id') THEN
    -- Only alter if column is not already text
    IF (SELECT data_type FROM information_schema.columns WHERE table_name='daily_targets' AND column_name='scope_id') <> 'text' THEN
      ALTER TABLE daily_targets
        ALTER COLUMN scope_id TYPE TEXT USING scope_id::text;
    END IF;
  END IF;
END$$;

-- SQL function to carry over remaining targets from previous day to today.
-- Run this nightly (pg_cron or external scheduler) to add leftover targets to next day.
-- It upserts carry-over amounts into today's row and clears yesterday's remaining values.

BEGIN;

CREATE OR REPLACE FUNCTION carry_over_daily_targets()
RETURNS VOID AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT * FROM daily_targets
    WHERE target_date = CURRENT_DATE - INTERVAL '1 day'
      AND carry_over = TRUE
      AND (COALESCE(remaining_amount,0) > 0 OR COALESCE(remaining_quantity,0) > 0)
  LOOP
    -- Insert carry amounts as a new row for today or add to existing today's target
    INSERT INTO daily_targets (rep_id, scope_type, scope_id, target_date, amount_target, quantity_target, remaining_amount, remaining_quantity, created_by, created_at, updated_at, carry_over)
    VALUES (
      rec.rep_id,
      rec.scope_type,
      rec.scope_id,
      CURRENT_DATE,
      NULL, -- amount_target for carry is left NULL; we add remaining_amount to today's remaining_amount instead
      NULL,
      COALESCE(rec.remaining_amount,0),
      COALESCE(rec.remaining_quantity,0),
      rec.created_by,
      NOW(),
      NOW(),
      rec.carry_over
    )
    ON CONFLICT (rep_id, scope_type, scope_id, target_date) DO UPDATE
    SET
      remaining_amount = COALESCE(daily_targets.remaining_amount,0) + COALESCE(EXCLUDED.remaining_amount,0),
      remaining_quantity = COALESCE(daily_targets.remaining_quantity,0) + COALESCE(EXCLUDED.remaining_quantity,0),
      amount_target = CASE
        WHEN COALESCE(daily_targets.amount_target,0) = 0 THEN COALESCE(EXCLUDED.remaining_amount,0)
        ELSE COALESCE(daily_targets.amount_target,0) + COALESCE(EXCLUDED.remaining_amount,0)
      END,
      quantity_target = CASE
        WHEN COALESCE(daily_targets.quantity_target,0) = 0 THEN COALESCE(EXCLUDED.remaining_quantity,0)
        ELSE COALESCE(daily_targets.quantity_target,0) + COALESCE(EXCLUDED.remaining_quantity,0)
      END,
      updated_at = NOW();

    -- clear yesterday's remaining values to avoid double-carry
    UPDATE daily_targets
    SET remaining_amount = 0, remaining_quantity = 0, updated_at = NOW()
    WHERE id = rec.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMIT;

