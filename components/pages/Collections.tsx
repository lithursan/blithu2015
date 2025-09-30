import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/Card';
import { exportData } from '../../utils/exportUtils';
  // Export handler for filtered collections
  const handleExport = (format: 'csv' | 'xlsx') => {
    if (!filteredCollections.length) {
      alert('No collections to export');
      return;
    }
    // Format data for export
    const formatted = filteredCollections.map(c => ({
      'Order ID': c.order_id,
      'Customer': c.customer_id,
      'Type': c.collection_type,
      'Amount': c.amount,
      'Collected By': c.collected_by,
      'Date': c.collected_at || c.created_at,
      'Status': c.status,
      'Notes': c.notes || '',
    }));
    const timestamp = new Date().toISOString().split('T')[0];
    exportData(formatted, `collections_${timestamp}`, format, 'Collections');
  };
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { UserRole } from '../../types';
import { supabase } from '../../supabaseClient';

const formatCurrency = (amount: number, currency: string = 'LKR') => {
  return `${currency} ${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};

interface CollectionRecord {
  id: string;
  order_id: string;
  customer_id: string;
  collection_type: 'credit' | 'cheque';
  amount: number;
  status: 'pending' | 'complete';
  completed_by?: string;
  completed_at?: string;
  notes?: string;
  collected_at?: string;
  created_at?: string;
}

export const Collections: React.FC = () => {
  const { refetchData } = useData();
  const { currentUser } = useAuth();
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'complete'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'credit' | 'cheque'>('all');
  const [selectedCollection, setSelectedCollection] = useState<CollectionRecord | null>(null);
  const [verificationNotes, setVerificationNotes] = useState('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Fetch collections from Supabase on mount
  useEffect(() => {
    const fetchCollections = async () => {
      const { data, error } = await supabase
        .from('collections')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Error fetching collections:', error);
        setCollections([]);
      } else {
        setCollections(data || []);
      }
    };
    fetchCollections();
  }, []);

  const isAdminManager = useMemo(() => 
    currentUser?.role === UserRole.Admin || currentUser?.role === UserRole.Manager,
    [currentUser]
  );

  const filteredCollections = useMemo(() => {
    let filtered = collections;
    if (statusFilter !== 'all') {
      filtered = filtered.filter(c => {
        // Support both 'complete' and legacy 'collected' as complete
        const status = (c.status || '').toLowerCase();
        if (statusFilter === 'complete') {
          return status === 'complete' || status === 'collected';
        }
        return status === statusFilter;
      });
    }
    if (typeFilter !== 'all') {
      filtered = filtered.filter(c => c.collection_type === typeFilter);
    }
    // Date filter
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      filtered = filtered.filter(c => {
        const d = new Date(c.collected_at || c.created_at || '');
        return d >= fromDate;
      });
    }
    if (dateTo) {
      const toDate = new Date(dateTo);
      filtered = filtered.filter(c => {
        const d = new Date(c.collected_at || c.created_at || '');
        // Add 1 day to include the end date
        return d <= new Date(toDate.getTime() + 24*60*60*1000);
      });
    }
    return filtered.sort((a, b) => {
      const dateA = a.collected_at || a.created_at || '';
      const dateB = b.collected_at || b.created_at || '';
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
  }, [collections, statusFilter, typeFilter, dateFrom, dateTo]);

  // Always use the full collections array for stats, not filteredCollections
  const totalStats = useMemo(() => {
    const pending = collections.filter(c => (c.status || '').toLowerCase() === 'pending');
    // Support both 'complete' and legacy 'collected' as completed
    const completed = collections.filter(c => {
      const status = (c.status || '').toLowerCase();
      return status === 'complete' || status === 'collected';
    });
    return {
      totalPendingAmount: pending.reduce((sum, c) => sum + c.amount, 0),
      totalCompletedAmount: completed.reduce((sum, c) => sum + c.amount, 0),
      pendingCredit: pending.filter(c => c.collection_type === 'credit').reduce((sum, c) => sum + c.amount, 0),
      pendingCheque: pending.filter(c => c.collection_type === 'cheque').reduce((sum, c) => sum + c.amount, 0),
      totalCollections: collections.length
    };
  }, [collections]);

  const handleRecognizeCollection = async () => {
    if (!selectedCollection) return;
    try {
      // Fetch the current order to get the latest amountpaid
      const { data: orderData, error: fetchOrderError } = await supabase
        .from('orders')
        .select('amountpaid')
        .eq('id', selectedCollection.order_id)
        .single();
      if (fetchOrderError) throw fetchOrderError;
      const prevAmountPaid = orderData?.amountpaid || 0;

      // Reduce the outstanding amount from the order and increment amountpaid
      const updatedOrderData: any = {
        notes: `${selectedCollection.collection_type.toUpperCase()} collection of ${formatCurrency(selectedCollection.amount)} completed by ${currentUser?.name}. ${verificationNotes ? 'Notes: ' + verificationNotes : ''}`,
        amountpaid: prevAmountPaid + selectedCollection.amount
      };
      // Reduce the appropriate balance to 0 since it's been collected
      if (selectedCollection.collection_type === 'credit') {
        updatedOrderData.creditbalance = 0;
      } else if (selectedCollection.collection_type === 'cheque') {
        updatedOrderData.chequebalance = 0;
      }
      // Update order in database
      const { error: orderError } = await supabase
        .from('orders')
        .update(updatedOrderData)
        .eq('id', selectedCollection.order_id);
      if (orderError) throw orderError;

      // Update collection status in DB to 'complete'
      const { error: collectionError } = await supabase
        .from('collections')
        .update({ status: 'complete', notes: verificationNotes, completed_by: currentUser?.name || '', completed_at: new Date().toISOString() })
        .eq('id', selectedCollection.id);
      if (collectionError) throw collectionError;

      // Update local state immediately for real-time UI update
      setCollections(prev =>
        prev.map(c =>
          c.id === selectedCollection.id
            ? { ...c, status: 'complete' as const, notes: verificationNotes, completed_by: currentUser?.name || '', completed_at: new Date().toISOString() }
            : c
        )
      );

      // Refresh all data from server to ensure consistency
      await refetchData();

      alert(`${selectedCollection.collection_type.toUpperCase()} collection of ${formatCurrency(selectedCollection.amount)} has been marked as complete!`);

      setSelectedCollection(null);
      setVerificationNotes('');
    } catch (error) {
      console.error('Error recognizing collection:', error);
      alert('Failed to recognize collection. Please try again.');
    }
  };

  if (!isAdminManager) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-4">Access Denied</h1>
        <p className="text-slate-600 dark:text-slate-400">Only Admin and Manager roles can access the Collection Management page.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Collection Management</h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <span className="text-2xl">⏳</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Pending Collections</p>
                <p className="text-2xl font-bold text-orange-600">{formatCurrency(totalStats.totalPendingAmount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <span className="text-2xl">✅</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Completed Collections</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(totalStats.totalCompletedAmount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <span className="text-2xl">💰</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Pending Credit</p>
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(totalStats.pendingCredit)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <span className="text-2xl">🏦</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Pending Cheques</p>
                <p className="text-2xl font-bold text-purple-600">{formatCurrency(totalStats.pendingCheque)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Export & Filters */}
      <div className="flex flex-wrap gap-2 mb-2">
        <button
          onClick={() => handleExport('csv')}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
        >
          Download CSV
        </button>
        <button
          onClick={() => handleExport('xlsx')}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
        >
          Download XLSX
        </button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Collection Records</CardTitle>
          <CardDescription>
            Review and verify all outstanding collections from field staff
          </CardDescription>
          <div className="flex flex-col sm:flex-row sm:items-end space-y-2 sm:space-y-0 sm:space-x-4 pt-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'pending' | 'complete')}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending Verification</option>
              <option value="complete">Complete</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | 'credit' | 'cheque')}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              <option value="credit">Credit Collections</option>
              <option value="cheque">Cheque Collections</option>
            </select>

            {/* Date filter */}
            <div className="flex flex-col sm:flex-row sm:items-end space-y-2 sm:space-y-0 sm:space-x-2">
              <div>
                <label htmlFor="dateFrom" className="block text-xs text-slate-500 mb-1">From</label>
                <input
                  type="date"
                  id="dateFrom"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="px-2 py-1 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="dateTo" className="block text-xs text-slate-500 mb-1">To</label>
                <input
                  type="date"
                  id="dateTo"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="px-2 py-1 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
              <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-400">
                <tr>
                  <th scope="col" className="px-6 py-3">Order ID</th>
                  <th scope="col" className="px-6 py-3">Customer</th>
                  <th scope="col" className="px-6 py-3">Type</th>
                  <th scope="col" className="px-6 py-3">Amount</th>
                  <th scope="col" className="px-6 py-3">Collected By</th>
                  <th scope="col" className="px-6 py-3">Date</th>
                  <th scope="col" className="px-6 py-3">Status</th>
                  <th scope="col" className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCollections.map((collection) => (
                  <tr key={collection.id} className="bg-white border-b dark:bg-slate-800 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600">
                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                      {collection.order_id}
                    </td>
                    <td className="px-6 py-4">{collection.customer_id}</td>
                    <td className="px-6 py-4">
                      <Badge variant={collection.collection_type === 'credit' ? 'info' : 'warning'}>
                        {collection.collection_type === 'credit' ? '💰 Credit' : '🏦 Cheque'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 font-bold text-green-600">
                      {formatCurrency(collection.amount)}
                    </td>
                    <td className="px-6 py-4">{collection.collected_by || '-'}</td>
                    <td className="px-6 py-4">
                      {(collection.collected_at || collection.created_at) ? new Date(collection.collected_at || collection.created_at!).toLocaleDateString('en-GB') : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={collection.status === 'pending' ? 'warning' : 'success'}>
                        {collection.status === 'pending' ? '⏳ Pending' : '✅ Complete'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      {collection.status === 'pending' ? (
                        <button
                          onClick={() => setSelectedCollection(collection)}
                          className="font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          Verify & Recognize
                        </button>
                      ) : (
                        <span className="text-sm text-slate-400">Completed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {filteredCollections.length === 0 && (
              <div className="text-center py-10">
                <p className="text-slate-500 dark:text-slate-400">No collections found matching your criteria.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recognition Modal */}
      <Modal
        isOpen={!!selectedCollection}
        onClose={() => {
          setSelectedCollection(null);
          setVerificationNotes('');
        }}
        title="Verify Collection"
      >
        {selectedCollection && (
          <div className="p-6 space-y-4">
            <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg space-y-2">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200">Collection Details</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-600 dark:text-slate-400">Order ID:</span>
                  <p className="font-medium">{selectedCollection.orderId}</p>
                </div>
                <div>
                  <span className="text-slate-600 dark:text-slate-400">Customer:</span>
                  <p className="font-medium">{selectedCollection.customerName}</p>
                </div>
                <div>
                  <span className="text-slate-600 dark:text-slate-400">Type:</span>
                  <p className="font-medium capitalize">{selectedCollection.collectionType}</p>
                </div>
                <div>
                  <span className="text-slate-600 dark:text-slate-400">Amount:</span>
                  <p className="font-bold text-green-600">{formatCurrency(selectedCollection.amount)}</p>
                </div>
                <div>
                  <span className="text-slate-600 dark:text-slate-400">Collected By:</span>
                  <p className="font-medium">{selectedCollection.collectedBy}</p>
                </div>
                <div>
                  <span className="text-slate-600 dark:text-slate-400">Date:</span>
                  <p className="font-medium">{new Date(selectedCollection.collectedAt).toLocaleDateString('en-GB')}</p>
                </div>
              </div>
            </div>
            
            <div>
              <label htmlFor="verificationNotes" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">
                Verification Notes (Optional)
              </label>
              <textarea
                id="verificationNotes"
                value={verificationNotes}
                onChange={(e) => setVerificationNotes(e.target.value)}
                rows={3}
                className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:placeholder-slate-400 dark:text-white"
                placeholder="Enter any verification notes or comments..."
              />
            </div>
            
            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-200 dark:border-slate-600">
              <button
                onClick={() => {
                  setSelectedCollection(null);
                  setVerificationNotes('');
                }}
                type="button"
                className="text-slate-500 bg-white hover:bg-slate-100 focus:ring-4 focus:outline-none focus:ring-blue-300 rounded-lg border border-slate-200 text-sm font-medium px-5 py-2.5 hover:text-slate-900 focus:z-10 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-500 dark:hover:text-white dark:hover:bg-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleRecognizeCollection}
                type="button"
                className="text-white bg-green-600 hover:bg-green-700 focus:ring-4 focus:outline-none focus:ring-green-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-green-600 dark:hover:bg-green-700"
              >
                ✅ Recognize Collection
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};