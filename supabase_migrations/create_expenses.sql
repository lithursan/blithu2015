-- Migration: create_expenses.sql
-- Creates a simple `expenses` table and example RLS policies for authenticated users.

-- Enable pgcrypto for gen_random_uuid() if not already enabled in your DB
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create table
CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  amount numeric NOT NULL,
  category text,
  note text,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security (recommended)
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Policy: allow authenticated users to SELECT
CREATE POLICY "Allow authenticated select" ON public.expenses
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Policy: allow authenticated users to INSERT
CREATE POLICY "Allow authenticated insert" ON public.expenses
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Policy: allow owners to UPDATE/DELETE (you can change this later)
-- These example policies allow any authenticated user to modify any row.
-- For per-user ownership you'd store created_by and check auth.uid() = created_by
CREATE POLICY "Allow authenticated update" ON public.expenses
  FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Allow authenticated delete" ON public.expenses
  FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Notes:
-- 1) The above policies assume users sign in and have a valid JWT from Supabase Auth.
-- 2) If you want anonymous/public access (not recommended), replace `auth.uid() IS NOT NULL` with `true`.
-- 3) For stronger control, add a `created_by uuid` column and set policies so users can only modify their own rows.
