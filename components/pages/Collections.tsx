import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/Card';
import { exportData } from '../../utils/exportUtils';
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
  // Export handler for filtered collections
  const handleExport = (format: 'csv' | 'xlsx') => {
    if (!filteredCollections.length) {
      alert('No collections to export');
      return;
    }
    // Format data for export
    const formatted = filteredCollections.map(c => ({
      'Order ID': c.order_id,
      'Customer': customerMap[c.customer_id] || c.customer_id,
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
  const { refetchData, customers } = useData();
  const { currentUser } = useAuth();
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'complete'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'credit' | 'cheque'>('all');
  const [selectedCollection, setSelectedCollection] = useState<CollectionRecord | null>(null);
  const [verificationNotes, setVerificationNotes] = useState('');
  const [chequeForm, setChequeForm] = useState<any>({
    payerName: '',
    amount: 0,
    bank: '',
    chequeNumber: '',
    chequeDate: new Date().toISOString().slice(0,10),
    depositDate: '' ,
    notes: ''
  });
  const [chequeSaving, setChequeSaving] = useState(false);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [isPartialPayment, setIsPartialPayment] = useState(false);
  const [partialAmount, setPartialAmount] = useState<number>(0);

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

  // Group collections by date
  const groupedCollections = useMemo(() => {
    const groups = filteredCollections.reduce((acc, collection) => {
      const collectionDate = collection.collected_at || collection.created_at;
      const dateKey = collectionDate ? new Date(collectionDate).toDateString() : 'Unknown Date';
      
      if (!acc[dateKey]) {
        acc[dateKey] = {
          date: dateKey,
          collections: [],
          totalCredit: 0,
          totalCheque: 0,
          creditCount: 0,
          chequeCount: 0,
          pendingTotal: 0
        };
      }
      
      acc[dateKey].collections.push(collection);
      
      // Only count amounts for pending collections
      if (collection.status === 'pending') {
        acc[dateKey].pendingTotal += collection.amount;
        
        if (collection.collection_type === 'credit') {
          acc[dateKey].totalCredit += collection.amount;
          acc[dateKey].creditCount++;
        } else {
          acc[dateKey].totalCheque += collection.amount;
          acc[dateKey].chequeCount++;
        }
      }
      
      return acc;
    }, {} as Record<string, {
      date: string;
      collections: CollectionRecord[];
      totalCredit: number;
      totalCheque: number;
      creditCount: number;
      chequeCount: number;
      pendingTotal: number;
    }>);

    // Sort groups by date (most recent first)
    return Object.values(groups).sort((a: any, b: any) => {
      if (a.date === 'Unknown Date') return 1;
      if (b.date === 'Unknown Date') return -1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }, [filteredCollections]);

  // Map customer id -> name for quick lookup
  const customerMap = useMemo(() => {
    const map: Record<string, string> = {};
    (customers || []).forEach(c => {
      if (c.id) map[c.id] = c.name || c.customerName || '';
    });
    return map;
  }, [customers]);

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
      // Reduce the appropriate balance to 0 since it's been collected.
      // NOTE: do NOT zero chequebalance for cheque collections here — cheques are tracked
      // separately and should only clear the chequebalance when the cheque itself clears.
      if (selectedCollection.collection_type === 'credit') {
        updatedOrderData.creditbalance = 0;
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

  const handlePartialPayment = async () => {
    if (!selectedCollection || !isPartialPayment) return;
    
    if (!partialAmount || partialAmount <= 0 || partialAmount >= selectedCollection.amount) {
      alert('Please enter a valid partial amount (greater than 0 and less than total amount)');
      return;
    }

    try {
      // Update the current collection amount to remaining amount
      const remainingAmount = selectedCollection.amount - partialAmount;
      
      const { error: updateError } = await supabase
        .from('collections')
        .update({ 
          amount: remainingAmount,
          notes: `Partial payment of ${formatCurrency(partialAmount)} received. Remaining: ${formatCurrency(remainingAmount)}. ${verificationNotes ? 'Notes: ' + verificationNotes : ''}` 
        })
        .eq('id', selectedCollection.id);
      
      if (updateError) throw updateError;

      // Update local state
      setCollections(prev =>
        prev.map(c =>
          c.id === selectedCollection.id
            ? { ...c, amount: remainingAmount, notes: `Partial payment of ${formatCurrency(partialAmount)} received. Remaining: ${formatCurrency(remainingAmount)}. ${verificationNotes ? 'Notes: ' + verificationNotes : ''}` }
            : c
        )
      );

      // Refresh data
      await refetchData();

      alert(`Partial payment of ${formatCurrency(partialAmount)} recorded successfully. Remaining amount: ${formatCurrency(remainingAmount)}`);

      setSelectedCollection(null);
      setVerificationNotes('');
      setIsPartialPayment(false);
      setPartialAmount(0);
    } catch (error) {
      console.error('Error recording partial payment:', error);
      alert('Failed to record partial payment. Please try again.');
    }
  };

  const handleVerifyClick = (collection: CollectionRecord) => {
    const password = prompt('Enter verification password:');
    if (password !== '6789') {
      alert('Incorrect password. Verification cancelled.');
      return;
    }
    setSelectedCollection(collection);
    setIsConvertingCredit(false);
  };

  const recordChequeFromCollection = async () => {
    if (!selectedCollection) return;
    setChequeSaving(true);
    try {
      const payload = {
        payer_name: chequeForm.payerName || (customerMap[selectedCollection.customer_id] || null),
        amount: Number(chequeForm.amount || selectedCollection.amount || 0),
        bank: chequeForm.bank || null,
        cheque_number: chequeForm.chequeNumber || null,
        cheque_date: chequeForm.chequeDate || null,
        deposit_date: chequeForm.depositDate || null,
        notes: chequeForm.notes || `Created from collection ${selectedCollection.id}`,
        status: 'Received',
        created_by: currentUser?.id || null,
        created_at: new Date().toISOString()
      };

  // Attach collection_id and order_id so cheque <-> collection linkage exists
  if (selectedCollection.id) (payload as any).collection_id = selectedCollection.id;
  if (selectedCollection.order_id) (payload as any).order_id = selectedCollection.order_id;

  const { data: chequeData, error: chequeErr } = await supabase.from('cheques').insert([payload]).select();
      if (chequeErr) throw chequeErr;

      // After cheque saved, refresh global data so ChequeManagement will show it
      await refetchData();

  alert('Cheque record saved. Collection remains pending until the cheque is cleared/deposited.');

  // Optionally add a note that the cheque was recorded
  setVerificationNotes(prev => prev ? prev + ' | Cheque recorded.' : 'Cheque recorded.');

  // Do NOT mark the collection as complete here. Cheque is recorded and
  // collection remains pending until the cheque is cleared/deposited.
  // reset form and close modal
      setChequeForm({ payerName: '', amount: 0, bank: '', chequeNumber: '', chequeDate: new Date().toISOString().slice(0,10), depositDate: '', notes: '' });
      setSelectedCollection(null);
    } catch (err) {
      console.error('Error saving cheque from collection:', err);
      alert('Failed to save cheque. See console for details.');
    } finally {
      setChequeSaving(false);
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
          {filteredCollections.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">📋</div>
              <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">No collections found</h3>
              <p className="text-slate-500 dark:text-slate-400">Try adjusting your filters or check back later for new collections.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {groupedCollections.map((group) => (
                <div key={group.date} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800">
                  {/* Date Header */}
                  <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-slate-700 dark:to-slate-600 px-6 py-4 border-b border-slate-200 dark:border-slate-600">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                          📅 {group.date === 'Unknown Date' ? 'Unknown Date' : new Date(group.date).toLocaleDateString('en-GB', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                          {group.collections.length} collection(s) • Pending Total: {formatCurrency(group.pendingTotal)}
                        </p>
                      </div>
                      <div className="mt-3 sm:mt-0 flex space-x-4">
                        {group.creditCount > 0 && (
                          <div className="text-center">
                            <div className="text-sm font-medium text-blue-600 dark:text-blue-400">💰 Credit (Pending)</div>
                            <div className="text-xs text-slate-500">{group.creditCount} • {formatCurrency(group.totalCredit)}</div>
                          </div>
                        )}
                        {group.chequeCount > 0 && (
                          <div className="text-center">
                            <div className="text-sm font-medium text-purple-600 dark:text-purple-400">🏦 Cheque (Pending)</div>
                            <div className="text-xs text-slate-500">{group.chequeCount} • {formatCurrency(group.totalCheque)}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Collections for this date */}
                  <div className="p-4 space-y-3">
                    {group.collections.map((collection) => (
                      <div key={collection.id} className="border border-slate-200 dark:border-slate-600 rounded-lg p-4 hover:shadow-md transition-shadow bg-slate-50 dark:bg-slate-700">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-3 mb-2">
                              <div className="flex-shrink-0">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  collection.collection_type === 'credit' 
                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' 
                                    : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                                }`}>
                                  {collection.collection_type === 'credit' ? '💰 Credit' : '🏦 Cheque'}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                                  Order: {collection.order_id}
                                </p>
                                <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                                  {customerMap[collection.customer_id] || 
                                   (collection.notes && collection.notes.includes('Payer: ') ? 
                                    collection.notes.split('Payer: ')[1].split(' |')[0].split(')')[0] : 
                                    collection.customer_id || 'Unknown Customer')}
                                </p>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                              <div>
                                <p className="text-slate-500 dark:text-slate-400">Amount</p>
                                <p className="font-semibold text-green-600">{formatCurrency(collection.amount)}</p>
                              </div>
                              <div>
                                <p className="text-slate-500 dark:text-slate-400">Collected By</p>
                                <p className="font-medium text-slate-900 dark:text-slate-100">{collection.collected_by || '-'}</p>
                              </div>
                              <div>
                                <p className="text-slate-500 dark:text-slate-400">Status</p>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                  collection.status === 'pending' 
                                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' 
                                    : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                }`}>
                                  {collection.status === 'pending' ? '⏳ Pending' : '✅ Complete'}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex-shrink-0">
                            {collection.status === 'pending' ? (
                              <div className="flex flex-col gap-1.5">
                                <button
                                  onClick={() => handleVerifyClick(collection)}
                                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors text-xs font-medium whitespace-nowrap"
                                >
                                  Verify & Recognize
                                </button>
                                {collection.collection_type === 'credit' && (
                                  <>
                                    <button
                                      onClick={() => {
                                        setSelectedCollection(collection);
                                        setIsConvertingCredit(true);
                                        setOptimisticConvertedId(collection.id);
                                        setCollections(prev => prev.map(c => c.id === collection.id ? { ...c, collection_type: 'cheque' } : c));
                                      }}
                                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors text-xs font-medium whitespace-nowrap"
                                    >
                                      Convert to Cheque
                                    </button>
                                    <button
                                      onClick={() => {
                                        setSelectedCollection(collection);
                                        setIsPartialPayment(true);
                                        setPartialAmount(0);
                                        setIsConvertingCredit(false);
                                      }}
                                      className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-md transition-colors text-xs font-medium whitespace-nowrap"
                                    >
                                      💰 Partial Payment
                                    </button>
                                  </>
                                )}
                                {isAdmin && (
                                  <button
                                    onClick={() => deleteCollection(collection.id)}
                                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors text-xs font-medium whitespace-nowrap"
                                  >
                                    🗑️ Delete
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col gap-1.5">
                                <span className="text-xs text-slate-400 font-medium">Completed</span>
                                {isAdmin && (
                                  <button
                                    onClick={() => deleteCollection(collection.id)}
                                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors text-xs font-medium whitespace-nowrap"
                                  >
                                    🗑️ Delete
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
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
                          <p className="font-medium">{selectedCollection.order_id}</p>
                        </div>
                        <div>
                          <span className="text-slate-600 dark:text-slate-400">Customer:</span>
                          <p className="font-medium">{customerMap[selectedCollection.customer_id] || selectedCollection.customer_id}</p>
                        </div>
                        <div>
                          <span className="text-slate-600 dark:text-slate-400">Type:</span>
                          <p className="font-medium capitalize">{selectedCollection.collection_type}</p>
                        </div>
                        <div>
                          <span className="text-slate-600 dark:text-slate-400">Amount:</span>
                          <p className="font-bold text-green-600">{formatCurrency(selectedCollection.amount)}</p>
                        </div>
                        <div>
                          <span className="text-slate-600 dark:text-slate-400">Collected By:</span>
                          <p className="font-medium">{selectedCollection.collected_by || '-'}</p>
                        </div>
                        <div>
                          <span className="text-slate-600 dark:text-slate-400">Date:</span>
                          <p className="font-medium">{new Date(selectedCollection.collected_at || selectedCollection.created_at || '').toLocaleDateString('en-GB')}</p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Partial Payment Section */}
                    {isPartialPayment && selectedCollection?.collection_type === 'credit' && (
                      <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg border border-orange-200 dark:border-orange-700">
                        <h4 className="font-semibold text-orange-800 dark:text-orange-200 mb-3">Record Partial Payment</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                              Total Amount
                            </label>
                            <p className="text-lg font-bold text-green-600">{formatCurrency(selectedCollection.amount)}</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                              Partial Payment Amount *
                            </label>
                            <input
                              type="number"
                              value={partialAmount || ''}
                              onChange={(e) => setPartialAmount(Number(e.target.value))}
                              min="1"
                              max={selectedCollection.amount - 1}
                              step="0.01"
                              className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-500 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                              placeholder="Enter amount received"
                            />
                          </div>
                        </div>
                        {partialAmount > 0 && (
                          <div className="mt-3 p-3 bg-slate-100 dark:bg-slate-800 rounded">
                            <p className="text-sm text-slate-700 dark:text-slate-300">
                              <strong>Amount Received:</strong> {formatCurrency(partialAmount)}<br/>
                              <strong>Remaining Balance:</strong> {formatCurrency(selectedCollection.amount - partialAmount)}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    <div>
                      <label htmlFor="verificationNotes" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">
                        {isPartialPayment ? 'Payment Notes (Optional)' : 'Verification Notes (Optional)'}
                      </label>
                      <textarea
                        id="verificationNotes"
                        value={verificationNotes}
                        onChange={(e) => setVerificationNotes(e.target.value)}
                        rows={3}
                        className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:placeholder-slate-400 dark:text-white"
                        placeholder={isPartialPayment ? "Enter payment details or comments..." : "Enter any verification notes or comments..."}
                      />
                    </div>

                    {/* If this is a cheque collection, show the cheque recording form */}
                    {selectedCollection.collection_type === 'cheque' && (
                      <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg space-y-3">
                        <h4 className="font-semibold">Record Cheque Details</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-slate-600 mb-1">Payer</label>
                            <input value={chequeForm.payerName} onChange={e => setChequeForm((p:any)=>({...p,payerName:e.target.value}))} className="w-full px-3 py-2 border rounded" />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-600 mb-1">Amount</label>
                            <input type="number" value={chequeForm.amount || selectedCollection.amount || 0} onChange={e => setChequeForm((p:any)=>({...p,amount: Number(e.target.value)}))} className="w-full px-3 py-2 border rounded" />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-600 mb-1">Bank</label>
                            <input value={chequeForm.bank} onChange={e => setChequeForm((p:any)=>({...p,bank:e.target.value}))} className="w-full px-3 py-2 border rounded" />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-600 mb-1">Cheque Number</label>
                            <input value={chequeForm.chequeNumber} onChange={e => setChequeForm((p:any)=>({...p,chequeNumber:e.target.value}))} className="w-full px-3 py-2 border rounded" />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-600 mb-1">Cheque Date</label>
                            <input type="date" value={chequeForm.chequeDate} onChange={e => setChequeForm((p:any)=>({...p,chequeDate:e.target.value}))} className="w-full px-3 py-2 border rounded" />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-600 mb-1">Deposit Date (optional)</label>
                            <input type="date" value={chequeForm.depositDate} onChange={e => setChequeForm((p:any)=>({...p,depositDate:e.target.value}))} className="w-full px-3 py-2 border rounded" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Notes</label>
                          <textarea value={chequeForm.notes} onChange={e => setChequeForm((p:any)=>({...p,notes:e.target.value}))} className="w-full px-3 py-2 border rounded" />
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-200 dark:border-slate-600">
                      <button
                        onClick={() => {
                          setSelectedCollection(null);
                          setVerificationNotes('');
                          setIsPartialPayment(false);
                          setPartialAmount(0);
                        }}
                        type="button"
                        className="text-slate-500 bg-white hover:bg-slate-100 focus:ring-4 focus:outline-none focus:ring-blue-300 rounded-lg border border-slate-200 text-sm font-medium px-5 py-2.5 hover:text-slate-900 focus:z-10 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-500 dark:hover:text-white dark:hover:bg-slate-600"
                      >
                        Cancel
                      </button>
                      {isPartialPayment ? (
                        <button
                          onClick={handlePartialPayment}
                          type="button"
                          className="text-white bg-orange-600 hover:bg-orange-700 focus:ring-4 focus:outline-none focus:ring-orange-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center"
                        >
                          💰 Record Partial Payment
                        </button>
                      ) : selectedCollection.collection_type === 'cheque' || isConvertingCredit ? (
                        <>
                              <button
                                onClick={recordChequeFromCollection}
                                type="button"
                                disabled={chequeSaving}
                                className="text-white bg-indigo-600 hover:bg-indigo-700 focus:ring-4 focus:outline-none focus:ring-indigo-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center"
                              >
                                💳 Record Cheque
                              </button>
                        </>
                      ) : (
                        <button
                          onClick={handleRecognizeCollection}
                          type="button"
                          className="text-white bg-green-600 hover:bg-green-700 focus:ring-4 focus:outline-none focus:ring-green-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center"
                        >
                          ✅ Recognize Collection
                        </button>
                      )}
                    </div>
                  </div>
                )}
      </Modal>
    </div>
  );
};