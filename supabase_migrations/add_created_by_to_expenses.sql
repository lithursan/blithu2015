-- Migration: add_created_by_to_expenses.sql
-- Adds created_by column (uuid) and tighter per-user RLS policies for the expenses table.

ALTER TABLE IF EXISTS public.expenses
  ADD COLUMN IF NOT EXISTS created_by uuid;

-- Ensure extension for gen_random_uuid exists (safe no-op if present)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enable RLS if not already
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to SELECT
DROP POLICY IF EXISTS "Allow authenticated select" ON public.expenses;
CREATE POLICY "Allow authenticated select" ON public.expenses
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Allow authenticated INSERT only when created_by = auth.uid()
DROP POLICY IF EXISTS "Allow authenticated insert" ON public.expenses;
CREATE POLICY "Allow authenticated insert" ON public.expenses
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Allow owners to UPDATE/DELETE only on their rows
DROP POLICY IF EXISTS "Allow authenticated update" ON public.expenses;
CREATE POLICY "Allow authenticated update" ON public.expenses
  FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Allow authenticated delete" ON public.expenses;
CREATE POLICY "Allow authenticated delete" ON public.expenses
  FOR DELETE
  USING (auth.uid() = created_by);

-- Note: After running this migration the client should include created_by = auth.uid() when inserting new rows.
