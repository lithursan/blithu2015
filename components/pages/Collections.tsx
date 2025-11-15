import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/Card';
import { exportData } from '../../utils/exportUtils';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { UserRole } from '../../types';
import { supabase } from '../../supabaseClient';
import { exportToPDF } from '../../utils/pdfExport';

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
  const { refetchData, customers, users } = useData();
  const { currentUser } = useAuth();
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'complete'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'credit' | 'cheque'>('all');
  const [selectedCollection, setSelectedCollection] = useState<CollectionRecord | null>(null);
  const [verificationNotes, setVerificationNotes] = useState('');
  const [chequeForms, setChequeForms] = useState<any[]>([]);
  const [isConvertingCredit, setIsConvertingCredit] = useState(false);
  const [optimisticConvertedId, setOptimisticConvertedId] = useState<string | null>(null);
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

  const deleteCollection = async (collectionId: string) => {
    if (!isAdmin) {
      alert('Only Admin users can delete collections.');
      return;
    }

    const password = prompt('Enter admin password to delete this collection:');
    if (password !== '1234') {
      alert('Incorrect password. Delete operation cancelled.');
      return;
    }

    const confirmed = confirm('Are you sure you want to delete this collection? This action cannot be undone.');
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('collections')
        .delete()
        .eq('id', collectionId);
      
      if (error) throw error;

      // Update local state
      setCollections(prev => prev.filter(c => c.id !== collectionId));
      
      // Refresh data to ensure consistency
      await refetchData();
      
      alert('Collection deleted successfully.');
    } catch (error) {
      console.error('Error deleting collection:', error);
      alert('Failed to delete collection. Please try again.');
    }
  };

  const isAdminManager = useMemo(() => 
    currentUser?.role === UserRole.Admin || currentUser?.role === UserRole.Secretary || currentUser?.role === UserRole.Manager,
    [currentUser]
  );

  const isAdmin = useMemo(() => 
    currentUser?.role === UserRole.Admin || currentUser?.role === UserRole.Secretary,
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

  // Initialize chequeForms when a cheque collection is selected
  useEffect(() => {
    if (selectedCollection && (selectedCollection.collection_type === 'cheque' || isConvertingCredit)) {
      setChequeForms([{
        payerName: customerMap[selectedCollection.customer_id] || '',
        amount: selectedCollection.amount || 0,
        bank: '',
        chequeNumber: '',
        chequeDate: new Date().toISOString().slice(0,10),
        depositDate: '',
        notes: ''
      }]);
    } else {
      setChequeForms([]);
    }
  }, [selectedCollection, customerMap]);

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

  const exportCollectionsPDF = () => {
    const columns = [
      { key: 'order_id', title: 'Order ID' },
      { key: 'customer_name', title: 'Customer' },
      { key: 'collection_type', title: 'Type' },
      { key: 'amount', title: 'Amount' },
      { key: 'status', title: 'Status' },
      { key: 'collected_by', title: 'Collected By' },
      { key: 'collected_at', title: 'Collected At' },
      { key: 'notes', title: 'Notes' }
    ];

    const data = filteredCollections.map(collection => {
      const customer = customers.find(c => c.id === collection.customer_id);
      const collectedBy = users?.find(u => u.id === collection.collected_by);
      
      return {
        order_id: collection.order_id || 'N/A',
        customer_name: customer?.name || 'Unknown Customer',
        collection_type: collection.collection_type || 'N/A',
        amount: `LKR ${(collection.amount || 0).toFixed(2)}`,
        status: collection.status || 'Pending',
        collected_by: collectedBy?.name || 'N/A',
        collected_at: collection.collected_at ? new Date(collection.collected_at).toLocaleDateString() : 'Not collected',
        notes: collection.notes || 'No notes'
      };
    });

    const totalAmount = filteredCollections.reduce((sum, c) => sum + (c.amount || 0), 0);

    exportToPDF('Collections Report', columns, data, {
      summary: {
        'Total Collections': filteredCollections.length.toString(),
        'Total Amount': `LKR ${totalAmount.toFixed(2)}`,
        'Pending Collections': filteredCollections.filter(c => c.status === 'pending').length.toString(),
        'Completed Collections': filteredCollections.filter(c => c.status === 'completed').length.toString()
      }
    });
  };

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
      // Validate all required fields (all except notes are mandatory)
      const invalidForms = (chequeForms || []).filter(cf => 
        !cf.payerName?.trim() || 
        !cf.amount || 
        cf.amount <= 0 || 
        !cf.bank?.trim() || 
        !cf.chequeNumber?.trim() || 
        !cf.chequeDate?.trim()
      );
      
      if (invalidForms.length > 0) {
        alert('Please fill in all required fields: Payer, Amount, Bank, Cheque Number, and Cheque Date. Only Notes field is optional.');
        setChequeSaving(false);
        return;
      }

      // When converting from credit -> cheque, require deposit date for scheduling
      if (isConvertingCredit) {
        const missing = (chequeForms || []).some(cf => !cf.depositDate || String(cf.depositDate).trim() === '');
        if (missing) {
          alert('Please provide a Deposit Date for each cheque to schedule the conversion.');
          setChequeSaving(false);
          return;
        }
      }
      // Prepare multiple payloads from `chequeForms` array
      const payloads = (chequeForms && chequeForms.length ? chequeForms : [{
        payerName: '', amount: selectedCollection.amount || 0, bank: '', chequeNumber: '', chequeDate: new Date().toISOString().slice(0,10), depositDate: '', notes: ''
      }]).map((cf: any) => {
        const p: any = {
          payer_name: cf.payerName || (customerMap[selectedCollection.customer_id] || null),
          amount: Number(cf.amount || selectedCollection.amount || 0),
          bank: cf.bank || null,
          cheque_number: cf.chequeNumber || null,
          cheque_date: cf.chequeDate || null,
          deposit_date: cf.depositDate || null,
          notes: cf.notes || `Created from collection ${selectedCollection.id}`,
          status: 'Received',
          created_by: currentUser?.id || null,
          created_at: new Date().toISOString()
        };
        if (selectedCollection.id) p.collection_id = selectedCollection.id;
        if (selectedCollection.order_id) p.order_id = selectedCollection.order_id;
        return p;
      });

      const { data: chequeData, error: chequeErr } = await supabase.from('cheques').insert(payloads).select();
      if (chequeErr) throw chequeErr;

      // After cheque saved, refresh global data so ChequeManagement will show it
      await refetchData();
      // Notify any listeners (e.g., ChequeManagement) that cheques were updated
      try { window.dispatchEvent(new Event('cheques-updated')); } catch (e) { /* ignore */ }

  // Mark the collection as complete after cheque details are provided and confirmed
  const updatedNotes = verificationNotes ? verificationNotes + ' | Cheque recorded.' : 'Cheque recorded.';
  
  // Update the order's amountpaid when completing the cheque collection
  if (selectedCollection.order_id) {
    try {
      // Fetch the current order to get the latest amountpaid
      const { data: orderData, error: fetchOrderError } = await supabase
        .from('orders')
        .select('amountpaid')
        .eq('id', selectedCollection.order_id)
        .single();
      if (fetchOrderError) throw fetchOrderError;
      
      const prevAmountPaid = orderData?.amountpaid || 0;
      const updatedOrderData = {
        notes: `CHEQUE collection of ${formatCurrency(selectedCollection.amount)} completed by ${currentUser?.name}. ${updatedNotes}`,
        amountpaid: prevAmountPaid + selectedCollection.amount
      };
      
      // Update order in database
      const { error: orderError } = await supabase
        .from('orders')
        .update(updatedOrderData)
        .eq('id', selectedCollection.order_id);
      if (orderError) {
        console.error('Failed to update order amounts:', orderError);
      }
    } catch (err) {
      console.error('Error updating order:', err);
    }
  }
  
  // Update collection status to complete
  const { error: collectionCompleteError } = await supabase
    .from('collections')
    .update({ 
      status: 'complete', 
      notes: updatedNotes, 
      completed_by: currentUser?.name || '', 
      completed_at: new Date().toISOString() 
    })
    .eq('id', selectedCollection.id);
    
  if (collectionCompleteError) {
    console.error('Failed to mark collection as complete:', collectionCompleteError);
  } else {
    // Update local state to reflect completion
    setCollections(prev =>
      prev.map(c =>
        c.id === selectedCollection.id
          ? { ...c, status: 'complete' as const, notes: updatedNotes, completed_by: currentUser?.name || '', completed_at: new Date().toISOString() }
          : c
      )
    );
  }

  alert('Cheque details recorded and collection marked as complete.');
  
  // Update verification notes
  setVerificationNotes(updatedNotes);
  
  // Reset forms and close modal
  setChequeForms([]);
  // If we were converting a credit collection, handle conversion safely (avoid 409)
  if (isConvertingCredit && selectedCollection?.id) {
    try {
      // Check if a cheque collection for this order already exists
      const { data: existingCol, error: fetchExistingErr } = await supabase
        .from('collections')
        .select('*')
        .eq('order_id', selectedCollection.order_id)
        .eq('collection_type', 'cheque')
        .limit(1)
        .maybeSingle();
      if (fetchExistingErr) throw fetchExistingErr;

      if (existingCol && existingCol.id) {
        // Re-assign any newly inserted cheques to the existing collection
        if (chequeData && Array.isArray(chequeData) && chequeData.length) {
          const chequeIds = chequeData.map((d: any) => d.id).filter(Boolean);
          if (chequeIds.length) {
            const { error: reassignErr } = await supabase.from('cheques').update({ collection_id: existingCol.id }).in('id', chequeIds);
            if (reassignErr) console.error('Failed to reassign cheques to existing collection:', reassignErr);
          }
        }

        // Merge amounts into the existing collection row
        const mergedAmount = (existingCol.amount || 0) + (selectedCollection.amount || 0);
        const mergedNotes = `${existingCol.notes || ''}${existingCol.notes ? ' | ' : ''}Merged from ${selectedCollection.id}`;
        const { error: mergeErr } = await supabase.from('collections').update({ amount: mergedAmount, notes: mergedNotes }).eq('id', existingCol.id);
        if (mergeErr) console.error('Failed to merge collection amounts/notes:', mergeErr);

        // Mark the original credit collection as completed/merged
        const { error: finishErr } = await supabase.from('collections').update({ status: 'complete', notes: `Merged into ${existingCol.id}`, completed_by: currentUser?.name || '', completed_at: new Date().toISOString() }).eq('id', selectedCollection.id);
        if (finishErr) console.error('Failed to mark original collection as merged:', finishErr);

        // Update local state to reflect changes
        setCollections(prev => prev.map(c => {
          if (c.id === existingCol.id) return { ...c, amount: mergedAmount, notes: mergedNotes };
          if (c.id === selectedCollection.id) return { ...c, status: 'complete', notes: `Merged into ${existingCol.id}` };
          return c;
        }));
        if (optimisticConvertedId === selectedCollection.id) setOptimisticConvertedId(null);
      } else {
        // No existing cheque collection — safe to update type
        const { error: updateErr } = await supabase.from('collections').update({ collection_type: 'cheque' }).eq('id', selectedCollection.id);
        if (updateErr) {
          console.error('Failed to update collection type after converting to cheque:', updateErr);
          // Revert optimistic change if update failed
          if (optimisticConvertedId === selectedCollection.id) {
            setCollections(prev => prev.map(c => c.id === selectedCollection.id ? { ...c, collection_type: 'credit' } : c));
            setOptimisticConvertedId(null);
          }
        } else {
          setCollections(prev => prev.map(c => c.id === selectedCollection.id ? { ...c, collection_type: 'cheque' } : c));
          // Conversion confirmed, clear optimistic id
          if (optimisticConvertedId === selectedCollection.id) setOptimisticConvertedId(null);
        }
      }
    } catch (e) {
      console.error('Error during credit->cheque conversion handling:', e);
    }
  }
  setIsConvertingCredit(false);
  setSelectedCollection(null);
    } catch (err) {
      console.error('Error saving cheque from collection:', err);
      alert('Failed to save cheque. See console for details.');
      // Revert optimistic UI change if present
      if (optimisticConvertedId) {
        setCollections(prev => prev.map(c => c.id === optimisticConvertedId ? { ...c, collection_type: 'credit' } : c));
        setOptimisticConvertedId(null);
      }
    } finally {
      setChequeSaving(false);
    }
  };

  if (!isAdminManager) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-4">Access Denied</h1>
        <p className="text-slate-600 dark:text-slate-400">Only Admin, Secretary and Manager roles can access the Collection Management page.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Collection Management</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Review and verify all outstanding collections from field staff
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex space-x-2">
          <button
            onClick={() => handleExport('csv')}
            className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
          >
            📊 Export CSV
          </button>
          <button
            onClick={exportCollectionsPDF}
            className="flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export PDF
          </button>
          <button
            onClick={() => handleExport('xlsx')}
            className="flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm"
          >
            📈 Export Excel
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                <span className="text-2xl">📅</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Date Groups</p>
                <p className="text-2xl font-bold text-indigo-600">{groupedCollections.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>


      {/* Filters Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Collection Records</CardTitle>
              <CardDescription>
                {filteredCollections.length} collection(s) found • Total Value: {formatCurrency(filteredCollections.reduce((sum, c) => sum + c.amount, 0))}
              </CardDescription>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Status Filter</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'pending' | 'complete')}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending Verification</option>
                <option value="complete">Complete</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Type Filter</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as 'all' | 'credit' | 'cheque')}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="all">All Types</option>
                <option value="credit">💰 Credit Collections</option>
                <option value="cheque">🏦 Cheque Collections</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">From Date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">To Date</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            
            <div className="flex items-end">
              <button
                onClick={() => { setStatusFilter('all'); setTypeFilter('all'); setDateFrom(''); setDateTo(''); }}
                className="w-full px-3 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors text-sm"
              >
                Clear Filters
              </button>
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
          // If we had an optimistic conversion pending, revert it when modal closes without confirming
          if (optimisticConvertedId) {
            setCollections(prev => prev.map(c => c.id === optimisticConvertedId ? { ...c, collection_type: 'credit' } : c));
            setOptimisticConvertedId(null);
          }
          setSelectedCollection(null);
          setVerificationNotes('');
          setIsConvertingCredit(false);
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

                    {/* If this is a cheque collection or we're converting, show the cheque recording form(s) */}
                    {(selectedCollection.collection_type === 'cheque' || isConvertingCredit) && (
                      <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg space-y-3 border border-slate-200 dark:border-slate-600">
                        <h4 className="font-semibold">Record Cheque Details</h4>
                        {chequeForms.map((cf, idx) => (
                          <div key={idx} className="p-3 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-100 dark:bg-slate-700">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-sm font-medium">Cheque {idx + 1}</div>
                              {chequeForms.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setChequeForms(prev => prev.filter((_, i) => i !== idx))}
                                  className="text-xs text-red-600 hover:underline"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">Payer *</label>
                                <input 
                                  value={cf.payerName} 
                                  onChange={e => setChequeForms(prev => prev.map((f, i) => i === idx ? { ...f, payerName: e.target.value } : f))} 
                                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-600 border border-slate-300 dark:border-slate-500 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">Amount *</label>
                                <input 
                                  type="number" 
                                  value={cf.amount ?? selectedCollection.amount ?? 0} 
                                  onChange={e => setChequeForms(prev => prev.map((f, i) => i === idx ? { ...f, amount: Number(e.target.value) } : f))} 
                                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-600 border border-slate-300 dark:border-slate-500 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">Bank *</label>
                                <input 
                                  value={cf.bank} 
                                  onChange={e => setChequeForms(prev => prev.map((f, i) => i === idx ? { ...f, bank: e.target.value } : f))} 
                                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-600 border border-slate-300 dark:border-slate-500 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">Cheque Number *</label>
                                <input 
                                  value={cf.chequeNumber} 
                                  onChange={e => setChequeForms(prev => prev.map((f, i) => i === idx ? { ...f, chequeNumber: e.target.value } : f))} 
                                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-600 border border-slate-300 dark:border-slate-500 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">Cheque Date *</label>
                                <input 
                                  type="date" 
                                  value={cf.chequeDate} 
                                  onChange={e => setChequeForms(prev => prev.map((f, i) => i === idx ? { ...f, chequeDate: e.target.value } : f))} 
                                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-600 border border-slate-300 dark:border-slate-500 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">Deposit Date {isConvertingCredit ? '(required to schedule)' : '(optional)'}</label>
                                <input 
                                  type="date" 
                                  value={cf.depositDate} 
                                  onChange={e => setChequeForms(prev => prev.map((f, i) => i === idx ? { ...f, depositDate: e.target.value } : f))} 
                                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-600 border border-slate-300 dark:border-slate-500 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                                />
                              </div>
                            </div>
                            <div className="mt-3">
                              <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">Notes (Optional)</label>
                              <textarea 
                                value={cf.notes} 
                                onChange={e => setChequeForms(prev => prev.map((f, i) => i === idx ? { ...f, notes: e.target.value } : f))} 
                                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-600 border border-slate-300 dark:border-slate-500 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                                rows={2}
                              />
                            </div>
                          </div>
                        ))}

                        <div>
                          <button
                            type="button"
                            onClick={() => setChequeForms(prev => [...prev, { payerName: '', amount: 0, bank: '', chequeNumber: '', chequeDate: new Date().toISOString().slice(0,10), depositDate: '', notes: '' }])}
                            className="px-3 py-2 bg-slate-200 dark:bg-slate-600 text-sm rounded-lg"
                          >
                            + Add Another Cheque
                          </button>
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
                                {isConvertingCredit ? '🔁 Convert to Cheque' : '💳 Record Cheque'}
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