import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/Card';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { supabase } from '../../supabaseClient';

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

  const [form, setForm] = useState({
    payerName: '',
    amount: '',
    bank: '',
    chequeNumber: '',
    date: new Date().toISOString().slice(0, 10),
    notes: ''
  });
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    fetchCheques();
    fetchPendingCollections();
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
    const payload = {
      payer_name: form.payerName || null,
      amount: Number(form.amount) || 0,
      bank: form.bank || null,
      cheque_number: form.chequeNumber || null,
      cheque_date: form.date || null,
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
            const { data: orderData, error: orderErr } = await supabase.from('orders').select('amountpaid').eq('id', orderId).single();
            if (orderErr) throw orderErr;
            const prevAmountPaid = orderData?.amountpaid || 0;
            const updatedOrder: any = {
              amountpaid: (prevAmountPaid || 0) + (updatedCheque?.amount || 0),
            };
            if (collectionType === 'cheque') {
              updatedOrder.chequebalance = 0;
            } else if (collectionType === 'credit') {
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
      const { data: updatedCheque, error: updateErr } = await supabase.from('cheques').update({ status: 'Bounced', bounced_at: new Date().toISOString() }).eq('id', cheque.id).select();
      if (updateErr) throw updateErr;

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
      const { data: collData, error: collErr } = await supabase.from('collections').insert([collectionPayload]).select();
      if (collErr) throw collErr;

  // Update local state
  setCheques(prev => prev.filter(c => c.id !== cheque.id));
  // Refresh pending collections so Collections page reflects new credit
  if (refetchData) await refetchData();
  await fetchPendingCollections();

      alert('Cheque marked as bounced and a credit collection record was created.');
    } catch (err) {
      console.error('Error marking bounced:', err);
      alert('Failed to mark cheque bounced. See console for details.');
    } finally {
      setLoading(false);
    }
  };

  const deleteCheque = async (id: any) => {
    if (!id) return;
    // simple confirmation — keeps implementation small and familiar
    // (can be replaced with a modal component later)
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

  if (!currentUser || currentUser.role !== 'Admin') {
    return <div className="p-6">You must be an Admin to access Cheque Management.</div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100">Cheque Management</h1>
        <div className="mt-3 sm:mt-0 ml-0 sm:ml-4 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setShowForm(s => !s)}
            className="w-full sm:w-auto px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm"
          >
            {showForm ? 'Hide Form' : 'Record Cheque'}
          </button>
        </div>
      </div>

      <div className={`grid grid-cols-1 ${showForm ? 'lg:grid-cols-3' : 'lg:grid-cols-1'} gap-4 mb-6`}>
        {showForm && (
          <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl">Record Received Cheque</CardTitle>
            <CardDescription className="text-slate-300">Enter cheque details and save</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium">Payer</label>
                <input className="w-full px-3 py-2 rounded bg-slate-800 text-slate-100 placeholder-slate-400 border border-slate-700" value={form.payerName} onChange={e => handleChange('payerName', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium">Amount</label>
                <input type="number" step="0.01" className="w-full px-3 py-2 rounded bg-slate-800 text-slate-100 placeholder-slate-400 border border-slate-700" value={form.amount} onChange={e => handleChange('amount', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium">Bank</label>
                <input className="w-full px-3 py-2 rounded bg-slate-800 text-slate-100 placeholder-slate-400 border border-slate-700" value={form.bank} onChange={e => handleChange('bank', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium">Cheque Number</label>
                <input className="w-full px-3 py-2 rounded bg-slate-800 text-slate-100 placeholder-slate-400 border border-slate-700" value={form.chequeNumber} onChange={e => handleChange('chequeNumber', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium">Cheque Date</label>
                <input type="date" className="w-full px-3 py-2 rounded bg-slate-800 text-slate-100 placeholder-slate-400 border border-slate-700" value={form.date} onChange={e => handleChange('date', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium">Notes</label>
                <textarea className="w-full px-3 py-2 rounded bg-slate-800 text-slate-100 placeholder-slate-400 border border-slate-700" value={form.notes} onChange={e => handleChange('notes', e.target.value)} />
              </div>
              <div>
                <button type="submit" disabled={loading} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md w-full sm:w-auto">Save Cheque</button>
              </div>
            </form>
          </CardContent>
          </Card>
        )}

        <Card className={showForm ? 'lg:col-span-2' : 'lg:col-span-1'}>
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl">Received Cheques</CardTitle>
            <CardDescription className="text-slate-300">List of cheques recorded</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-slate-300">Loading...</p>
            ) : cheques.length === 0 ? (
              <p className="text-sm text-slate-400">No cheques recorded yet.</p>
            ) : (
              <>
                {/* Desktop / tablet table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-sm text-slate-200 uppercase bg-slate-800">
                      <tr>
                        <th className="px-4 py-3">Payer</th>
                        <th className="px-4 py-3">Amount</th>
                        <th className="px-4 py-3">Bank</th>
                        <th className="px-4 py-3">Cheque #</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Deposit Date</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cheques.map(c => (
                        <tr key={c.id} className={`border-b border-slate-700 ${isChequeDueToday(c) ? 'bg-yellow-900/20' : isChequeUpcoming(c) ? 'bg-red-900/20' : ''}`}>
                          <td className="px-4 py-3 font-semibold text-slate-100">{c.payer_name || '-'}</td>
                          <td className="px-4 py-3 text-slate-200">{formatCurrency(c.amount || 0)}</td>
                          <td className="px-4 py-3 text-slate-200">{c.bank || '-'}</td>
                          <td className="px-4 py-3 text-slate-200">{c.cheque_number || '-'}</td>
                          <td className="px-4 py-3 text-slate-200">{(c.cheque_date || c.created_at || '').slice ? (c.cheque_date || c.created_at).slice(0,10) : String(c.cheque_date || c.created_at)}</td>
                          <td className="px-4 py-3">
                            <input type="date" defaultValue={c.deposit_date ? (c.deposit_date.slice ? c.deposit_date.slice(0,10) : c.deposit_date) : ''} onChange={(e) => setDepositDate(c.id, e.target.value)} className="px-2 py-1 rounded bg-slate-800 text-slate-100 border border-slate-700" />
                          </td>
                        <td className="px-4 py-3 text-slate-200">{c.status || 'Received'} {isChequeDueToday(c) && <span className="ml-2 inline-block px-2 py-0.5 text-xs font-medium text-yellow-800 bg-yellow-200 rounded">Due Today</span>}</td>
                          <td className="px-4 py-3">
                            {c.status !== 'Cleared' && (
                              <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2">
                                <button onClick={() => markCleared(c.id)} className="px-3 py-2 bg-green-600 text-white rounded-md text-sm w-full sm:w-auto mb-2 sm:mb-0">Mark Cleared</button>
                                <button onClick={() => markBounced(c)} className="px-3 py-2 bg-red-600 text-white rounded-md text-sm w-full sm:w-auto mb-2 sm:mb-0">Mark Bounced</button>
                                <button onClick={() => deleteCheque(c.id)} className="px-3 py-2 bg-gray-700 text-white rounded-md text-sm w-full sm:w-auto">Delete</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile stacked cards view */}
                <div className="sm:hidden space-y-3">
                  {cheques.map(c => (
                    <div key={c.id} className={`p-3 rounded border ${isChequeDueToday(c) ? 'bg-yellow-900/10 border-yellow-500' : isChequeUpcoming(c) ? 'bg-red-900/10 border-red-700' : 'bg-slate-800 border-slate-700'}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-slate-100">{c.payer_name || '-'}</div>
                          <div className="text-sm text-slate-200">{formatCurrency(c.amount || 0)} • {c.bank || '-'}</div>
                        </div>
                        <div className="text-sm text-slate-200">{(c.cheque_date || c.created_at || '').slice ? (c.cheque_date || c.created_at).slice(0,10) : String(c.cheque_date || c.created_at)} {isChequeDueToday(c) && <span className="ml-2 inline-block px-2 py-0.5 text-xs font-medium text-yellow-800 bg-yellow-200 rounded">Due Today</span>}</div>
                      </div>
                      <div className="mt-2 flex items-center justify-between space-x-2">
                        <div className="flex-1">
                          <label className="text-xs text-slate-300">Deposit Date</label>
                          <input type="date" defaultValue={c.deposit_date ? (c.deposit_date.slice ? c.deposit_date.slice(0,10) : c.deposit_date) : ''} onChange={(e) => setDepositDate(c.id, e.target.value)} className="mt-1 w-full px-2 py-1 rounded bg-slate-900 text-slate-100 border border-slate-700" />
                        </div>
                      </div>
                      <div className="mt-3 flex flex-col space-y-2">
                        <div className="text-sm text-slate-200">Status: {c.status || 'Received'}</div>
                        <div className="flex gap-2">
                          {c.status !== 'Cleared' && (
                            <>
                              <button onClick={() => markCleared(c.id)} className="flex-1 px-3 py-2 bg-green-600 text-white rounded-md text-sm">Mark Cleared</button>
                              <button onClick={() => markBounced(c)} className="flex-1 px-3 py-2 bg-red-600 text-white rounded-md text-sm">Mark Bounced</button>
                            </>
                          )}
                          <button onClick={() => deleteCheque(c.id)} className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-md text-sm">Delete</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pending cheque collections from Collections table */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold mb-2">Pending Cheque Collections</h2>
        {pendingCollections.length === 0 ? (
          <p className="text-sm text-slate-500">No pending cheque collections.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                <tr>
                  <th className="px-3 py-2">Collection ID</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingCollections.map((col: any) => (
                  <tr key={col.id} className="border-b">
                    <td className="px-3 py-2 font-medium">{col.id}</td>
                    <td className="px-3 py-2">{(customers || []).find((c:any) => c.id === col.customer_id)?.name || col.customer_id || '-'}</td>
                    <td className="px-3 py-2">{formatCurrency(col.amount || 0)}</td>
                    <td className="px-3 py-2">{(col.collected_at || col.created_at || '').slice ? (col.collected_at || col.created_at).slice(0,10) : String(col.created_at || '')}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => recognizeCollection(col)} className="px-2 py-1 bg-green-600 text-white rounded text-xs">Recognize</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChequeManagement;
