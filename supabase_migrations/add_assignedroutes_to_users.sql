-- Adds assignedroutes column to users table so Admins can grant Sales Reps access to specific routes
-- Uses jsonb to store an array of route names. This is compatible with the frontend which expects an array or JSON string.

ALTER TABLE IF EXISTS public.users
ADD COLUMN IF NOT EXISTS assignedroutes jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.users.assignedroutes IS 'JSON array of route names assigned to this user (Sales Rep)';

-- Ensure existing rows have a valid empty array
UPDATE public.users SET assignedroutes = '[]'::jsonb WHERE assignedroutes IS NULL;
