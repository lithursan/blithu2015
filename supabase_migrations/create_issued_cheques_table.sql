-- Create issued_cheques table for tracking cheques issued to vendors/suppliers
CREATE TABLE IF NOT EXISTS public.issued_cheques (
    id SERIAL PRIMARY KEY,
    payee_name VARCHAR(255) NOT NULL,
    amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    bank VARCHAR(255) NOT NULL,
    cheque_number VARCHAR(100) NOT NULL,
    issue_date DATE NOT NULL,
    cash_date DATE,
    purpose VARCHAR(500) NOT NULL,
    notes TEXT,
    status VARCHAR(50) DEFAULT 'Issued' CHECK (status IN ('Issued', 'Cashed', 'Stopped', 'Cancelled')),
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    cashed_at TIMESTAMP WITH TIME ZONE,
    stopped_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on cheque_number for uniqueness checks
CREATE UNIQUE INDEX IF NOT EXISTS idx_issued_cheques_number ON public.issued_cheques(cheque_number);

-- Create index on cash_date for faster filtering of upcoming cheques
CREATE INDEX IF NOT EXISTS idx_issued_cheques_cash_date ON public.issued_cheques(cash_date);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_issued_cheques_status ON public.issued_cheques(status);

-- Create index on created_by for user-specific queries
CREATE INDEX IF NOT EXISTS idx_issued_cheques_created_by ON public.issued_cheques(created_by);

-- Enable RLS (Row Level Security)
ALTER TABLE public.issued_cheques ENABLE ROW LEVEL SECURITY;

-- Create policies for issued_cheques table
CREATE POLICY "issued_cheques_select_policy" ON public.issued_cheques
    FOR SELECT USING (true);

CREATE POLICY "issued_cheques_insert_policy" ON public.issued_cheques
    FOR INSERT WITH CHECK (true);

CREATE POLICY "issued_cheques_update_policy" ON public.issued_cheques
    FOR UPDATE USING (true);

CREATE POLICY "issued_cheques_delete_policy" ON public.issued_cheques
    FOR DELETE USING (true);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_issued_cheques_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_issued_cheques_updated_at
    BEFORE UPDATE ON public.issued_cheques
    FOR EACH ROW
    EXECUTE FUNCTION update_issued_cheques_updated_at();