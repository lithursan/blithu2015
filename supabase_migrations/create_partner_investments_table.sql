-- Create partner_investments table for storing partner cash / investment snapshots
CREATE TABLE IF NOT EXISTS public.partner_investments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_date DATE NOT NULL,
    partner_investment NUMERIC(14,2) DEFAULT 0,
    loan_amount NUMERIC(14,2) DEFAULT 0,
    issued_cheque_amount NUMERIC(14,2) DEFAULT 0,
    credited_amount NUMERIC(14,2) DEFAULT 0,
    inventory_value NUMERIC(18,2) DEFAULT 0,
    expenses NUMERIC(14,2) DEFAULT 0,
    bank_balance NUMERIC(14,2) DEFAULT 0,
    note TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Optional indexes
CREATE INDEX IF NOT EXISTS idx_partner_investments_entry_date ON public.partner_investments(entry_date);
CREATE INDEX IF NOT EXISTS idx_partner_investments_created_by ON public.partner_investments(created_by);
