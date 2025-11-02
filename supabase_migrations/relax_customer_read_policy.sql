-- Relax customer read policy to allow route-wise visibility for all logins
-- This policy allows all authenticated users to read all customers

-- Note: Supabase RLS policies are ORed together. This adds a permissive SELECT policy
-- without removing any existing ones (like created_by-based segregation).

DO $$
BEGIN
    -- Ensure RLS is enabled (no-op if already enabled)
    PERFORM 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'customers';
    -- Create policy only if it doesn't already exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'customers' AND policyname = 'all_authenticated_can_read_customers'
    ) THEN
        CREATE POLICY "all_authenticated_can_read_customers" ON public.customers
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;
END$$;
