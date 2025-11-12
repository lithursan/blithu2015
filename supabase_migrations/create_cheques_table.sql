-- Migration: create cheques table for Cheque Management
-- Adds a `cheques` table used by the frontend (ChequeManagement and Collections flows)

-- Ensure pgcrypto extension for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.cheques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_name text,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  bank text,
  cheque_number text,
  cheque_date date,
  deposit_date date,
  notes text,
  status text DEFAULT 'Received',
  -- 'created_by' references users.id; some deployments have users.id as text
  -- to avoid FK type mismatch keep a flexible text column here. If your
  -- users.id is uuid and you prefer a FK, change this to `uuid REFERENCES public.users(id)`.
  created_by text,
  created_at timestamptz DEFAULT now(),
  cleared_at timestamptz,
  bounced_at timestamptz,
  -- store related ids as text to avoid cross-schema type mismatches
  collection_id text,
  order_id text,
  customer_id text
);

-- Useful indexes for queries used in the UI
CREATE INDEX IF NOT EXISTS idx_cheques_deposit_date ON public.cheques(deposit_date);
CREATE INDEX IF NOT EXISTS idx_cheques_status ON public.cheques(LOWER(status));
CREATE INDEX IF NOT EXISTS idx_cheques_order_id ON public.cheques(order_id);
CREATE INDEX IF NOT EXISTS idx_cheques_collection_id ON public.cheques(collection_id);

-- Example: add a small comment to the table
COMMENT ON TABLE public.cheques IS 'Records received cheques and their statuses (Received, Cleared, Bounced)';
