-- Create routes table for managing delivery routes
-- This table will store route information separately from customers

-- Create the routes table
CREATE TABLE IF NOT EXISTS routes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_routes_name ON routes (name);
CREATE INDEX IF NOT EXISTS idx_routes_active ON routes (is_active);

-- Add RLS (Row Level Security) policies
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;

-- Policy to allow authenticated users to read all active routes
CREATE POLICY "Users can read all routes" ON routes
  FOR SELECT USING (auth.role() = 'authenticated');

-- Policy to allow authenticated users to insert routes
CREATE POLICY "Users can insert routes" ON routes
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Policy to allow authenticated users to update routes
CREATE POLICY "Users can update routes" ON routes
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Policy to allow authenticated users to delete routes
CREATE POLICY "Users can delete routes" ON routes
  FOR DELETE USING (auth.role() = 'authenticated');

-- Insert default routes
INSERT INTO routes (name, description, is_active) VALUES
  ('Route 1', 'Default delivery route 1', true),
  ('Route 2', 'Default delivery route 2', true),
  ('Route 3', 'Default delivery route 3', true),
  ('Unassigned', 'Default route for unassigned customers', true)
ON CONFLICT (name) DO NOTHING;

-- Add comment to document the table
COMMENT ON TABLE routes IS 'Stores delivery route information for customer assignment and logistics planning';
COMMENT ON COLUMN routes.name IS 'Unique route name identifier';
COMMENT ON COLUMN routes.description IS 'Optional description of the route';
COMMENT ON COLUMN routes.is_active IS 'Whether the route is currently active and can be assigned to customers';