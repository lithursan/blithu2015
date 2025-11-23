import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Modal } from '../ui/Modal';
import { useAuth } from '../../contexts/AuthContext';
import { AccountingService } from '../../services/accountingService';
import { PDFService } from '../../services/pdfService';
import { Account, AccountType } from '../../types/accounting';
import { UserRole } from '../../types';

const ChartOfAccounts: React.FC = () => {
  const { currentUser } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Search and filter states
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedAccountType, setSelectedAccountType] = useState<string>('all');

  const [form, setForm] = useState({
    code: '',
    name: '',
    type: AccountType.ASSET,
    description: '',
    isActive: true
  });

  const isAdmin = currentUser?.role === UserRole.Admin;

  // Filter accounts based on search term and account type
  const filteredAccounts = React.useMemo(() => {
    let filtered = accounts;
    
    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(account => 
        account.code.toLowerCase().includes(search) ||
        account.name.toLowerCase().includes(search) ||
        (account.description && account.description.toLowerCase().includes(search))
      );
    }
    
    // Account type filter
    if (selectedAccountType !== 'all') {
      filtered = filtered.filter(account => account.type === selectedAccountType);
    }
    
    return filtered;
  }, [accounts, searchTerm, selectedAccountType]);

  useEffect(() => {
    if (isAdmin) {
      loadAccounts();
    }
  }, [isAdmin]);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const data = await AccountingService.getAccounts();
      setAccounts(data);
    } catch (error) {
      console.error('Error loading accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await AccountingService.createAccount({
        ...form,
        balance: 0,
        debitBalance: 0,
        creditBalance: 0
      });
      
      setShowCreateModal(false);
      setForm({
        code: '',
        name: '',
        type: AccountType.ASSET,
        description: '',
        isActive: true
      });
      loadAccounts();
    } catch (error) {
      console.error('Error creating account:', error);
      let errorMessage = 'Error creating account. ';
      
      if (error.message?.includes('accounting_accounts')) {
        errorMessage += 'Database tables not found. Please run the database migration first.';
      } else if (error.message?.includes('duplicate key')) {
        errorMessage += 'Account code already exists. Please use a different code.';
      } else if (error.message) {
        errorMessage += error.message;
      } else {
        errorMessage += 'Please check your input and try again.';
      }
      
      alert(errorMessage);
    }
  };

  const handleDownloadPDF = () => {
    try {
      const accountsToExport = filteredAccounts.length > 0 ? filteredAccounts : accounts;
      PDFService.generateChartOfAccounts(accountsToExport);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-4">Access Denied</h1>
        <p className="text-slate-600 dark:text-slate-400">Only Admin users can access the Chart of Accounts.</p>
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return `LKR ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  };

  const getAccountTypeColor = (type: AccountType) => {
    switch (type) {
      case AccountType.ASSET: return 'bg-blue-100 text-blue-800';
      case AccountType.LIABILITY: return 'bg-red-100 text-red-800';
      case AccountType.EQUITY: return 'bg-green-100 text-green-800';
      case AccountType.REVENUE: return 'bg-purple-100 text-purple-800';
      case AccountType.EXPENSE: return 'bg-orange-100 text-orange-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Chart of Accounts</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Manage your accounting structure and account balances
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
            Create Account
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {Object.values(AccountType).map((type) => {
          const typeAccounts = accounts.filter(a => a.type === type);
          const totalBalance = typeAccounts.reduce((sum, a) => sum + (a.balance || 0), 0);
          
          return (
            <Card key={type}>
              <CardContent className="p-4">
                <div className="text-center">
                  <div className={`inline-flex px-3 py-1 rounded-full text-sm font-medium mb-2 ${getAccountTypeColor(type)}`}>
                    {type}
                  </div>
                  <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{typeAccounts.length}</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">accounts</div>
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    {formatCurrency(totalBalance)}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Search and Filter Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Search & Filter</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Search Accounts
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                  <svg className="h-3 w-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Search by code, name, or description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Account Type Filter
              </label>
              <select
                value={selectedAccountType}
                onChange={(e) => setSelectedAccountType(e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="all">All Account Types</option>
                {Object.values(AccountType).map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="mt-3 flex justify-between items-center">
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Showing {filteredAccounts.length} of {accounts.length} accounts
            </div>
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedAccountType('all');
              }}
              className="px-3 py-1 bg-slate-600 hover:bg-slate-700 text-white rounded text-xs"
            >
              Clear Filters
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Accounts Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Accounts</CardTitle>
            <div className="text-sm text-slate-500">
              {filteredAccounts.length} account{filteredAccounts.length !== 1 ? 's' : ''}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <div className="text-slate-500">Loading accounts...</div>
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-2">📊</div>
              <p className="text-slate-500 mb-2">
                {accounts.length === 0 ? 'No accounts created yet' : 'No accounts match your search criteria'}
              </p>
              <p className="text-sm text-slate-400">
                {accounts.length === 0 ? 'Click "Create Account" to add your first account' : 'Try adjusting your search or filter settings'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed min-w-[800px]">
                <colgroup>
                  <col className="w-16" />
                  <col className="w-auto min-w-32" />
                  <col className="w-20" />
                  <col className="w-24" />
                  <col className="w-24" />
                  <col className="w-24" />
                  <col className="w-20" />
                </colgroup>
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2">Code</th>
                    <th className="text-left py-3 px-2">Account Name</th>
                    <th className="text-left py-3 px-2">Type</th>
                    <th className="text-right py-3 px-2">Debit Balance</th>
                    <th className="text-right py-3 px-2">Credit Balance</th>
                    <th className="text-right py-3 px-2">Net Balance</th>
                    <th className="text-center py-3 px-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAccounts.map((account) => (
                    <tr key={account.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="py-3 px-2 font-mono font-medium text-sm">{account.code}</td>
                      <td className="py-3 px-2">
                        <div>
                          <div className="font-medium text-sm truncate">{account.name}</div>
                          {account.description && (
                            <div className="text-xs text-slate-500 truncate">{account.description}</div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getAccountTypeColor(account.type)}`}>
                          {account.type}
                        </span>
                      </td>
                      <td className="text-right py-3 px-2 font-mono text-sm">
                        {formatCurrency(account.debitBalance || 0)}
                      </td>
                      <td className="text-right py-3 px-2 font-mono text-sm">
                        {formatCurrency(account.creditBalance || 0)}
                      </td>
                      <td className="text-right py-3 px-2 font-mono font-medium text-sm">
                        <span className={account.balance >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {formatCurrency(account.balance || 0)}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          account.isActive 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-slate-100 text-slate-800'
                        }`}>
                          {account.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Account Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create New Account">
        <form onSubmit={handleCreateAccount} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Account Code *
              </label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="e.g., 1010"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Account Name *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="e.g., Cash"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Account Type *
            </label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as AccountType })}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              required
            >
              {Object.values(AccountType).map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Optional description..."
              rows={3}
            />
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
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
            >
              Create Account
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ChartOfAccounts;