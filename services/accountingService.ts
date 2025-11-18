import { Account, AccountType, JournalEntry, Transaction, TrialBalance, EntryStatus } from '../types/accounting';
import { supabase } from '../supabaseClient';

export class AccountingService {
  // Chart of Accounts Management
  static async createAccount(account: Omit<Account, 'id' | 'created_at' | 'updated_at'>): Promise<Account> {
    console.log('Creating account:', account);
    
    const { data, error } = await supabase
      .from('accounting_accounts')
      .insert({
        code: account.code,
        name: account.name,
        type: account.type,
        parent_id: account.parentId || null,
        balance: account.balance || 0,
        debit_balance: account.debitBalance || 0,
        credit_balance: account.creditBalance || 0,
        is_active: account.isActive !== false,
        description: account.description || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Database error creating account:', error);
      throw error;
    }
    
    // Map database columns back to interface
    return {
      id: data.id,
      code: data.code,
      name: data.name,
      type: data.type,
      parentId: data.parent_id,
      balance: data.balance,
      debitBalance: data.debit_balance,
      creditBalance: data.credit_balance,
      isActive: data.is_active,
      description: data.description,
      created_at: data.created_at,
      updated_at: data.updated_at
    };
  }

  static async getAccounts(): Promise<Account[]> {
    const { data, error } = await supabase
      .from('accounting_accounts')
      .select('*')
      .eq('is_active', true)
      .order('code');

    if (error) {
      console.error('Error fetching accounts:', error);
      throw error;
    }
    
    // Map database columns to interface
    return (data || []).map(account => ({
      id: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      parentId: account.parent_id,
      balance: account.balance,
      debitBalance: account.debit_balance,
      creditBalance: account.credit_balance,
      isActive: account.is_active,
      description: account.description,
      created_at: account.created_at,
      updated_at: account.updated_at
    }));
  }

  // DEPRECATED: This method is no longer needed as account balances are automatically
  // updated by the database trigger 'trigger_update_account_balance'
  // @deprecated Use database trigger instead
  static async updateAccountBalance(accountId: string, debitAmount: number, creditAmount: number): Promise<void> {
    console.warn('updateAccountBalance is deprecated - balances are automatically updated by database trigger');
    // Method kept for backward compatibility but does nothing
    // The database trigger handles all balance updates automatically
  }

  // Journal Entry Management
  static async createJournalEntry(
    entry: Omit<JournalEntry, 'id' | 'created_at' | 'updated_at' | 'transactions'>,
    transactions: Omit<Transaction, 'id' | 'journalEntryId' | 'created_at'>[]
  ): Promise<JournalEntry> {
    console.log('AccountingService.createJournalEntry called with:', { entry, transactions });
    
    // Validate input
    if (!entry.description || entry.description.trim() === '') {
      throw new Error('Description is required');
    }
    
    if (!entry.createdBy) {
      throw new Error('CreatedBy is required');
    }
    
    if (!transactions || transactions.length === 0) {
      throw new Error('At least one transaction is required');
    }

    // Validate double-entry rules
    const totalDebits = transactions.reduce((sum, t) => sum + t.debitAmount, 0);
    const totalCredits = transactions.reduce((sum, t) => sum + t.creditAmount, 0);

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      throw new Error('Debits must equal credits in double-entry accounting');
    }

    // Generate entry number
    const entryNumber = await this.generateEntryNumber();

    // Create journal entry
    const { data: journalEntry, error: entryError } = await supabase
      .from('accounting_journal_entries')
      .insert({
        entry_number: entry.entryNumber || entryNumber,
        date: entry.date,
        description: entry.description,
        reference: entry.reference || null,
        total_amount: entry.totalAmount || totalDebits,
        status: entry.status,
        created_by: entry.createdBy,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (entryError) {
      console.error('Error creating journal entry:', entryError);
      throw new Error(`Failed to create journal entry: ${entryError.message}`);
    }

    // Create transactions
    const transactionData = transactions.map(t => ({
      journal_entry_id: journalEntry.id,
      account_id: t.accountId,
      account_code: t.accountCode,
      account_name: t.accountName,
      debit_amount: t.debitAmount,
      credit_amount: t.creditAmount,
      description: t.description,
      created_at: new Date().toISOString()
    }));

    const { data: createdTransactions, error: transactionError } = await supabase
      .from('accounting_transactions')
      .insert(transactionData)
      .select();

    if (transactionError) {
      console.error('Error creating transactions:', transactionError);
      throw new Error(`Failed to create transactions: ${transactionError.message}`);
    }

    // Note: Account balances are automatically updated by database trigger
    // No manual balance update needed here

    // Map database columns back to interface
    const mappedTransactions = createdTransactions.map(t => ({
      id: t.id,
      journalEntryId: t.journal_entry_id,
      accountId: t.account_id,
      accountCode: t.account_code,
      accountName: t.account_name,
      debitAmount: t.debit_amount,
      creditAmount: t.credit_amount,
      description: t.description,
      created_at: t.created_at
    }));

    return {
      id: journalEntry.id,
      entryNumber: journalEntry.entry_number,
      date: journalEntry.date,
      description: journalEntry.description,
      reference: journalEntry.reference,
      totalAmount: journalEntry.total_amount,
      status: journalEntry.status,
      createdBy: journalEntry.created_by,
      created_at: journalEntry.created_at,
      updated_at: journalEntry.updated_at,
      transactions: mappedTransactions
    };
  }

  static async postJournalEntry(entryId: string): Promise<void> {
    // Get journal entry with transactions
    const { data: entry, error: entryError } = await supabase
      .from('accounting_journal_entries')
      .select(`
        *,
        accounting_transactions (*)
      `)
      .eq('id', entryId)
      .single();

    if (entryError) throw entryError;

    if (entry.status !== 'DRAFT') {
      throw new Error('Only draft entries can be posted');
    }

    // Note: Account balances are automatically updated by database trigger
    // No manual balance update needed here

    // Update entry status
    const { error: updateError } = await supabase
      .from('accounting_journal_entries')
      .update({
        status: 'POSTED',
        updated_at: new Date().toISOString()
      })
      .eq('id', entryId);

    if (updateError) throw updateError;
  }

  static async getJournalEntries(limit = 50, offset = 0): Promise<JournalEntry[]> {
    const { data, error } = await supabase
      .from('accounting_journal_entries')
      .select(`
        *,
        accounting_transactions (
          *,
          accounting_accounts (code, name, type)
        )
      `)
      .order('date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching journal entries:', error);
      throw error;
    }

    // Map database columns to interface
    return (data || []).map(entry => ({
      id: entry.id,
      entryNumber: entry.entry_number,
      date: entry.date,
      description: entry.description,
      reference: entry.reference,
      totalAmount: parseFloat(entry.total_amount) || 0,
      status: entry.status,
      createdBy: entry.created_by,
      created_at: entry.created_at,
      updated_at: entry.updated_at,
      transactions: (entry.accounting_transactions || []).map(t => ({
        id: t.id,
        journalEntryId: t.journal_entry_id,
        accountId: t.account_id,
        accountCode: t.account_code || (t.accounting_accounts ? t.accounting_accounts.code : 'N/A'),
        accountName: t.account_name || (t.accounting_accounts ? t.accounting_accounts.name : 'Unknown Account'),
        debitAmount: parseFloat(t.debit_amount) || 0,
        creditAmount: parseFloat(t.credit_amount) || 0,
        description: t.description || '',
        created_at: t.created_at
      }))
    }));
  }

  // Trial Balance
  static async getTrialBalance(asOfDate?: string): Promise<TrialBalance[]> {
    let query = supabase
      .from('accounting_accounts')
      .select('*')
      .eq('is_active', true);

    if (asOfDate) {
      // For historical trial balance, we would need to calculate balances as of specific date
      // This would require querying transactions up to that date
    }

    const { data: accounts, error } = await query.order('code');

    if (error) {
      console.error('Error fetching trial balance:', error);
      throw error;
    }

    return accounts.map(account => ({
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      accountType: account.type,
      debitBalance: account.debit_balance || 0,
      creditBalance: account.credit_balance || 0,
      netBalance: account.balance || 0
    }));
  }

  // Financial Statements
  static async generateBalanceSheet(asOfDate: string): Promise<any> {
    const accounts = await this.getAccounts();
    
    const assets = accounts.filter(a => a.type === AccountType.ASSET);
    const liabilities = accounts.filter(a => a.type === AccountType.LIABILITY);
    const equity = accounts.filter(a => a.type === AccountType.EQUITY);

    const totalAssets = assets.reduce((sum, a) => sum + a.balance, 0);
    const totalLiabilities = liabilities.reduce((sum, a) => sum + a.balance, 0);
    const totalEquity = equity.reduce((sum, a) => sum + a.balance, 0);

    return {
      asOfDate,
      assets: {
        accounts: assets.map(a => ({
          accountCode: a.code,
          accountName: a.name,
          amount: a.balance
        })),
        total: totalAssets
      },
      liabilities: {
        accounts: liabilities.map(a => ({
          accountCode: a.code,
          accountName: a.name,
          amount: a.balance
        })),
        total: totalLiabilities
      },
      equity: {
        accounts: equity.map(a => ({
          accountCode: a.code,
          accountName: a.name,
          amount: a.balance
        })),
        total: totalEquity
      }
    };
  }

  static async generateIncomeStatement(fromDate: string, toDate: string): Promise<any> {
    const accounts = await this.getAccounts();
    
    const revenues = accounts.filter(a => a.type === AccountType.REVENUE);
    const expenses = accounts.filter(a => a.type === AccountType.EXPENSE);

    const totalRevenue = revenues.reduce((sum, a) => sum + a.balance, 0);
    const totalExpenses = expenses.reduce((sum, a) => sum + a.balance, 0);
    const netIncome = totalRevenue - totalExpenses;

    return {
      fromDate,
      toDate,
      revenues: {
        accounts: revenues.map(a => ({
          accountCode: a.code,
          accountName: a.name,
          amount: a.balance
        })),
        total: totalRevenue
      },
      expenses: {
        accounts: expenses.map(a => ({
          accountCode: a.code,
          accountName: a.name,
          amount: a.balance
        })),
        total: totalExpenses
      },
      netIncome
    };
  }

  // Utility methods
  private static async generateEntryNumber(): Promise<string> {
    const { data, error } = await supabase
      .from('accounting_journal_entries')
      .select('entry_number')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error generating entry number:', error);
      throw error;
    }

    const lastEntry = data?.[0];
    const lastNumber = lastEntry ? parseInt(lastEntry.entry_number.replace('JE', '')) : 0;
    
    return `JE${String(lastNumber + 1).padStart(6, '0')}`;
  }

  // Predefined journal entry templates
  static async recordSale(customerId: string, amount: number, description: string, createdBy: string): Promise<JournalEntry> {
    const transactions = [
      {
        accountId: 'CASH', // Cash/Bank account
        accountCode: '1010',
        accountName: 'Cash',
        debitAmount: amount,
        creditAmount: 0,
        description: `Sale to customer ${customerId}`
      },
      {
        accountId: 'SALES', // Sales Revenue account
        accountCode: '4010',
        accountName: 'Sales Revenue',
        debitAmount: 0,
        creditAmount: amount,
        description: `Sale to customer ${customerId}`
      }
    ];

    const totalAmount = transactions.reduce((sum, t) => sum + Math.max(t.debitAmount, t.creditAmount), 0);
    const entryNumber = `JE-${Date.now()}`;
    
    return this.createJournalEntry({
      entryNumber,
      date: new Date().toISOString(),
      description,
      totalAmount,
      status: EntryStatus.POSTED,
      createdBy
    }, transactions);
  }

  static async recordExpense(expenseAccountId: string, amount: number, description: string, createdBy: string): Promise<JournalEntry> {
    const transactions = [
      {
        accountId: expenseAccountId,
        accountCode: '5010',
        accountName: 'General Expenses',
        debitAmount: amount,
        creditAmount: 0,
        description
      },
      {
        accountId: 'CASH',
        accountCode: '1010',
        accountName: 'Cash',
        debitAmount: 0,
        creditAmount: amount,
        description
      }
    ];

    const totalAmount = transactions.reduce((sum, t) => sum + Math.max(t.debitAmount, t.creditAmount), 0);
    const entryNumber = `JE-${Date.now()}`;
    
    return this.createJournalEntry({
      entryNumber,
      date: new Date().toISOString(),
      description,
      totalAmount,
      status: EntryStatus.POSTED,
      createdBy
    }, transactions);
  }

  static async generateCashFlowStatement(fromDate: string, toDate: string): Promise<any> {
    try {
      // Get all transactions for the period
      const { data: transactions, error: transError } = await supabase
        .from('accounting_transactions')
        .select(`
          *,
          account:accounting_accounts(*)
        `)
        .gte('created_at', fromDate)
        .lte('created_at', toDate + ' 23:59:59');

      if (transError) throw transError;

      // Initialize cash flow categories
      const cashFlows = {
        operating: { inflows: [], outflows: [], net: 0 },
        investing: { inflows: [], outflows: [], net: 0 },
        financing: { inflows: [], outflows: [], net: 0 }
      };

      // Categorize transactions based on account types
      transactions?.forEach((transaction: any) => {
        const amount = transaction.debit_amount || transaction.credit_amount || 0;
        const accountType = transaction.account?.type;
        const accountName = transaction.account?.name || 'Unknown Account';
        const isInflow = transaction.credit_amount > 0;

        // Operating Activities (Revenue and Expense accounts)
        if (accountType === 'REVENUE' || accountType === 'EXPENSE') {
          const category = isInflow ? 'inflows' : 'outflows';
          cashFlows.operating[category].push({
            accountName,
            amount,
            description: transaction.description
          });
        }
        // Investing Activities (Fixed Assets, Investments)
        else if (accountType === 'ASSET' && (
          accountName.toLowerCase().includes('equipment') ||
          accountName.toLowerCase().includes('building') ||
          accountName.toLowerCase().includes('investment') ||
          accountName.toLowerCase().includes('property')
        )) {
          const category = isInflow ? 'inflows' : 'outflows';
          cashFlows.investing[category].push({
            accountName,
            amount,
            description: transaction.description
          });
        }
        // Financing Activities (Loans, Capital, Dividends)
        else if (accountType === 'LIABILITY' || accountType === 'EQUITY' || 
          accountName.toLowerCase().includes('loan') ||
          accountName.toLowerCase().includes('capital') ||
          accountName.toLowerCase().includes('dividend')) {
          const category = isInflow ? 'inflows' : 'outflows';
          cashFlows.financing[category].push({
            accountName,
            amount,
            description: transaction.description
          });
        }
      });

      // Calculate net cash flows for each category
      cashFlows.operating.net = 
        cashFlows.operating.inflows.reduce((sum, t) => sum + t.amount, 0) -
        cashFlows.operating.outflows.reduce((sum, t) => sum + t.amount, 0);

      cashFlows.investing.net = 
        cashFlows.investing.inflows.reduce((sum, t) => sum + t.amount, 0) -
        cashFlows.investing.outflows.reduce((sum, t) => sum + t.amount, 0);

      cashFlows.financing.net = 
        cashFlows.financing.inflows.reduce((sum, t) => sum + t.amount, 0) -
        cashFlows.financing.outflows.reduce((sum, t) => sum + t.amount, 0);

      // Calculate total net cash flow
      const totalNetCashFlow = cashFlows.operating.net + cashFlows.investing.net + cashFlows.financing.net;

      // Get beginning and ending cash balances
      const { data: cashAccounts, error: cashError } = await supabase
        .from('accounting_accounts')
        .select('*')
        .or('type.eq.ASSET')
        .ilike('name', '%cash%');

      let beginningCash = 0;
      let endingCash = 0;

      if (cashAccounts && !cashError) {
        beginningCash = cashAccounts.reduce((sum, acc) => sum + (acc.debit_balance || 0), 0);
        endingCash = beginningCash + totalNetCashFlow;
      }

      return {
        fromDate,
        toDate,
        operating: cashFlows.operating,
        investing: cashFlows.investing,
        financing: cashFlows.financing,
        totalNetCashFlow,
        beginningCash,
        endingCash
      };
    } catch (error) {
      console.error('Error generating cash flow statement:', error);
      throw error;
    }
  }
}