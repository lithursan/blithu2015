-- Creates the `collections` table used by the frontend/server code.
-- Adds a unique index on (order_id, collection_type) so `upsert(..., { onConflict: 'order_id,collection_type' })` works.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.collections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id text,
  customer_id uuid,
  collection_type text NOT NULL,
  amount numeric DEFAULT 0,
  status text DEFAULT 'pending',
  collected_by text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  collected_at timestamptz,
  completed_by text,
  completed_at timestamptz,
  notes text
);

-- Ensure upsert on (order_id, collection_type) works consistently.
CREATE UNIQUE INDEX IF NOT EXISTS collections_orderid_type_idx ON public.collections (order_id, collection_type);

-- Optional: ensure minimal permissions if you use RLS or need to grant to anon/auth roles.
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.collections TO authenticated;
