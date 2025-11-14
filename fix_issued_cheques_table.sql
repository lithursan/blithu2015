-- Drop and recreate issued_cheques table with correct structure
DROP TABLE IF EXISTS public.issued_cheques CASCADE;

-- Create table with proper data types
CREATE TABLE public.issued_cheques (
    id SERIAL PRIMARY KEY,
    payee_name TEXT,
    amount NUMERIC DEFAULT 0,
    bank TEXT,
    cheque_number TEXT UNIQUE,
    issue_date DATE,
    cash_date DATE,
    purpose TEXT,
    notes TEXT,
    status TEXT DEFAULT 'Issued',
    created_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    cashed_at TIMESTAMP WITH TIME ZONE,
    stopped_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.issued_cheques ENABLE ROW LEVEL SECURITY;

-- Create simple policies
CREATE POLICY "Enable read access for all users" ON public.issued_cheques FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON public.issued_cheques FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON public.issued_cheques FOR UPDATE USING (true);
CREATE POLICY "Enable delete for all users" ON public.issued_cheques FOR DELETE USING (true);