import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { useAuth } from '../../contexts/AuthContext';
import { AccountingService } from '../../services/accountingService';
import { PDFService } from '../../services/pdfService';
import { Account, AccountType, JournalEntry, Transaction } from '../../types/accounting';
import { UserRole } from '../../types';

const AccountingDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [trialBalance, setTrialBalance] = useState<any[]>([]);
  const [balanceSheet, setBalanceSheet] = useState<any>(null);
  const [incomeStatement, setIncomeStatement] = useState<any>(null);
  const [cashFlowStatement, setCashFlowStatement] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Check if user is admin
  const isAdmin = currentUser?.role === UserRole.Admin;

  useEffect(() => {
    if (isAdmin) {
      loadAccountingData();
    }
  }, [isAdmin]);

  const handleDownloadPDF = async () => {
    try {
      const totalBalance = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);
      
      PDFService.generateAccountingDashboard({
        totalAccounts: accounts.length,
        totalBalance,
        trialBalance,
        recentEntries: journalEntries.slice(0, 10),
        cashFlow: cashFlowStatement
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    }
  };

  const loadAccountingData = async () => {
    try {
      setLoading(true);
      const [accountsData, entriesData, trialBalanceData] = await Promise.all([
        AccountingService.getAccounts(),
        AccountingService.getJournalEntries(20),
        AccountingService.getTrialBalance()
      ]);

      setAccounts(accountsData);
      setJournalEntries(entriesData);
      setTrialBalance(trialBalanceData);

      // Generate financial statements
      const today = new Date().toISOString().split('T')[0];
      const firstDayOfYear = `${new Date().getFullYear()}-01-01`;
      
      const [balanceSheetData, incomeStatementData, cashFlowData] = await Promise.all([
        AccountingService.generateBalanceSheet(today),
        AccountingService.generateIncomeStatement(firstDayOfYear, today),
        AccountingService.generateCashFlowStatement(firstDayOfYear, today)
      ]);

      setBalanceSheet(balanceSheetData);
      setIncomeStatement(incomeStatementData);
      setCashFlowStatement(cashFlowData);
    } catch (error) {
      console.error('Error loading accounting data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-4">Access Denied</h1>
        <p className="text-slate-600 dark:text-slate-400">Only Admin users can access the Accounting System.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="text-slate-500">Loading accounting data...</div>
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return `LKR ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Accounting System</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Double-Entry Bookkeeping & Financial Management
          </p>
        </div>
        <button
          onClick={handleDownloadPDF}
          className="mt-4 sm:mt-0 flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m-3-3l3 3 3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
          Download PDF
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <span className="text-2xl">📊</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Chart of Accounts</p>
                <p className="text-2xl font-bold text-blue-600">{accounts.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <span className="text-2xl">📝</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Journal Entries</p>
                <p className="text-2xl font-bold text-green-600">{journalEntries.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <span className="text-2xl">💰</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Assets</p>
                <p className="text-xl font-bold text-purple-600">
                  {balanceSheet ? formatCurrency(balanceSheet.assets.total) : 'LKR 0'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <span className="text-2xl">📈</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Net Income</p>
                <p className="text-xl font-bold text-orange-600">
                  {incomeStatement ? formatCurrency(incomeStatement.netIncome) : 'LKR 0'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-3 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg">
                <span className="text-2xl">💵</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Net Cash Flow</p>
                <p className="text-xl font-bold text-cyan-600">
                  {cashFlowStatement ? formatCurrency(cashFlowStatement.totalNetCashFlow) : 'LKR 0'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Balance Sheet & Income Statement */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Balance Sheet */}
        <Card>
          <CardHeader>
            <CardTitle>Balance Sheet</CardTitle>
          </CardHeader>
          <CardContent>
            {balanceSheet ? (
              <div className="space-y-4">
                {/* Assets */}
                <div>
                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Assets</h4>
                  <div className="space-y-1">
                    {balanceSheet.assets.accounts.map((account: any, index: number) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span>{account.accountName}</span>
                        <span className="font-medium">{formatCurrency(account.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-semibold text-blue-600 border-t pt-1">
                      <span>Total Assets</span>
                      <span>{formatCurrency(balanceSheet.assets.total)}</span>
                    </div>
                  </div>
                </div>

                {/* Liabilities */}
                <div>
                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Liabilities</h4>
                  <div className="space-y-1">
                    {balanceSheet.liabilities.accounts.map((account: any, index: number) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span>{account.accountName}</span>
                        <span className="font-medium">{formatCurrency(account.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-semibold text-red-600 border-t pt-1">
                      <span>Total Liabilities</span>
                      <span>{formatCurrency(balanceSheet.liabilities.total)}</span>
                    </div>
                  </div>
                </div>

                {/* Equity */}
                <div>
                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Equity</h4>
                  <div className="space-y-1">
                    {balanceSheet.equity.accounts.map((account: any, index: number) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span>{account.accountName}</span>
                        <span className="font-medium">{formatCurrency(account.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-semibold text-green-600 border-t pt-1">
                      <span>Total Equity</span>
                      <span>{formatCurrency(balanceSheet.equity.total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-500">No balance sheet data available</div>
            )}
          </CardContent>
        </Card>

        {/* Income Statement */}
        <Card>
          <CardHeader>
            <CardTitle>Income Statement</CardTitle>
          </CardHeader>
          <CardContent>
            {incomeStatement ? (
              <div className="space-y-4">
                {/* Revenues */}
                <div>
                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Revenues</h4>
                  <div className="space-y-1">
                    {incomeStatement.revenues.accounts.map((account: any, index: number) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span>{account.accountName}</span>
                        <span className="font-medium">{formatCurrency(account.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-semibold text-green-600 border-t pt-1">
                      <span>Total Revenue</span>
                      <span>{formatCurrency(incomeStatement.revenues.total)}</span>
                    </div>
                  </div>
                </div>

                {/* Expenses */}
                <div>
                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Expenses</h4>
                  <div className="space-y-1">
                    {incomeStatement.expenses.accounts.map((account: any, index: number) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span>{account.accountName}</span>
                        <span className="font-medium">{formatCurrency(account.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-semibold text-red-600 border-t pt-1">
                      <span>Total Expenses</span>
                      <span>{formatCurrency(incomeStatement.expenses.total)}</span>
                    </div>
                  </div>
                </div>

                {/* Net Income */}
                <div className="border-t-2 border-slate-300 pt-2">
                  <div className="flex justify-between font-bold text-lg">
                    <span>Net Income</span>
                    <span className={incomeStatement.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {formatCurrency(incomeStatement.netIncome)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-500">No income statement data available</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Statement of Cash Flows */}
      <Card>
        <CardHeader>
          <CardTitle>Statement of Cash Flows</CardTitle>
        </CardHeader>
        <CardContent>
          {cashFlowStatement ? (
            <div className="space-y-6">
              {/* Operating Activities */}
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-3 text-lg">Cash Flows from Operating Activities</h4>
                <div className="space-y-2 ml-4">
                  {/* Operating Inflows */}
                  {cashFlowStatement.operating.inflows.length > 0 && (
                    <div>
                      <h5 className="font-medium text-green-700 dark:text-green-400 mb-1">Cash Inflows:</h5>
                      {cashFlowStatement.operating.inflows.map((item: any, index: number) => (
                        <div key={index} className="flex justify-between text-sm">
                          <span className="ml-2">{item.accountName}</span>
                          <span className="font-medium text-green-600">{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Operating Outflows */}
                  {cashFlowStatement.operating.outflows.length > 0 && (
                    <div>
                      <h5 className="font-medium text-red-700 dark:text-red-400 mb-1">Cash Outflows:</h5>
                      {cashFlowStatement.operating.outflows.map((item: any, index: number) => (
                        <div key={index} className="flex justify-between text-sm">
                          <span className="ml-2">{item.accountName}</span>
                          <span className="font-medium text-red-600">({formatCurrency(item.amount)})</span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="flex justify-between font-semibold text-blue-600 border-t pt-2">
                    <span>Net Cash from Operating Activities</span>
                    <span>{formatCurrency(cashFlowStatement.operating.net)}</span>
                  </div>
                </div>
              </div>

              {/* Investing Activities */}
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-3 text-lg">Cash Flows from Investing Activities</h4>
                <div className="space-y-2 ml-4">
                  {/* Investing Inflows */}
                  {cashFlowStatement.investing.inflows.length > 0 && (
                    <div>
                      <h5 className="font-medium text-green-700 dark:text-green-400 mb-1">Cash Inflows:</h5>
                      {cashFlowStatement.investing.inflows.map((item: any, index: number) => (
                        <div key={index} className="flex justify-between text-sm">
                          <span className="ml-2">{item.accountName}</span>
                          <span className="font-medium text-green-600">{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Investing Outflows */}
                  {cashFlowStatement.investing.outflows.length > 0 && (
                    <div>
                      <h5 className="font-medium text-red-700 dark:text-red-400 mb-1">Cash Outflows:</h5>
                      {cashFlowStatement.investing.outflows.map((item: any, index: number) => (
                        <div key={index} className="flex justify-between text-sm">
                          <span className="ml-2">{item.accountName}</span>
                          <span className="font-medium text-red-600">({formatCurrency(item.amount)})</span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="flex justify-between font-semibold text-purple-600 border-t pt-2">
                    <span>Net Cash from Investing Activities</span>
                    <span>{formatCurrency(cashFlowStatement.investing.net)}</span>
                  </div>
                </div>
              </div>

              {/* Financing Activities */}
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-3 text-lg">Cash Flows from Financing Activities</h4>
                <div className="space-y-2 ml-4">
                  {/* Financing Inflows */}
                  {cashFlowStatement.financing.inflows.length > 0 && (
                    <div>
                      <h5 className="font-medium text-green-700 dark:text-green-400 mb-1">Cash Inflows:</h5>
                      {cashFlowStatement.financing.inflows.map((item: any, index: number) => (
                        <div key={index} className="flex justify-between text-sm">
                          <span className="ml-2">{item.accountName}</span>
                          <span className="font-medium text-green-600">{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Financing Outflows */}
                  {cashFlowStatement.financing.outflows.length > 0 && (
                    <div>
                      <h5 className="font-medium text-red-700 dark:text-red-400 mb-1">Cash Outflows:</h5>
                      {cashFlowStatement.financing.outflows.map((item: any, index: number) => (
                        <div key={index} className="flex justify-between text-sm">
                          <span className="ml-2">{item.accountName}</span>
                          <span className="font-medium text-red-600">({formatCurrency(item.amount)})</span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="flex justify-between font-semibold text-orange-600 border-t pt-2">
                    <span>Net Cash from Financing Activities</span>
                    <span>{formatCurrency(cashFlowStatement.financing.net)}</span>
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="border-t-2 border-slate-300 pt-4">
                <div className="space-y-2">
                  <div className="flex justify-between font-semibold text-lg">
                    <span>Net Increase (Decrease) in Cash</span>
                    <span className={cashFlowStatement.totalNetCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {formatCurrency(cashFlowStatement.totalNetCashFlow)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Cash at Beginning of Period</span>
                    <span>{formatCurrency(cashFlowStatement.beginningCash)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-xl border-t pt-2">
                    <span>Cash at End of Period</span>
                    <span className="text-blue-600">{formatCurrency(cashFlowStatement.endingCash)}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-slate-500">No cash flow data available</div>
          )}
        </CardContent>
      </Card>

      {/* Trial Balance */}
      <Card>
        <CardHeader>
          <CardTitle>Trial Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Account Code</th>
                  <th className="text-left py-2">Account Name</th>
                  <th className="text-left py-2">Type</th>
                  <th className="text-right py-2">Debit</th>
                  <th className="text-right py-2">Credit</th>
                  <th className="text-right py-2">Balance</th>
                </tr>
              </thead>
              <tbody>
                {trialBalance.map((account, index) => (
                  <tr key={index} className="border-b">
                    <td className="py-2">{account.accountCode}</td>
                    <td className="py-2">{account.accountName}</td>
                    <td className="py-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        account.accountType === 'ASSET' ? 'bg-blue-100 text-blue-800' :
                        account.accountType === 'LIABILITY' ? 'bg-red-100 text-red-800' :
                        account.accountType === 'EQUITY' ? 'bg-green-100 text-green-800' :
                        account.accountType === 'REVENUE' ? 'bg-purple-100 text-purple-800' :
                        'bg-orange-100 text-orange-800'
                      }`}>
                        {account.accountType}
                      </span>
                    </td>
                    <td className="text-right py-2">{formatCurrency(account.debitBalance)}</td>
                    <td className="text-right py-2">{formatCurrency(account.creditBalance)}</td>
                    <td className="text-right py-2 font-medium">{formatCurrency(account.netBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Recent Journal Entries */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Journal Entries</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {journalEntries.map((entry) => (
              <div key={entry.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-semibold">{entry.entryNumber}</h4>
                    <p className="text-sm text-slate-600">{entry.description}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{formatCurrency(entry.totalAmount)}</div>
                    <div className="text-xs text-slate-500">{new Date(entry.date).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <h5 className="font-medium text-slate-700 mb-1">Debits</h5>
                    {entry.transactions?.filter(t => t.debitAmount > 0).map((transaction, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>{transaction.accountName}</span>
                        <span>{formatCurrency(transaction.debitAmount)}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <h5 className="font-medium text-slate-700 mb-1">Credits</h5>
                    {entry.transactions?.filter(t => t.creditAmount > 0).map((transaction, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>{transaction.accountName}</span>
                        <span>{formatCurrency(transaction.creditAmount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AccountingDashboard;