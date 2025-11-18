-- Accounting System Database Tables

-- Chart of Accounts Table
CREATE TABLE IF NOT EXISTS accounting_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
    parent_id UUID REFERENCES accounting_accounts(id),
    balance DECIMAL(15,2) DEFAULT 0,
    debit_balance DECIMAL(15,2) DEFAULT 0,
    credit_balance DECIMAL(15,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Journal Entries Table
CREATE TABLE IF NOT EXISTS accounting_journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_number VARCHAR(50) UNIQUE NOT NULL,
    date DATE NOT NULL,
    description TEXT NOT NULL,
    reference VARCHAR(100),
    total_amount DECIMAL(15,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'POSTED', 'REVERSED')),
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transactions Table (Journal Entry Lines)
CREATE TABLE IF NOT EXISTS accounting_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id UUID NOT NULL REFERENCES accounting_journal_entries(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounting_accounts(id),
    account_code VARCHAR(20) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    debit_amount DECIMAL(15,2) DEFAULT 0,
    credit_amount DECIMAL(15,2) DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Financial Statements Table
CREATE TABLE IF NOT EXISTS accounting_financial_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL CHECK (type IN ('BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    data JSONB NOT NULL,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_accounting_accounts_code ON accounting_accounts(code);
CREATE INDEX IF NOT EXISTS idx_accounting_accounts_type ON accounting_accounts(type);
CREATE INDEX IF NOT EXISTS idx_accounting_accounts_active ON accounting_accounts(is_active);

CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON accounting_journal_entries(date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON accounting_journal_entries(status);
CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_number ON accounting_journal_entries(entry_number);

CREATE INDEX IF NOT EXISTS idx_transactions_journal_entry ON accounting_transactions(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON accounting_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_amounts ON accounting_transactions(debit_amount, credit_amount);

-- Insert default Chart of Accounts
INSERT INTO accounting_accounts (code, name, type, description) VALUES
-- Assets
('1000', 'ASSETS', 'ASSET', 'Total Assets'),
('1010', 'Cash', 'ASSET', 'Cash on hand and in bank'),
('1020', 'Accounts Receivable', 'ASSET', 'Money owed by customers'),
('1030', 'Inventory', 'ASSET', 'Products and materials'),
('1040', 'Prepaid Expenses', 'ASSET', 'Expenses paid in advance'),
('1500', 'Equipment', 'ASSET', 'Business equipment and machinery'),
('1600', 'Vehicles', 'ASSET', 'Company vehicles'),

-- Liabilities
('2000', 'LIABILITIES', 'LIABILITY', 'Total Liabilities'),
('2010', 'Accounts Payable', 'LIABILITY', 'Money owed to suppliers'),
('2020', 'Accrued Expenses', 'LIABILITY', 'Expenses incurred but not yet paid'),
('2030', 'Short-term Loans', 'LIABILITY', 'Loans payable within one year'),
('2500', 'Long-term Debt', 'LIABILITY', 'Long-term loans and mortgages'),

-- Equity
('3000', 'EQUITY', 'EQUITY', 'Owner''s Equity'),
('3010', 'Capital', 'EQUITY', 'Owner''s initial investment'),
('3020', 'Retained Earnings', 'EQUITY', 'Accumulated profits'),
('3030', 'Drawings', 'EQUITY', 'Owner withdrawals'),

-- Revenue
('4000', 'REVENUE', 'REVENUE', 'Total Revenue'),
('4010', 'Sales Revenue', 'REVENUE', 'Revenue from product sales'),
('4020', 'Service Revenue', 'REVENUE', 'Revenue from services'),
('4030', 'Other Income', 'REVENUE', 'Miscellaneous income'),

-- Expenses
('5000', 'EXPENSES', 'EXPENSE', 'Total Expenses'),
('5010', 'Cost of Goods Sold', 'EXPENSE', 'Direct costs of products sold'),
('5020', 'Salaries Expense', 'EXPENSE', 'Employee salaries and wages'),
('5030', 'Rent Expense', 'EXPENSE', 'Office and warehouse rent'),
('5040', 'Utilities Expense', 'EXPENSE', 'Electricity, water, internet'),
('5050', 'Fuel Expense', 'EXPENSE', 'Vehicle fuel costs'),
('5060', 'Maintenance Expense', 'EXPENSE', 'Equipment and vehicle maintenance'),
('5070', 'Insurance Expense', 'EXPENSE', 'Business insurance premiums'),
('5080', 'Office Supplies', 'EXPENSE', 'Office materials and supplies'),
('5090', 'Marketing Expense', 'EXPENSE', 'Advertising and promotion costs'),
('5100', 'Professional Fees', 'EXPENSE', 'Legal and accounting fees'),
('5110', 'Depreciation Expense', 'EXPENSE', 'Asset depreciation'),
('5200', 'Other Expenses', 'EXPENSE', 'Miscellaneous business expenses')

ON CONFLICT (code) DO NOTHING;

-- Create a function to update account balances
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the account balance when a transaction is inserted, updated, or deleted
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        UPDATE accounting_accounts 
        SET 
            debit_balance = COALESCE((
                SELECT SUM(debit_amount) 
                FROM accounting_transactions 
                WHERE account_id = NEW.account_id
            ), 0),
            credit_balance = COALESCE((
                SELECT SUM(credit_amount) 
                FROM accounting_transactions 
                WHERE account_id = NEW.account_id
            ), 0),
            updated_at = NOW()
        WHERE id = NEW.account_id;
        
        -- Calculate net balance based on account type
        UPDATE accounting_accounts 
        SET balance = CASE 
            WHEN type IN ('ASSET', 'EXPENSE') THEN debit_balance - credit_balance
            WHEN type IN ('LIABILITY', 'EQUITY', 'REVENUE') THEN credit_balance - debit_balance
            ELSE 0
        END
        WHERE id = NEW.account_id;
        
        RETURN NEW;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        UPDATE accounting_accounts 
        SET 
            debit_balance = COALESCE((
                SELECT SUM(debit_amount) 
                FROM accounting_transactions 
                WHERE account_id = OLD.account_id
            ), 0),
            credit_balance = COALESCE((
                SELECT SUM(credit_amount) 
                FROM accounting_transactions 
                WHERE account_id = OLD.account_id
            ), 0),
            updated_at = NOW()
        WHERE id = OLD.account_id;
        
        -- Calculate net balance based on account type
        UPDATE accounting_accounts 
        SET balance = CASE 
            WHEN type IN ('ASSET', 'EXPENSE') THEN debit_balance - credit_balance
            WHEN type IN ('LIABILITY', 'EQUITY', 'REVENUE') THEN credit_balance - debit_balance
            ELSE 0
        END
        WHERE id = OLD.account_id;
        
        RETURN OLD;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update account balances
CREATE TRIGGER trigger_update_account_balance
    AFTER INSERT OR UPDATE OR DELETE ON accounting_transactions
    FOR EACH ROW EXECUTE FUNCTION update_account_balance();

-- Create a function to generate entry numbers
CREATE OR REPLACE FUNCTION generate_entry_number()
RETURNS TRIGGER AS $$
DECLARE
    last_number INTEGER;
BEGIN
    -- Get the last entry number
    SELECT COALESCE(
        MAX(CAST(SUBSTRING(entry_number FROM 3) AS INTEGER)), 
        0
    ) INTO last_number
    FROM accounting_journal_entries 
    WHERE entry_number ~ '^JE[0-9]+$';
    
    -- Generate new entry number
    NEW.entry_number := 'JE' || LPAD((last_number + 1)::TEXT, 6, '0');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically generate entry numbers
CREATE TRIGGER trigger_generate_entry_number
    BEFORE INSERT ON accounting_journal_entries
    FOR EACH ROW 
    WHEN (NEW.entry_number IS NULL OR NEW.entry_number = '')
    EXECUTE FUNCTION generate_entry_number();

-- RLS Policies (Row Level Security)
ALTER TABLE accounting_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_financial_statements ENABLE ROW LEVEL SECURITY;

-- Only allow access to authenticated users
CREATE POLICY "accounting_accounts_policy" ON accounting_accounts
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "accounting_journal_entries_policy" ON accounting_journal_entries
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "accounting_transactions_policy" ON accounting_transactions
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "accounting_financial_statements_policy" ON accounting_financial_statements
    FOR ALL USING (auth.role() = 'authenticated');