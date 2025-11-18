-- Fix Double-Counted Account Balances
-- This script recalculates all account balances correctly by using only transaction data

-- First, recalculate debit and credit balances from transactions
UPDATE accounting_accounts 
SET 
    debit_balance = COALESCE((
        SELECT SUM(debit_amount) 
        FROM accounting_transactions 
        WHERE account_id = accounting_accounts.id
    ), 0),
    credit_balance = COALESCE((
        SELECT SUM(credit_amount) 
        FROM accounting_transactions 
        WHERE account_id = accounting_accounts.id
    ), 0),
    updated_at = NOW();

-- Then, calculate net balance based on account type
UPDATE accounting_accounts 
SET balance = CASE 
    WHEN type IN ('ASSET', 'EXPENSE') THEN debit_balance - credit_balance
    WHEN type IN ('LIABILITY', 'EQUITY', 'REVENUE') THEN credit_balance - debit_balance
    ELSE 0
END;

-- Display results for verification
SELECT 
    code,
    name,
    type,
    debit_balance,
    credit_balance,
    balance
FROM accounting_accounts 
WHERE is_active = true
ORDER BY code;