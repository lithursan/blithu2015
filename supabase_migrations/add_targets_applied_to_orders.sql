-- Migration: add `targets_applied` flag to orders to prevent double-decrementing daily targets
-- Idempotent: safe to run multiple times
BEGIN;

ALTER TABLE IF EXISTS orders
  ADD COLUMN IF NOT EXISTS targets_applied boolean DEFAULT false;

-- Ensure existing NULLs (if any) are set to false
UPDATE orders SET targets_applied = false WHERE targets_applied IS NULL;

COMMIT;
