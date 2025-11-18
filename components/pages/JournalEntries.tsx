import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Modal } from '../ui/Modal';
import { useAuth } from '../../contexts/AuthContext';
import { AccountingService } from '../../services/accountingService';
import { PDFService } from '../../services/pdfService';
import { Account, JournalEntry, Transaction, EntryStatus } from '../../types/accounting';
import { UserRole } from '../../types';

const JournalEntries: React.FC = () => {
  const { currentUser } = useAuth();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    reference: '',
    transactions: [
      { accountId: '', debitAmount: 0, creditAmount: 0, description: '' },
      { accountId: '', debitAmount: 0, creditAmount: 0, description: '' }
    ]
  });

  const isAdmin = currentUser?.role === UserRole.Admin;

  useEffect(() => {
    if (isAdmin) {
      loadData();
    }
  }, [isAdmin]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [entriesData, accountsData] = await Promise.all([
        AccountingService.getJournalEntries(50),
        AccountingService.getAccounts()
      ]);
      setEntries(entriesData);
      setAccounts(accountsData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      PDFService.generateJournalEntries(entries);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    }
  };

  const handleCreateEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (!currentUser?.id) {
        alert('User not authenticated. Please log in again.');
        return;
      }
      // Validate transactions
      const validTransactions = form.transactions.filter(t => 
        t.accountId && (t.debitAmount > 0 || t.creditAmount > 0)
      );

      if (validTransactions.length < 2) {
        alert('At least 2 transactions are required for a journal entry');
        return;
      }

      const totalDebits = validTransactions.reduce((sum, t) => sum + t.debitAmount, 0);
      const totalCredits = validTransactions.reduce((sum, t) => sum + t.creditAmount, 0);

      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        alert('Total debits must equal total credits');
        return;
      }

      // Prepare transactions with account details
      const transactionsWithDetails = validTransactions.map(t => {
        const account = accounts.find(a => a.id === t.accountId);
        if (!account) {
          throw new Error(`Account not found for transaction with ID: ${t.accountId}`);
        }
        return {
          ...t,
          accountCode: account.code,
          accountName: account.name
        };
      });

      const totalAmount = transactionsWithDetails.reduce((sum, t) => sum + Math.max(t.debitAmount, t.creditAmount), 0);
      const entryNumber = `JE-${Date.now()}`;
      
      console.log('Creating journal entry with data:', {
        entry: {
          entryNumber,
          date: form.date,
          description: form.description,
          reference: form.reference,
          totalAmount,
          status: EntryStatus.POSTED,
          createdBy: currentUser?.id || ''
        },
        transactions: transactionsWithDetails
      });
      
      // Generate a UUID for createdBy if current user ID is not UUID format
      const createdByUUID = currentUser?.id?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) 
        ? currentUser.id 
        : crypto.randomUUID();
      
      await AccountingService.createJournalEntry({
        entryNumber,
        date: form.date,
        description: form.description,
        reference: form.reference,
        totalAmount,
        status: EntryStatus.POSTED,
        createdBy: createdByUUID
      }, transactionsWithDetails);

      setShowCreateModal(false);
      resetForm();
      loadData();
      alert('Journal entry created successfully');
    } catch (error) {
      console.error('Error creating journal entry:', error);
      
      let errorMessage = 'Error creating journal entry. ';
      
      if (error?.message) {
        errorMessage += error.message;
      } else if (error?.code) {
        errorMessage += `Database error (${error.code}): ${error.details || 'Please check your data'}`;
      } else if (typeof error === 'string') {
        errorMessage += error;
      } else {
        errorMessage += 'Please check the console for details and try again.';
      }
      
      alert(errorMessage);
    }
  };

  const resetForm = () => {
    setForm({
      date: new Date().toISOString().split('T')[0],
      description: '',
      reference: '',
      transactions: [
        { accountId: '', debitAmount: 0, creditAmount: 0, description: '' },
        { accountId: '', debitAmount: 0, creditAmount: 0, description: '' }
      ]
    });
  };

  const addTransaction = () => {
    setForm({
      ...form,
      transactions: [
        ...form.transactions,
        { accountId: '', debitAmount: 0, creditAmount: 0, description: '' }
      ]
    });
  };

  const removeTransaction = (index: number) => {
    if (form.transactions.length > 2) {
      setForm({
        ...form,
        transactions: form.transactions.filter((_, i) => i !== index)
      });
    }
  };

  const updateTransaction = (index: number, field: string, value: any) => {
    const updatedTransactions = [...form.transactions];
    updatedTransactions[index] = { ...updatedTransactions[index], [field]: value };
    setForm({ ...form, transactions: updatedTransactions });
  };

  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-4">Access Denied</h1>
        <p className="text-slate-600 dark:text-slate-400">Only Admin users can access Journal Entries.</p>
      </div>
    );
  }

  const formatCurrency = (amount: number | null | undefined) => {
    const numAmount = parseFloat(String(amount || 0));
    if (isNaN(numAmount)) return 'LKR 0.00';
    return `LKR ${numAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getTotalDebits = () => {
    return form.transactions.reduce((sum, t) => sum + (t.debitAmount || 0), 0);
  };

  const getTotalCredits = () => {
    return form.transactions.reduce((sum, t) => sum + (t.creditAmount || 0), 0);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Journal Entries</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Record double-entry accounting transactions
          </p>
        </div>
        <div className="flex gap-3 mt-4 sm:mt-0">
          <button
            onClick={handleDownloadPDF}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md font-medium transition-colors duration-200 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download PDF
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
          >
            New Journal Entry
          </button>
        </div>
      </div>

      {/* Journal Entries List */}
      <Card>
        <CardHeader>
          <CardTitle>All Journal Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <div className="text-slate-500">Loading journal entries...</div>
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-2">📝</div>
              <p className="text-slate-500 mb-2">No journal entries yet</p>
              <p className="text-sm text-slate-400">Create your first journal entry to get started</p>
            </div>
          ) : (
            <div className="space-y-4">
              {entries.map((entry) => (
                <div key={entry.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-semibold text-lg">{entry.entryNumber}</h4>
                      <p className="text-slate-600 dark:text-slate-400">{entry.description}</p>
                      {entry.reference && (
                        <p className="text-sm text-slate-500">Ref: {entry.reference}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-medium">{formatCurrency(entry.totalAmount || 0)}</div>
                      <div className="text-sm text-slate-500">{new Date(entry.date).toLocaleDateString()}</div>
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                        entry.status === 'POSTED' 
                          ? 'bg-green-100 text-green-800' 
                          : entry.status === 'DRAFT'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {entry.status}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h5 className="font-medium text-slate-700 dark:text-slate-300 mb-2">Debits</h5>
                      <div className="space-y-1">
                        {entry.transactions?.filter(t => (t.debitAmount || 0) > 0).map((transaction, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span className="truncate mr-2">
                              {transaction.accountCode || 'N/A'} - {transaction.accountName || 'Unknown Account'}
                            </span>
                            <span className="font-medium">{formatCurrency(transaction.debitAmount || 0)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h5 className="font-medium text-slate-700 dark:text-slate-300 mb-2">Credits</h5>
                      <div className="space-y-1">
                        {entry.transactions?.filter(t => (t.creditAmount || 0) > 0).map((transaction, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span className="truncate mr-2">
                              {transaction.accountCode || 'N/A'} - {transaction.accountName || 'Unknown Account'}
                            </span>
                            <span className="font-medium">{formatCurrency(transaction.creditAmount || 0)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Journal Entry Modal */}
      <Modal 
        isOpen={showCreateModal} 
        onClose={() => setShowCreateModal(false)} 
        title="Create Journal Entry"
        size="xl"
      >
        <form onSubmit={handleCreateEntry} className="space-y-6">
          {/* Entry Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Date *
              </label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Reference
              </label>
              <input
                type="text"
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Optional reference"
              />
            </div>
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Balance Check
              </label>
              <div className={`px-3 py-2 rounded-lg text-sm font-medium ${
                Math.abs(getTotalDebits() - getTotalCredits()) < 0.01
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              }`}>
                {Math.abs(getTotalDebits() - getTotalCredits()) < 0.01 ? '✓ Balanced' : '✗ Unbalanced'}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Description *
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Describe this journal entry..."
              rows={2}
              required
            />
          </div>

          {/* Transactions */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Transactions</h3>
              <button
                type="button"
                onClick={addTransaction}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm"
              >
                Add Line
              </button>
            </div>

            <div className="space-y-3">
              {form.transactions.map((transaction, index) => (
                <div key={index} className="border rounded-lg p-3">
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Account</label>
                      <select
                        value={transaction.accountId}
                        onChange={(e) => updateTransaction(index, 'accountId', e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                        required
                      >
                        <option value="">Select Account</option>
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.code} - {account.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Debit</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={transaction.debitAmount || ''}
                        onChange={(e) => updateTransaction(index, 'debitAmount', parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Credit</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={transaction.creditAmount || ''}
                        onChange={(e) => updateTransaction(index, 'creditAmount', parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
                      <input
                        type="text"
                        value={transaction.description}
                        onChange={(e) => updateTransaction(index, 'description', e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                        placeholder="Transaction description"
                      />
                    </div>
                    <div>
                      {form.transactions.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeTransaction(index)}
                          className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="font-medium">Total Debits: </span>
                  <span className="font-mono">{formatCurrency(getTotalDebits())}</span>
                </div>
                <div>
                  <span className="font-medium">Total Credits: </span>
                  <span className="font-mono">{formatCurrency(getTotalCredits())}</span>
                </div>
                <div>
                  <span className="font-medium">Difference: </span>
                  <span className={`font-mono ${Math.abs(getTotalDebits() - getTotalCredits()) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(Math.abs(getTotalDebits() - getTotalCredits()))}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={Math.abs(getTotalDebits() - getTotalCredits()) >= 0.01}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white rounded-lg transition-colors"
            >
              Create & Post Entry
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default JournalEntries;