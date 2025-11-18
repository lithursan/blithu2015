import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/Card';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { supabase } from '../../supabaseClient';
import { UserRole } from '../../types';
import { exportToPDF } from '../../utils/pdfExport';

const formatCurrency = (amount: number, currency = 'LKR') => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount).replace('$', `${currency} `);
  } catch {
    return `${currency} ${amount}`;
  }
};

const ChequeManagement: React.FC = () => {
  const { currentUser } = useAuth();
  const { refetchData, customers } = useData();
  const [cheques, setCheques] = useState<any[]>([]);
  const [pendingCollections, setPendingCollections] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Check if current user is manager (read-only access) - Secretary gets full access like Admin
  const isManager = currentUser?.role === UserRole.Manager;

  const [form, setForm] = useState({
    payerName: '',
    amount: '',
    bank: '',
    chequeNumber: '',
    date: new Date().toISOString().slice(0, 10),
    notes: ''
  });
  const [showForm, setShowForm] = useState(false);
  const [editingCheque, setEditingCheque] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  
  // Date filter states
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    if (!currentUser) return;
    fetchCheques();
    fetchPendingCollections();
    // Listen for global cheques-updated events so we refresh when other components insert cheques
    const onChequesUpdated = () => fetchCheques();
    window.addEventListener('cheques-updated', onChequesUpdated);
    return () => {
      try { window.removeEventListener('cheques-updated', onChequesUpdated); } catch (e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const fetchPendingCollections = async () => {
    try {
      const { data, error } = await supabase
        .from('collections')
        .select('*')
        .eq('collection_type', 'cheque')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Error fetching pending cheque collections', error);
        setPendingCollections([]);
      } else {
        setPendingCollections(data || []);
      }
    } catch (err) {
      console.error('Unexpected error fetching pending collections', err);
      setPendingCollections([]);
    }
  };

  const fetchCheques = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cheques')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Fetch cheques error', error);
        setCheques([]);
      } else {
        setCheques(data || []);
      }
    } catch (err) {
      console.error('Unexpected error fetching cheques', err);
      setCheques([]);
    } finally {
      setLoading(false);
    }
  };

  // Filter cheques based on date range and status - separate received from others
  const { receivedCheques, otherCheques } = React.useMemo(() => {
    let filtered = [...cheques];
    
    // Date filter first (using deposit_date)
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter(c => {
        if (!c.deposit_date) return false;
        const depositDate = new Date(c.deposit_date);
        depositDate.setHours(0, 0, 0, 0);
        return depositDate >= fromDate;
      });
    }
    
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(c => {
        if (!c.deposit_date) return false;
        const depositDate = new Date(c.deposit_date);
        return depositDate <= toDate;
      });
    }
    
    // Separate received cheques from others
    const received = filtered.filter(c => {
      const status = (c.status || '').toLowerCase();
      return status === 'received';
    });
    
    const others = filtered.filter(c => {
      const status = (c.status || '').toLowerCase();
      return status === 'cleared' || status === 'bounced';
    });
    
    // Apply status filter if not 'all'
    if (statusFilter !== 'all') {
      if (statusFilter.toLowerCase() === 'received') {
        return { receivedCheques: received, otherCheques: [] };
      } else if (statusFilter.toLowerCase() === 'cleared' || statusFilter.toLowerCase() === 'bounced') {
        const statusFiltered = others.filter(c => {
          const status = (c.status || '').toLowerCase();
          return status === statusFilter.toLowerCase();
        });
        return { receivedCheques: [], otherCheques: statusFiltered };
      }
    }
    
    return { receivedCheques: received, otherCheques: others };
  }, [cheques, statusFilter, dateFrom, dateTo]);

  // Keep filteredCheques for backward compatibility
  const filteredCheques = [...receivedCheques, ...otherCheques];

  const isChequeUpcoming = (c: any) => {
    try {
      if (!c || !c.deposit_date) return false;
      const st = (c.status || '').toLowerCase();
      if (st === 'cleared' || st === 'bounced' || st === 'cancelled') return false;
      const today = new Date();
      today.setHours(0,0,0,0);
      const d = new Date(c.deposit_date);
      d.setHours(0,0,0,0);
      const diff = Math.round((d.getTime() - today.getTime()) / (1000*60*60*24));
      return diff >= 0 && diff <= 3;
    } catch (e) { return false; }
  };

  const isChequeDueToday = (c: any) => {
    try {
      if (!c || !c.deposit_date) return false;
      const today = new Date();
      today.setHours(0,0,0,0);
      const d = new Date(c.deposit_date);
      d.setHours(0,0,0,0);
      return d.getTime() === today.getTime();
    } catch (e) { return false; }
  };

  const handleChange = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    
    // Validate all required fields (all except notes are mandatory)
    if (!form.payerName?.trim() || 
        !form.amount || 
        Number(form.amount) <= 0 || 
        !form.bank?.trim() || 
        !form.chequeNumber?.trim() || 
        !form.date?.trim()) {
      alert('Please fill in all required fields: Payer Name, Amount, Bank, Cheque Number, and Deposit Date. Only Notes field is optional.');
      return;
    }
    
    const payload = {
      payer_name: form.payerName || null,
      amount: Number(form.amount) || 0,
      bank: form.bank || null,
      cheque_number: form.chequeNumber || null,
      deposit_date: form.date || null,
      notes: form.notes || null,
      status: 'Received',
      created_by: currentUser.id,
      created_at: new Date().toISOString()
    };

    setLoading(true);
    try {
      const { data, error } = await supabase.from('cheques').insert([payload]).select();
      if (error) {
        console.error('Insert cheque error', error);
        alert('Failed to save cheque. See console for details.');
      } else {
        // prepend new cheque
        setCheques(prev => [(data && data[0]) || payload, ...prev]);
        setForm({ payerName: '', amount: '', bank: '', chequeNumber: '', date: new Date().toISOString().slice(0,10), notes: '' });
        // hide the form after successful save
        setShowForm(false);
      }
    } catch (err) {
      console.error('Unexpected insert error', err);
    } finally {
      setLoading(false);
    }
  };

  const markCleared = async (id: any) => {
    if (!id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('cheques').update({ status: 'Cleared', cleared_at: new Date().toISOString() }).eq('id', id).select();
      if (error) {
        console.error('Mark cleared error', error);
        alert('Failed to update cheque status.');
      } else {
        const updatedCheque = (data && data[0]) || null;
        setCheques(prev => prev.map(c => c.id === id ? updatedCheque || { ...c, status: 'Cleared' } : c));

        // If this cheque was created from a collection, mark that collection complete and
        // update the related order's balances/amountpaid when cheque clears.
        try {
          // Prefer collection linkage, but fall back to cheque.order_id if no collection present.
          const collId = updatedCheque?.collection_id;
          let orderId: any = null;
          let collectionType: any = null;

          if (collId) {
            // Fetch collection to learn order_id and collection_type
            const { data: collRow, error: collErr } = await supabase.from('collections').select('*').eq('id', collId).single();
            if (!collErr && collRow) {
              orderId = collRow.order_id;
              collectionType = collRow.collection_type;
            }
          }

          // If no collection/order found but cheque directly references an order, use that
          if (!orderId && updatedCheque?.order_id) {
            orderId = updatedCheque.order_id;
            // Treat as a cheque-type payment when directly linked from cheque
            collectionType = 'cheque';
          }

          if (orderId) {
            // If collection references an order, update order amounts
            const { data: orderData, error: orderErr } = await supabase.from('orders').select('amountpaid, chequebalance, creditbalance').eq('id', orderId).single();
            if (orderErr) throw orderErr;
            const prevAmountPaid = orderData?.amountpaid || 0;
            const chequeAmount = updatedCheque?.amount || 0;
            
            const updatedOrder: any = {
              amountpaid: prevAmountPaid + chequeAmount,
            };
            
            // For cheque collections, reduce chequebalance by the specific cheque amount (not set to 0)
            if (collectionType === 'cheque') {
              const currentChequeBalance = orderData?.chequebalance || 0;
              updatedOrder.chequebalance = Math.max(0, currentChequeBalance - chequeAmount);
            } else if (collectionType === 'credit') {
              // For credit collections, we can still set creditbalance to 0 as before
              updatedOrder.creditbalance = 0;
            }
            
            const { error: updateOrderErr } = await supabase.from('orders').update(updatedOrder).eq('id', orderId);
            if (updateOrderErr) throw updateOrderErr;
          }

          // If there was a linked collection, mark it complete
          if (collId) {
            const { error: collUpdateErr } = await supabase.from('collections').update({ status: 'complete', completed_by: currentUser?.name || '', completed_at: new Date().toISOString() }).eq('id', collId);
            if (collUpdateErr) throw collUpdateErr;
          }
        } catch (err) {
          console.error('Error updating collection/order after cheque clear:', err);
        }
        // Refresh lists after updates
        if (refetchData) await refetchData();
        await fetchPendingCollections();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const setDepositDate = async (id: any, date: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('cheques').update({ deposit_date: date }).eq('id', id).select();
      if (error) {
        console.error('Set deposit date error', error);
        alert('Failed to set deposit date');
      } else {
        setCheques(prev => prev.map(c => c.id === id ? (data && data[0]) || { ...c, deposit_date: date } : c));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const markBounced = async (cheque: any) => {
    if (!cheque || !cheque.id) return;
    setLoading(true);
    try {
      // Update cheque status to Bounced
      const { data: updatedData, error: updateErr } = await supabase.from('cheques').update({ status: 'Bounced', bounced_at: new Date().toISOString() }).eq('id', cheque.id).select();
      if (updateErr) throw updateErr;
      const updatedCheque = (updatedData && updatedData[0]) || { ...cheque, status: 'Bounced', bounced_at: new Date().toISOString() };

      // Update local cheque state to reflect bounced status
      setCheques(prev => prev.map(c => c.id === cheque.id ? updatedCheque : c));

      // Helper to insert a collection with a fallback when server schema cache
      // doesn't include certain columns (e.g., 'created_by'). Retries without
      // the optional fields if needed.
      const tryInsertCollection = async (payload: any) => {
        try {
            const { data, error } = await supabase.from('collections').insert([payload]).select();
            if (error) throw error;
            return { data, error: null };
        } catch (e: any) {
          // PostgREST schema cache errors show up as PGRST204 and mention missing column
          const msg = (e && (e.message || e.error || JSON.stringify(e))) || '';
            // Handle duplicate key (unique constraint) - since we now use order_id: null
            // for bounced cheques, this should rarely happen, but keep as fallback
            if (e && (e.code === '23505' || msg.includes('duplicate key value'))) {
              console.error('Unexpected duplicate key for bounced cheque collection (order_id should be null):', e);
              return { data: null, error: e };
            }
            // Handle 400 Bad Request or schema cache issues by removing optional fields
            if (e && (e.code === 'PGRST204' || e.status === 400 || msg.includes("Could not find") || msg.includes('Bad Request'))) {
            // Retry with only core required fields
            const reduced: any = {
              order_id: payload.order_id,
              customer_id: payload.customer_id,
              collection_type: payload.collection_type,
              amount: payload.amount,
              status: payload.status
            };
            // Add notes if it exists and isn't causing issues
            if (payload.notes) reduced.notes = payload.notes;
            
            try {
              const { data: d2, error: err2 } = await supabase.from('collections').insert([reduced]).select();
              if (err2) throw err2;
              return { data: d2, error: null };
            } catch (e2: any) {
              console.error('Retry insert with minimal fields failed:', e2);
              // Final attempt with absolute minimum fields
              try {
                const minimal = {
                  order_id: payload.order_id,
                  customer_id: payload.customer_id,
                  collection_type: payload.collection_type,
                  amount: payload.amount,
                  status: payload.status
                };
                const { data: d3, error: err3 } = await supabase.from('collections').insert([minimal]).select();
                if (err3) throw err3;
                return { data: d3, error: null };
              } catch (e3) {
                console.error('Final minimal insert failed:', e3);
                return { data: null, error: e3 };
              }
            }
          }
          return { data: null, error: e };
        }
      };

      // Create a separate credit collection for bounced cheque with variant Order ID
      try {
        const originalOrderId = updatedCheque.order_id || cheque.order_id || null;
        let customerId = updatedCheque.customer_id || cheque.customer_id || null;
        const creditAmount = Number(updatedCheque.amount || cheque.amount || 0);
        const payerName = updatedCheque.payer_name || cheque.payer_name || '';
        const note = `Cheque bounced (cheque id: ${cheque.id}, cheque#: ${cheque.cheque_number || '-'})`;
        
        // If we have a payer name but no customer_id, try to find customer by name
        if (!customerId && payerName && customers) {
          const matchingCustomer = customers.find(c => 
            (c.name && c.name.toLowerCase() === payerName.toLowerCase()) ||
            (c.customerName && c.customerName.toLowerCase() === payerName.toLowerCase())
          );
          if (matchingCustomer) {
            customerId = matchingCustomer.id;
          }
        }
        
        // Generate unique variant Order ID for bounced cheque (B1, B2, etc.)
        let variantOrderId = null;
        if (originalOrderId) {
          // Find existing bounced collections for this order to determine next variant number
          const { data: existingBounced, error: fetchErr } = await supabase
            .from('collections')
            .select('order_id')
            .like('order_id', `${originalOrderId}_B%`)
            .order('order_id', { ascending: false })
            .limit(1);
          
          let nextVariant = 1;
          if (!fetchErr && existingBounced && existingBounced.length > 0) {
            const lastVariant = existingBounced[0].order_id;
            const match = lastVariant.match(/_B(\d+)$/);
            if (match) {
              nextVariant = parseInt(match[1]) + 1;
            }
          }
          variantOrderId = `${originalOrderId}_B${nextVariant}`;
        } else {
          // If no original order ID, create a generic bounced ID
          variantOrderId = `BOUNCED_${Date.now()}_B1`;
        }

        // Get original collection details (customer and collected_by) if available
        let collectedBy = null;
        if (originalOrderId) {
          const { data: originalCol, error: origErr } = await supabase
            .from('collections')
            .select('collected_by, customer_id')
            .eq('order_id', originalOrderId)
            .limit(1)
            .maybeSingle();
          if (!origErr && originalCol) {
            collectedBy = originalCol.collected_by;
            // Use customer_id from original collection if we don't have one
            if (!customerId && originalCol.customer_id) {
              customerId = originalCol.customer_id;
            }
          }
        }

        const payload: any = {
          order_id: variantOrderId,  // Use variant ID like ORD089_918_B1, ORD089_918_B2, etc.
          customer_id: customerId,
          collection_type: 'credit',
          amount: creditAmount,
          status: 'pending',
          collected_by: collectedBy,  // Preserve original collected_by
          created_by: currentUser?.id || null,
          created_at: new Date().toISOString(),
          notes: `${note}${originalOrderId ? ` (from order: ${originalOrderId})` : ''}${payerName ? ` | Payer: ${payerName}` : ''}`
        };
        const { data: collData, error: collErr } = await tryInsertCollection(payload);
        if (collErr) console.error('Failed to insert credit collection for bounced cheque:', collErr, collData);
      } catch (e) {
        console.error('Error creating/merging credit collection for bounced cheque:', e);
      }

      // Refresh pending collections so Collections page reflects new credit
      if (refetchData) await refetchData();
      await fetchPendingCollections();

      alert('Cheque marked as bounced and a credit collection record was created/updated.');
    } catch (err) {
      console.error('Error marking bounced:', err);
      alert('Failed to mark cheque bounced. See console for details.');
    } finally {
      setLoading(false);
    }
  };

  const deleteCheque = async (id: any) => {
    if (!id) return;
    
    // Password protection for delete operation
    const password = prompt('Enter admin password to delete this cheque:');
    if (password !== '1234') {
      alert('Incorrect password. Delete operation cancelled.');
      return;
    }
    
    // Confirmation after password verification
    // eslint-disable-next-line no-restricted-globals
    const ok = window.confirm('Are you sure you want to delete this cheque? This action cannot be undone.');
    if (!ok) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.from('cheques').delete().eq('id', id).select();
      if (error) {
        console.error('Delete cheque error', error);
        alert('Failed to delete cheque. See console for details.');
      } else {
        // remove from local state
        setCheques(prev => prev.filter(c => c.id !== id));
        // refresh related lists
        if (refetchData) await refetchData();
        await fetchPendingCollections();
        alert('Cheque deleted successfully.');
      }
    } catch (err) {
      console.error('Unexpected delete error', err);
      alert('Failed to delete cheque. See console for details.');
    } finally {
      setLoading(false);
    }
  };

  const recognizeCollection = async (collection: any) => {
    if (!collection) return;
    setLoading(true);
    try {
      // Fetch the related order to update amountpaid
      let prevAmountPaid = 0;
      if (collection.order_id) {
        const { data: orderData, error: orderErr } = await supabase.from('orders').select('amountpaid').eq('id', collection.order_id).single();
        if (orderErr) throw orderErr;
        prevAmountPaid = orderData?.amountpaid || 0;
      }

      // Prepare order update
      const updatedOrderData: any = {};
      if (collection.order_id) {
        updatedOrderData.amountpaid = (prevAmountPaid || 0) + (collection.amount || 0);
        // Do NOT clear cheque balance here for cheque collections. Cheques are handled
        // through the cheque lifecycle (only cleared when the cheque itself is marked cleared).
        // If this is a credit collection, clear the credit balance.
        if (collection.collection_type === 'credit') {
          updatedOrderData.creditbalance = 0;
        }
      }

      if (collection.order_id) {
        const { error: updateOrderErr } = await supabase.from('orders').update(updatedOrderData).eq('id', collection.order_id);
        if (updateOrderErr) throw updateOrderErr;
      }

      // Mark collection as complete
      const { error: collErr } = await supabase.from('collections').update({ status: 'complete', completed_by: currentUser?.name || '', completed_at: new Date().toISOString() }).eq('id', collection.id);
      if (collErr) throw collErr;

      // Refresh local lists
      await fetchPendingCollections();
      if (refetchData) await refetchData();

      alert('Collection recognized and order updated.');
    } catch (err) {
      console.error('Error recognizing collection:', err);
      alert('Failed to recognize collection. See console for details.');
    } finally {
      setLoading(false);
    }
  };

  const editCheque = (cheque: any) => {
    setEditingCheque(cheque);
    setForm({
      payerName: cheque.payer_name || '',
      amount: cheque.amount?.toString() || '',
      bank: cheque.bank || '',
      chequeNumber: cheque.cheque_number || '',
      date: cheque.deposit_date ? (cheque.deposit_date.slice ? cheque.deposit_date.slice(0, 10) : cheque.deposit_date) : new Date().toISOString().slice(0, 10),
      notes: cheque.notes || ''
    });
    setIsEditing(true);
    setShowForm(true);
  };

  const updateCheque = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !editingCheque) return;
    
    // Validate all required fields
    if (!form.payerName?.trim() || 
        !form.amount || 
        Number(form.amount) <= 0 || 
        !form.bank?.trim() || 
        !form.chequeNumber?.trim() || 
        !form.date?.trim()) {
      alert('Please fill in all required fields: Payer Name, Amount, Bank, Cheque Number, and Deposit Date. Only Notes field is optional.');
      return;
    }
    
    const payload = {
      payer_name: form.payerName || null,
      amount: Number(form.amount) || 0,
      bank: form.bank || null,
      cheque_number: form.chequeNumber || null,
      deposit_date: form.date || null,
      notes: form.notes || null
    };

    setLoading(true);
    try {
      const { data, error } = await supabase.from('cheques').update(payload).eq('id', editingCheque.id).select();
      if (error) {
        console.error('Update cheque error', error);
        alert('Failed to update cheque. See console for details.');
      } else {
        // Update the cheque in the list
        const updatedCheque = (data && data[0]) || { ...editingCheque, ...payload };
        setCheques(prev => prev.map(c => c.id === editingCheque.id ? updatedCheque : c));
        
        // Reset form and editing state
        setForm({ payerName: '', amount: '', bank: '', chequeNumber: '', date: new Date().toISOString().slice(0,10), notes: '' });
        setEditingCheque(null);
        setIsEditing(false);
        setShowForm(false);
      }
    } catch (err) {
      console.error('Unexpected update error', err);
    } finally {
      setLoading(false);
    }
  };

  const cancelEdit = () => {
    setEditingCheque(null);
    setIsEditing(false);
    setForm({ payerName: '', amount: '', bank: '', chequeNumber: '', date: new Date().toISOString().slice(0,10), notes: '' });
    setShowForm(false);
  };

  const exportChequesPDF = () => {
    const columns = [
      { key: 'payer_name', title: 'Payer Name' },
      { key: 'amount', title: 'Amount' },
      { key: 'bank', title: 'Bank' },
      { key: 'cheque_number', title: 'Cheque Number' },
      { key: 'deposit_date', title: 'Deposit Date' },
      { key: 'status', title: 'Status' },
      { key: 'notes', title: 'Notes' }
    ];

    const data = cheques.map(cheque => ({
      payer_name: cheque.payer_name || 'N/A',
      amount: `LKR ${(cheque.amount || 0).toFixed(2)}`,
      bank: cheque.bank || 'N/A',
      cheque_number: cheque.cheque_number || 'N/A',
      deposit_date: cheque.deposit_date ? new Date(cheque.deposit_date).toLocaleDateString() : 'Not set',
      status: cheque.status || 'Pending',
      notes: cheque.notes || 'No notes'
    }));

    const totalAmount = cheques.reduce((sum, c) => sum + (c.amount || 0), 0);

    exportToPDF('Received Cheques Report', columns, data, {
      summary: {
        'Total Cheques': cheques.length.toString(),
        'Total Amount': `LKR ${totalAmount.toFixed(2)}`,
        'Cleared Cheques': cheques.filter(c => c.status === 'Cleared').length.toString(),
        'Pending Cheques': cheques.filter(c => c.status === 'Pending').length.toString(),
        'Bounced Cheques': cheques.filter(c => c.status === 'Bounced').length.toString()
      }
    });
  };

  if (!currentUser || (currentUser.role !== 'Admin' && currentUser.role !== 'Secretary' && currentUser.role !== 'Manager')) {
    return <div className="p-6">You must be an Admin, Secretary or Manager to access Cheque Management.</div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Cheque Management</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Manage received cheques and track deposit schedules
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex space-x-2">
          <button
            onClick={exportChequesPDF}
            className="flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export PDF
          </button>
        </div>
        <div className="mt-4 sm:mt-0 flex space-x-2">
          {!isManager && (
            <button
              onClick={() => setShowForm(s => !s)}
              className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
            >
              <span className="text-lg mr-2">+</span>
              {showForm ? 'Hide Form' : 'Record Cheque'}
            </button>
          )}
          {cheques.length > 0 && (
            <button
              onClick={exportChequesPDF}
              className="flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export PDF
            </button>
          )}
        </div>
      </div>

      {/* Alert Cards */}
      {(() => {
        const upcomingCheques = cheques.filter(c => isChequeUpcoming(c));
        const dueTodayCheques = cheques.filter(c => isChequeDueToday(c));
        const pendingCheques = cheques.filter(c => c.status !== 'Cleared' && c.status !== 'Bounced' && c.deposit_date);
        
        return (dueTodayCheques.length > 0 || upcomingCheques.length > 0 || pendingCheques.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 auto-cols-fr">
            {dueTodayCheques.length > 0 && (
              <Card className="border-0 bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02]">
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <div className="p-3 bg-gradient-to-br from-orange-400 to-orange-500 rounded-xl shadow-lg">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-semibold text-orange-800 dark:text-orange-200 uppercase tracking-wide">Due Today</p>
                      <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{dueTodayCheques.length}</p>
                      <p className="text-xs text-orange-700 dark:text-orange-300">cheque(s) to deposit</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            
            {upcomingCheques.length > 0 && (
              <Card className="border-0 bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02]">
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <div className="p-3 bg-gradient-to-br from-yellow-400 to-yellow-500 rounded-xl shadow-lg">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 uppercase tracking-wide">Upcoming</p>
                      <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{upcomingCheques.length}</p>
                      <p className="text-xs text-yellow-700 dark:text-yellow-300">within 3 days</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {pendingCheques.length > 0 && (
              <Card className="border-0 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02]">
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-semibold text-blue-800 dark:text-blue-200 uppercase tracking-wide">Scheduled</p>
                      <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{pendingCheques.length}</p>
                      <p className="text-xs text-blue-700 dark:text-blue-300">deposits planned</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        );
      })()}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-3">
            <div className="text-center space-y-2">
              <div className="flex justify-center">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <span className="text-xl">🏦</span>
                </div>
              </div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 leading-tight">Total Cheques</p>
              <p className="text-sm font-bold text-blue-600 break-words">{filteredCheques.length}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="text-center space-y-2">
              <div className="flex justify-center">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <span className="text-xl">✅</span>
                </div>
              </div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 leading-tight">Cleared</p>
              <p className="text-sm font-bold text-green-600 break-words">{filteredCheques.filter(c => c.status === 'Cleared').length}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="text-center space-y-2">
              <div className="flex justify-center">
                <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                  <span className="text-xl">⏳</span>
                </div>
              </div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 leading-tight">Pending</p>
              <p className="text-sm font-bold text-yellow-600 break-words">{filteredCheques.filter(c => c.status !== 'Cleared' && c.status !== 'Bounced').length}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="text-center space-y-2">
              <div className="flex justify-center">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                  <span className="text-xl">❌</span>
                </div>
              </div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 leading-tight">Bounced</p>
              <p className="text-sm font-bold text-red-600 break-words">{filteredCheques.filter(c => c.status === 'Bounced').length}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="text-center space-y-2">
              <div className="flex justify-center">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                  <span className="text-xl">📅</span>
                </div>
              </div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 leading-tight">Date Groups</p>
              <p className="text-sm font-bold text-indigo-600 break-words">
                {Object.keys(filteredCheques.reduce((groups: Record<string, any[]>, c) => {
                  const key = c.deposit_date ? c.deposit_date.slice(0,10) : 'Unscheduled';
                  if (!groups[key]) groups[key] = [];
                  groups[key].push(c);
                  return groups;
                }, {})).length}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="text-center space-y-2">
              <div className="flex justify-center">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                  <span className="text-xl">💰</span>
                </div>
              </div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 leading-tight">Total Value</p>
              <p className="text-sm font-bold text-purple-600 break-words">{formatCurrency(filteredCheques.reduce((sum, c) => sum + (c.amount || 0), 0))}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Form Section */}
      {showForm && !isManager && (
        <Card>
          <CardHeader>
            <CardTitle>{isEditing ? 'Edit Cheque' : 'Record New Cheque'}</CardTitle>
            <CardDescription>{isEditing ? 'Update cheque details' : 'Enter details for a received cheque'}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={isEditing ? updateCheque : handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Payer Name *
                </label>
                <input 
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" 
                  value={form.payerName} 
                  onChange={e => handleChange('payerName', e.target.value)}
                  placeholder="Enter payer name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Amount (LKR) *
                </label>
                <input 
                  type="number" 
                  step="0.01" 
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" 
                  value={form.amount} 
                  onChange={e => handleChange('amount', e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Bank *
                </label>
                <input 
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" 
                  value={form.bank} 
                  onChange={e => handleChange('bank', e.target.value)}
                  placeholder="Bank name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Cheque Number *
                </label>
                <input 
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" 
                  value={form.chequeNumber} 
                  onChange={e => handleChange('chequeNumber', e.target.value)}
                  placeholder="Cheque number"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Deposit Date *
                </label>
                <input 
                  type="date" 
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" 
                  value={form.date} 
                  onChange={e => handleChange('date', e.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Notes (Optional)
                </label>
                <textarea 
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" 
                  value={form.notes} 
                  onChange={e => handleChange('notes', e.target.value)}
                  placeholder="Additional notes..."
                  rows={3}
                />
              </div>
              <div className="md:col-span-2 flex justify-end space-x-3">
                {isEditing && (
                  <button 
                    type="button" 
                    onClick={cancelEdit}
                    className="px-6 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                )}
                <button 
                  type="submit" 
                  disabled={loading} 
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg transition-colors"
                >
                  {loading ? (isEditing ? 'Updating...' : 'Recording...') : (isEditing ? 'Update Cheque' : 'Record Cheque')}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Cheques List */}
      {/* Filters */}
      <Card className="border border-slate-200 dark:border-slate-700">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Status Filter
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="all">All Status</option>
                <option value="received">Received</option>
                <option value="cleared">Cleared</option>
                <option value="bounced">Bounced</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                From Date
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                To Date
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setStatusFilter('all');
                  setDateFrom('');
                  setDateTo('');
                }}
                className="w-full px-3 py-2 text-sm bg-slate-500 hover:bg-slate-600 text-white rounded-lg transition-colors font-medium"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* RECEIVED CHEQUES SECTION */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-green-700 dark:text-green-400">📋 Received Cheques</CardTitle>
              <CardDescription>
                {receivedCheques.length} cheque(s) received • Total Value: {formatCurrency(receivedCheques.reduce((sum, c) => sum + (c.amount || 0), 0))}
              </CardDescription>
            </div>
            {receivedCheques.length > 0 && (
              <div className="text-sm text-slate-500">
                Total Value: {formatCurrency(receivedCheques.reduce((sum, c) => sum + (c.amount || 0), 0))}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-slate-500">Loading cheques...</div>
            </div>
          ) : receivedCheques.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-2">📋</div>
              <p className="text-slate-500 mb-2">No received cheques match the selected filters</p>
            </div>
          ) : (
            <>
              {/* Group received cheques by deposit_date */}
              {(() => {
                const groups: Record<string, any[]> = {};
                for (const c of receivedCheques) {
                  const key = c.deposit_date ? (c.deposit_date.slice ? c.deposit_date.slice(0,10) : String(c.deposit_date)) : 'Unscheduled';
                  if (!groups[key]) groups[key] = [];
                  groups[key].push(c);
                }
                const keys = Object.keys(groups).sort((a,b) => {
                  if (a === 'Unscheduled') return 1;
                  if (b === 'Unscheduled') return -1;
                  return new Date(a).getTime() - new Date(b).getTime();
                });
                return (
                  <div className="space-y-6">
                    {keys.map(k => (
                      <div key={k} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800">
                        {/* Date Header */}
                        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-slate-700 dark:to-slate-600 px-6 py-4 border-b border-slate-200 dark:border-slate-600">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                                {k === 'Unscheduled' ? '📅 Unscheduled Deposits' : `📅 ${new Date(k).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`}
                              </h3>
                              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                                {groups[k].length} cheque(s) • Total: {formatCurrency(groups[k].reduce((sum, c) => sum + (c.amount || 0), 0))}
                              </p>
                            </div>
                            <div className="text-sm text-slate-500">
                              {groups[k].length} cheque(s) • {formatCurrency(groups[k].reduce((sum, c) => sum + (c.amount || 0), 0))}
                            </div>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-slate-100 dark:bg-slate-700">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Payer</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Amount</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Bank</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Cheque #</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Deposit Date</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Status</th>
                                {!isManager && <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Actions</th>}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                              {groups[k].map((c:any) => (
                                <tr key={c.id} className={`
                                  ${isChequeDueToday(c) 
                                    ? 'bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-500' 
                                    : isChequeUpcoming(c) 
                                    ? 'bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500' 
                                    : 'bg-white dark:bg-slate-800'
                                  } hover:bg-slate-50 dark:hover:bg-slate-700/50
                                `}>
                                  <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">{c.payer_name || '-'}</td>
                                  <td className="px-4 py-3 text-sm font-semibold text-green-600">{formatCurrency(c.amount || 0)}</td>
                                  <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{c.bank || '-'}</td>
                                  <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{c.cheque_number || '-'}</td>
                                  <td className="px-4 py-3">
                                    {isManager ? (
                                      <span className="px-2 py-1 text-sm text-slate-500 dark:text-slate-400">
                                        {c.deposit_date ? (c.deposit_date.slice ? c.deposit_date.slice(0,10) : c.deposit_date) : 'Not set'}
                                      </span>
                                    ) : (
                                      <input 
                                        type="date" 
                                        defaultValue={c.deposit_date ? (c.deposit_date.slice ? c.deposit_date.slice(0,10) : c.deposit_date) : ''} 
                                        onChange={(e) => setDepositDate(c.id, e.target.value)} 
                                        className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500 focus:border-transparent" 
                                      />
                                    )}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                      c.status === 'Cleared' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                      c.status === 'Bounced' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                                      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                                    }`}>
                                      {c.status || 'Received'}
                                    </span>
                                    {isChequeDueToday(c) && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">Due Today</span>}
                                  </td>
                                  {!isManager && (
                                    <td className="px-4 py-3">
                                      {c.status === 'Cleared' || c.status === 'Bounced' ? (
                                        <div className="flex space-x-2">
                                          <button 
                                            onClick={() => editCheque(c)} 
                                            className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                                          >
                                            Edit
                                          </button>
                                          <button 
                                            onClick={() => deleteCheque(c.id)} 
                                            className="px-3 py-1 text-xs bg-slate-600 hover:bg-slate-700 text-white rounded transition-colors"
                                          >
                                            Delete
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="flex space-x-2">
                                          <button 
                                            onClick={() => editCheque(c)} 
                                            className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                                          >
                                            Edit
                                          </button>
                                          <button 
                                            onClick={() => markCleared(c.id)} 
                                            className="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                                          >
                                            Clear
                                          </button>
                                          <button 
                                            onClick={() => markBounced(c)} 
                                            className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                                          >
                                            Bounce
                                          </button>
                                          <button 
                                            onClick={() => deleteCheque(c.id)} 
                                            className="px-3 py-1 text-xs bg-slate-600 hover:bg-slate-700 text-white rounded transition-colors"
                                          >
                                            Delete
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </>
          )}
        </CardContent>
      </Card>

      {/* OTHER CHEQUES SECTION (Cleared & Bounced) */}
      {otherCheques.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-slate-600 dark:text-slate-400">📁 Processed Cheques</CardTitle>
                <CardDescription>
                  {otherCheques.length} cheque(s) processed • Total Value: {formatCurrency(otherCheques.reduce((sum, c) => sum + (c.amount || 0), 0))}
                </CardDescription>
              </div>
              {otherCheques.length > 0 && (
                <div className="text-sm text-slate-500">
                  Total Value: {formatCurrency(otherCheques.reduce((sum, c) => sum + (c.amount || 0), 0))}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <>
              {/* Group other cheques by deposit_date */}
              {(() => {
                const groups: Record<string, any[]> = {};
                for (const c of otherCheques) {
                  const key = c.deposit_date ? (c.deposit_date.slice ? c.deposit_date.slice(0,10) : String(c.deposit_date)) : 'Unscheduled';
                  if (!groups[key]) groups[key] = [];
                  groups[key].push(c);
                }
                const keys = Object.keys(groups).sort((a,b) => {
                  if (a === 'Unscheduled') return 1;
                  if (b === 'Unscheduled') return -1;
                  return new Date(a).getTime() - new Date(b).getTime();
                });
                return (
                  <div className="space-y-6">
                    {keys.map(k => (
                      <div key={k} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-700/50 opacity-75">
                        {/* Date Header */}
                        <div className="bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-600 dark:to-slate-700 px-6 py-4 border-b border-slate-200 dark:border-slate-600">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">
                                {k === 'Unscheduled' ? '📁 Unscheduled Deposits' : `📁 ${new Date(k).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`}
                              </h3>
                              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                {groups[k].length} cheque(s) • Total: {formatCurrency(groups[k].reduce((sum, c) => sum + (c.amount || 0), 0))}
                              </p>
                            </div>
                            <div className="text-sm text-slate-500">
                              {groups[k].length} cheque(s) • {formatCurrency(groups[k].reduce((sum, c) => sum + (c.amount || 0), 0))}
                            </div>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-slate-200 dark:bg-slate-600">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Payer</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Amount</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Bank</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Cheque #</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Deposit Date</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Status</th>
                                {!isManager && <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Actions</th>}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                              {groups[k].map((c:any) => (
                                <tr key={c.id} className="bg-slate-50 dark:bg-slate-700/30 hover:bg-slate-100 dark:hover:bg-slate-600/50">
                                  <td className="px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300">{c.payer_name || '-'}</td>
                                  <td className="px-4 py-3 text-sm font-semibold text-green-600">{formatCurrency(c.amount || 0)}</td>
                                  <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{c.bank || '-'}</td>
                                  <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{c.cheque_number || '-'}</td>
                                  <td className="px-4 py-3">
                                    {isManager ? (
                                      <span className="px-2 py-1 text-sm text-slate-500 dark:text-slate-400">
                                        {c.deposit_date ? new Date(c.deposit_date).toLocaleDateString('en-GB') : '-'}
                                      </span>
                                    ) : (
                                      <input
                                        type="date"
                                        value={c.deposit_date || ''}
                                        onChange={(e) => updateDepositDate(c.id, e.target.value)}
                                        className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                                      />
                                    )}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                      (c.status || '').toLowerCase() === 'cleared' 
                                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                                        : (c.status || '').toLowerCase() === 'bounced' 
                                        ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' 
                                        : 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300'
                                    }`}>
                                      {c.status || 'Unknown'}
                                    </span>
                                  </td>
                                  {!isManager && (
                                    <td className="px-4 py-3">
                                      <div className="flex space-x-2">
                                        <button 
                                          onClick={() => deleteCheque(c.id)} 
                                          className="px-3 py-1 text-xs bg-slate-600 hover:bg-slate-700 text-white rounded transition-colors"
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </>
          </CardContent>
        </Card>
      )}

    </div>
  );
};

export default ChequeManagement;