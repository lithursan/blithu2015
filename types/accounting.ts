// Accounting Types for Double-Entry System

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  parentId?: string;
  balance: number;
  debitBalance: number;
  creditBalance: number;
  isActive: boolean;
  description?: string;
  created_at: string;
  updated_at: string;
}

export enum AccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  REVENUE = 'REVENUE',
  EXPENSE = 'EXPENSE'
}

export interface JournalEntry {
  id: string;
  entryNumber: string;
  date: string;
  description: string;
  reference?: string;
  totalAmount: number;
  status: EntryStatus;
  createdBy: string;
  created_at: string;
  updated_at: string;
  transactions: Transaction[];
}

export interface Transaction {
  id: string;
  journalEntryId: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debitAmount: number;
  creditAmount: number;
  description: string;
  created_at: string;
}

export enum EntryStatus {
  DRAFT = 'DRAFT',
  POSTED = 'POSTED',
  REVERSED = 'REVERSED'
}

export interface TrialBalance {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  debitBalance: number;
  creditBalance: number;
  netBalance: number;
}

export interface FinancialStatement {
  id: string;
  type: StatementType;
  periodStart: string;
  periodEnd: string;
  data: StatementData;
  generated_at: string;
}

export enum StatementType {
  BALANCE_SHEET = 'BALANCE_SHEET',
  INCOME_STATEMENT = 'INCOME_STATEMENT',
  CASH_FLOW = 'CASH_FLOW'
}

export interface StatementData {
  [key: string]: {
    accounts: Array<{
      accountCode: string;
      accountName: string;
      amount: number;
    }>;
    total: number;
  };
}