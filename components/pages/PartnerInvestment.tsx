import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { useData } from '../../contexts/DataContext';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

type InvestmentEntry = {
  id: string;
  date: string;
  partnerInvestment: number;
  loanAmount: number;
  issuedChequeAmount: number;
  creditedAmount: number;
  inventoryValue: number;
  expenses: number;
  bankBalance: number;
  note?: string;
  createdBy?: string | null;
};

const STORAGE_KEY = 'partner_investments_v1';

const PartnerInvestment: React.FC = () => {
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [partnerInvestment, setPartnerInvestment] = useState<number>(0);
  const [loanAmount, setLoanAmount] = useState<number>(0);
  const [issuedChequeAmount, setIssuedChequeAmount] = useState<number>(0);
  const [creditedAmount, setCreditedAmount] = useState<number>(0);
  const [inventoryValue, setInventoryValue] = useState<number>(0);
  const [expenses, setExpenses] = useState<number>(0);
  const [bankBalance, setBankBalance] = useState<number>(0);
  const [note, setNote] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [pendingCreditTotal, setPendingCreditTotal] = useState<number>(0);
  const [pendingChequeTotal, setPendingChequeTotal] = useState<number>(0);
  const [completedCreditTotal, setCompletedCreditTotal] = useState<number>(0);
  const [completedChequeTotal, setCompletedChequeTotal] = useState<number>(0);

  const [entries, setEntries] = useState<InvestmentEntry[]>([]);
  const [lastSaved, setLastSaved] = useState<InvestmentEntry | null>(null);
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const [snapshotEntry, setSnapshotEntry] = useState<InvestmentEntry | null>(null);
  const [assetsTotal, setAssetsTotal] = useState<number>(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeBox, setActiveBox] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setEntries(parsed);
        if (Array.isArray(parsed) && parsed.length) setLastSaved(parsed[0]);
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {}
    try {
      const sid = localStorage.getItem('partner_snapshot_v1');
      if (sid) setSnapshotId(sid);
    } catch (e) {}
  }, [entries]);

  const totalInflows = useMemo(() => {
    // Inflows: Capital + Loan
    return (partnerInvestment || 0) + (loanAmount || 0);
  }, [partnerInvestment, loanAmount]);

  const totalOutflows = useMemo(() => {
    // Outflows: bankBalance + inventoryValue + receivedCheques (completedChequeTotal) + credit (creditedAmount) + assetsTotal - issuedCheques
    return (bankBalance || 0) + (inventoryValue || 0) + (completedChequeTotal || 0) + (creditedAmount || 0) + (assetsTotal || 0) - (issuedChequeAmount || 0);
  }, [bankBalance, inventoryValue, completedChequeTotal, creditedAmount, assetsTotal, issuedChequeAmount]);

  const netPosition = useMemo(() => totalInflows - totalOutflows, [totalInflows, totalOutflows]);

  const handleAdd = () => {
    const newEntry: InvestmentEntry = {
      id: String(Date.now()),
      date,
      partnerInvestment: Number(partnerInvestment) || 0,
      loanAmount: Number(loanAmount) || 0,
      issuedChequeAmount: Number(issuedChequeAmount) || 0,
      creditedAmount: Number(creditedAmount) || 0,
      inventoryValue: Number(inventoryValue) || 0,
      expenses: Number(expenses) || 0,
      bankBalance: Number(bankBalance) || 0,
      note: note || ''
    };

    setEntries(prev => [newEntry, ...prev]);
    setLastSaved(newEntry);

    // Keep form values so user can adjust, but reset note and partnerInvestment if desired
    setNote('');
  };

  const handleSaveBoth = async () => {
    const newEntry: InvestmentEntry = {
      id: String(Date.now()),
      date,
      partnerInvestment: Number(partnerInvestment) || 0,
      loanAmount: Number(loanAmount) || 0,
      issuedChequeAmount: Number(issuedChequeAmount) || 0,
      creditedAmount: Number(creditedAmount) || 0,
      inventoryValue: Number(inventoryValue) || 0,
      expenses: Number(expenses) || 0,
      bankBalance: Number(bankBalance) || 0,
      note: note || ''
    };

    // Add locally first for immediate UX
    setEntries(prev => [newEntry, ...prev]);
    setLastSaved(newEntry);
    setNote('');

    // Then persist to DB
    try {
      await saveEntryToDB(newEntry);
    } catch (e) {
      console.error('Failed to save entry to DB from combined Save', e);
    }
  };

  const { currentUser } = useAuth();

  const saveEntryToDB = async (entry: InvestmentEntry) => {
    try {
      const isUUID = (v: any) => typeof v === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(v);
      const createdBy = isUUID(currentUser?.id) ? currentUser?.id : null;

      const payload = {
        entry_date: entry.date,
        partner_investment: entry.partnerInvestment,
        loan_amount: entry.loanAmount,
        issued_cheque_amount: entry.issuedChequeAmount,
        credited_amount: entry.creditedAmount,
        inventory_value: entry.inventoryValue,
        expenses: entry.expenses,
        bank_balance: entry.bankBalance,
        note: entry.note || null,
        created_by: createdBy,
      };
      const { data, error } = await supabase.from('partner_investments').insert([payload]).select();
      if (error) {
        console.error('Failed to save partner investment to DB', error);
        alert('Failed to save to database. See console for details.');
        return null;
      }
      // After successful insert, reload entries from DB to ensure canonical view
      if (data && Array.isArray(data) && data[0]) {
        // Reload entries and populate form with the saved entry so values persist after save
        await loadEntriesFromDB();
        try {
          const saved = data[0];
          setDate(saved.entry_date ? (typeof saved.entry_date === 'string' ? saved.entry_date : new Date(saved.entry_date).toISOString().slice(0,10)) : new Date().toISOString().slice(0,10));
          setPartnerInvestment(Number(saved.partner_investment) || 0);
          setLoanAmount(Number(saved.loan_amount) || 0);
          setIssuedChequeAmount(Number(saved.issued_cheque_amount) || 0);
          setCreditedAmount(Number(saved.credited_amount) || 0);
          setInventoryValue(Number(saved.inventory_value) || 0);
          setExpenses(Number(saved.expenses) || 0);
          setBankBalance(Number(saved.bank_balance) || 0);
          setNote(saved.note || '');
        } catch (e) {
          // ignore populate errors
        }
        // setLastSaved will be updated by loadEntriesFromDB when it loads entries
      }
      alert('Saved entry to database successfully');
      return data && data[0];
    } catch (e) {
      console.error('Exception saving partner investment', e);
      alert('Failed to save to database. See console for details.');
      return null;
    }
  };

  // Load saved partner_investments from DB and populate entries
  const loadEntriesFromDB = async () => {
    try {
      const { data, error } = await supabase
        .from('partner_investments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) {
        console.warn('Failed to load partner_investments from DB', error);
        return;
      }
      if (!data) return;
      const mapped: InvestmentEntry[] = data.map((r: any) => ({
        id: r.id,
        date: r.entry_date ? (typeof r.entry_date === 'string' ? r.entry_date : new Date(r.entry_date).toISOString().slice(0,10)) : new Date().toISOString().slice(0,10),
        partnerInvestment: Number(r.partner_investment) || 0,
        loanAmount: Number(r.loan_amount) || 0,
        issuedChequeAmount: Number(r.issued_cheque_amount) || 0,
        creditedAmount: Number(r.credited_amount) || 0,
        inventoryValue: Number(r.inventory_value) || 0,
        expenses: Number(r.expenses) || 0,
        bankBalance: Number(r.bank_balance) || 0,
        note: r.note || '',
        createdBy: r.created_by || null
      }));
      setEntries(mapped);
      if (mapped && mapped.length) {
        setLastSaved(mapped[0]);
        // populate the form inputs with the most recent saved entry so values persist across refresh
        try {
          const latest = mapped[0];
          setDate(latest.date);
          setPartnerInvestment(latest.partnerInvestment || 0);
          setLoanAmount(latest.loanAmount || 0);
          setIssuedChequeAmount(latest.issuedChequeAmount || 0);
          setCreditedAmount(latest.creditedAmount || 0);
          setInventoryValue(latest.inventoryValue || 0);
          setExpenses(latest.expenses || 0);
          setBankBalance(latest.bankBalance || 0);
          setNote(latest.note || '');
        } catch (e) {}
      }
      // Restore snapshot entry if present in local storage
      try {
        const sid = localStorage.getItem('partner_snapshot_v1');
        if (sid) {
          setSnapshotId(sid);
          const found = mapped.find(m => String(m.id) === String(sid));
          if (found) setSnapshotEntry(found);
        }
      } catch (e) {}
      // Also mirror to localStorage for offline convenience
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(mapped)); } catch(e){}
    } catch (err) {
      console.error('Error loading partner investments', err);
    }
  };

  // Capital+Loan dashboard: compute recent value and deltas between consecutive saved entries
  const capitalLoanChanges = useMemo(() => {
    if (!entries || entries.length === 0) return [] as Array<any>;
    // entries are ordered by created_at desc when loaded from DB
    const list: Array<{ date: string; value: number; delta: number; createdBy?: string | null }> = [];
    for (let i = 0; i < entries.length; i++) {
      const curr = entries[i];
      const next = entries[i + 1];
      const currVal = (curr.partnerInvestment || 0) + (curr.loanAmount || 0);
      const nextVal = next ? ((next.partnerInvestment || 0) + (next.loanAmount || 0)) : 0;
      const delta = currVal - nextVal;
      list.push({ date: curr.date, value: currVal, delta, createdBy: curr.createdBy || null });
      // limit to recent 12 items
      if (list.length >= 12) break;
    }
    return list;
  }, [entries]);

  const saveSnapshotToDB = async (entry: InvestmentEntry) => {
    const saved = await saveEntryToDB(entry);
    if (saved && saved.id) {
      try {
        localStorage.setItem('partner_snapshot_v1', String(saved.id));
      } catch (e) {}
      setSnapshotId(String(saved.id));
      // Refresh entries will load and set snapshotEntry
      await loadEntriesFromDB();
      alert('Saved snapshot and marked as active snapshot');
    }
  };

  const setLocalSnapshot = (entry: InvestmentEntry) => {
    try {
      localStorage.setItem('partner_snapshot_v1', String(entry.id));
    } catch (e) {}
    setSnapshotId(String(entry.id));
    setSnapshotEntry(entry);
    alert('Marked current entry as snapshot (local)');
  };

  // Wire to global data context for auto-fill
  const { orders, products, upcomingCheques, driverSales, refetchData } = useData();

  const fetchExpensesSum = async () => {
    try {
      const { data, error } = await supabase.from('expenses').select('amount');
      if (error) return 0;
      if (!data) return 0;
      return data.reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
    } catch (e) {
      return 0;
    }
  };

  const recomputeAutoFields = React.useCallback(async () => {
    // Issued cheques: sum of upcoming cheques amounts (defensive field names)
    try {
      // Prefer issued cheques (company payments) from issued_cheques table
      let chequeSum = 0;
      try {
        const { data: issuedData, error: issuedError } = await supabase
          .from('issued_cheques')
          .select('amount, status, cash_date')
          .neq('status', 'Cashed')
          .neq('status', 'Cancelled');
        if (!issuedError && Array.isArray(issuedData)) {
          chequeSum = issuedData.reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
        } else {
          // Fallback: sum upcoming cheques from existing context (incoming cheques)
          chequeSum = (upcomingCheques || []).reduce((s, c: any) => {
            const amt = Number(c.amount ?? c.cheque_amount ?? c.chequeAmount ?? c.deposit_amount ?? c.value ?? 0) || 0;
            return s + amt;
          }, 0);
        }
      } catch (e) {
        console.warn('Failed to fetch issued_cheques, falling back to upcomingCheques', e);
        chequeSum = (upcomingCheques || []).reduce((s, c: any) => {
          const amt = Number(c.amount ?? c.cheque_amount ?? c.chequeAmount ?? c.deposit_amount ?? c.value ?? 0) || 0;
          return s + amt;
        }, 0);
      }
      setIssuedChequeAmount(chequeSum);

      // Credited amount: sum of paid amounts from orders + driver sales
      const ordersPaid = (orders || []).reduce((s, o: any) => s + (Number(o.amountPaid ?? o.amountpaid ?? 0) || 0), 0);
      const driverPaid = (driverSales || []).reduce((s, d: any) => s + (Number(d.amountPaid ?? d.amount_paid ?? 0) || 0), 0);

      // Include completed collections that are not tied to an order (ad-hoc cash receipts)
      let extraCollections = 0;
      // We'll also track pending credit and pending cheques so UI can surface them
      let pendingCredit = 0;
      let finalPendingCheque = 0;
      try {
        const { data: collData, error: collError } = await supabase.from('collections').select('amount,order_id,collection_type,status');
        if (!collError && Array.isArray(collData)) {
          extraCollections = collData.reduce((s: number, c: any) => {
            const tiedToOrder = !!(c.order_id && String(c.order_id).trim() !== '');
            if (!tiedToOrder && (c.status || '').toLowerCase() === 'complete') return s + (Number(c.amount) || 0);
            return s;
          }, 0);

          // Compute pending/completed totals split by collection_type
          pendingCredit = collData.filter((c: any) => (c.collection_type === 'credit') && ((c.status||'').toLowerCase() === 'pending')).reduce((s: number, c: any) => s + (Number(c.amount) || 0), 0);
          const pendingChequeFromCollections = collData.filter((c: any) => (c.collection_type === 'cheque') && ((c.status||'').toLowerCase() === 'pending')).reduce((s: number, c: any) => s + (Number(c.amount) || 0), 0);
          const completedCredit = collData.filter((c: any) => (c.collection_type === 'credit') && ((c.status||'').toLowerCase() === 'complete')).reduce((s: number, c: any) => s + (Number(c.amount) || 0), 0);
          const completedCheque = collData.filter((c: any) => (c.collection_type === 'cheque') && ((c.status||'').toLowerCase() === 'complete')).reduce((s: number, c: any) => s + (Number(c.amount) || 0), 0);

          // Try to fetch pending cheques from `cheques` table (Cheque Management). Prefer this value if available.
          let pendingChequeFromCheques = 0;
          try {
            const { data: chequesData, error: chequesError } = await supabase.from('cheques').select('amount,status,deposit_date');
            if (!chequesError && Array.isArray(chequesData)) {
              pendingChequeFromCheques = chequesData.reduce((s: number, q: any) => {
                const st = (q.status || '').toString().toLowerCase();
                if (st === 'cleared' || st === 'bounced' || st === 'cancelled' || st === 'cashed') return s;
                return s + (Number(q.amount) || 0);
              }, 0);
            }
          } catch (e) {
            console.warn('Failed to fetch cheques table for pending totals', e);
          }

          finalPendingCheque = pendingChequeFromCheques > 0 ? pendingChequeFromCheques : pendingChequeFromCollections;

          setPendingCreditTotal(pendingCredit);
          setPendingChequeTotal(finalPendingCheque);
          setCompletedCreditTotal(completedCredit);
          setCompletedChequeTotal(completedCheque);
        }
      } catch (e) {
        console.warn('Failed to fetch extra collections for credited amount', e);
      }

      // Show creditedAmount including pending credit so UI matches 'Pending' indicator seen in screenshots
      setCreditedAmount((ordersPaid + driverPaid + extraCollections) + (pendingCredit || 0));

      // Inventory value: sum(stock * costPrice (fallback marginPrice))
      const inv = (products || []).reduce((s: number, p: any) => {
        const stock = Number(p.stock || 0) || 0;
        const cost = Number(p.costPrice ?? p.costprice ?? p.marginPrice ?? p.marginprice ?? 0) || 0;
        return s + stock * cost;
      }, 0);
      setInventoryValue(inv);

      // Load assets total from `assets` table (sum of asset.value)
      try {
        const { data: assetsData, error: assetsError } = await supabase.from('assets').select('value');
        if (!assetsError && Array.isArray(assetsData)) {
          const totalAssets = assetsData.reduce((s: number, a: any) => s + (Number(a.value) || 0), 0);
          setAssetsTotal(totalAssets);
        }
      } catch (e) {
        console.warn('Failed to fetch assets total', e);
      }

      // Expenses: fetch from expenses table if present
      const expSum = await fetchExpensesSum();
      setExpenses(expSum);
    } catch (e) {
      console.error('Failed to recompute auto fields', e);
    }
  }, [upcomingCheques, orders, products, driverSales]);

  useEffect(() => {
    // Recompute whenever underlying data changes
    recomputeAutoFields();
    // Load saved entries from DB when component mounts
    loadEntriesFromDB().catch(e => console.warn('Failed to load partner investments on mount', e));
  }, [recomputeAutoFields]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetchData();
      await recomputeAutoFields();
      // Refresh saved entries view from DB as well
      await loadEntriesFromDB();
    } catch (e) {
      console.error('Refresh failed', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Supabase realtime subscription to partner_investments so UI updates automatically
  React.useEffect(() => {
    let channel: any = null;
    try {
      channel = supabase.channel('public:partner_investments')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'partner_investments' }, payload => {
          // When an insert/update/delete occurs, reload the list
          loadEntriesFromDB().catch(err => console.warn('Failed to reload after realtime event', err));
        })
        .subscribe((status: any) => {
          // status can be SUBSCRIBED etc.
        });
    } catch (e) {
      console.warn('Realtime subscription not available or failed', e);
    }

    return () => {
      try {
        if (channel && channel.unsubscribe) channel.unsubscribe();
      } catch (e) { /* ignore */ }
    };
  }, []);

  const handleClearAll = () => {
    if (confirm('Clear all saved partner investment entries?')) {
      setEntries([]);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (!confirm('Delete this entry? This action cannot be undone.')) return;
    try {
      const { error } = await supabase.from('partner_investments').delete().eq('id', id);
      if (error) {
        console.error('Failed to delete partner investment', error);
        alert('Failed to delete entry: ' + (error.message || JSON.stringify(error)));
        return;
      }
      // Remove from local UI state
      setEntries(prev => {
        const next = prev.filter(p => String(p.id) !== String(id));
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (e) {}
        return next;
      });

      // If the deleted entry was the active snapshot, clear it
      try {
        if (snapshotId && String(snapshotId) === String(id)) {
          localStorage.removeItem('partner_snapshot_v1');
          setSnapshotId(null);
          setSnapshotEntry(null);
        }
      } catch (e) {}

      // Update lastSaved if needed
      setLastSaved(prev => (prev && String(prev.id) === String(id) ? null : prev));

      alert('Deleted entry');
    } catch (e) {
      console.error('Exception deleting partner investment', e);
      alert('Failed to delete entry (exception): ' + (e && (e.message || JSON.stringify(e))));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      return [...prev, id];
    });
  };

  const handleDeleteSelected = async () => {
    if (!selectedIds || selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} selected entr${selectedIds.length>1?'ies':'y'}? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from('partner_investments').delete().in('id', selectedIds);
      if (error) {
        console.error('Failed to delete selected entries', error);
        alert('Failed to delete selected entries: ' + (error.message || JSON.stringify(error)));
        return;
      }
      // Remove deleted from local state
      setEntries(prev => {
        const next = prev.filter(p => !selectedIds.includes(String(p.id)));
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (e) {}
        return next;
      });

      // Clear snapshot if it was deleted
      try {
        if (snapshotId && selectedIds.includes(String(snapshotId))) {
          localStorage.removeItem('partner_snapshot_v1');
          setSnapshotId(null);
          setSnapshotEntry(null);
        }
      } catch (e) {}

      // Clear selection and update lastSaved
      setSelectedIds([]);
      setLastSaved(prev => {
        if (!prev) return null;
        return selectedIds.includes(String(prev.id)) ? null : prev;
      });

      alert('Deleted selected entries');
    } catch (e) {
      console.error('Exception deleting selected entries', e);
      alert('Failed to delete selected entries (exception): ' + (e && (e.message || JSON.stringify(e))));
    }
  };

  const format = (v: number) => `LKR ${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Partner Investment & Cash Position</h1>
          <p className="text-sm text-slate-600 mt-1">Add partner investment, loans, cheques, inventory, expenses and see net position (profit / loss indicator).</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleClearAll} className="px-3 py-1 bg-red-600 text-white rounded">Clear All</button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add / Calculate</CardTitle>
        </CardHeader>
        <CardContent>
          {lastSaved && (
            <div className="mb-3 p-3 border rounded bg-slate-50">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Last saved: {lastSaved.date} — {lastSaved.note || 'Entry'}</div>
                  <div className="text-xs text-slate-600">Capital: {format(lastSaved.partnerInvestment)} • Loan: {format(lastSaved.loanAmount)} • Bank: {format(lastSaved.bankBalance)}</div>
                </div>
                <div>
                  <button onClick={() => {
                    setDate(lastSaved.date);
                    setPartnerInvestment(lastSaved.partnerInvestment);
                    setLoanAmount(lastSaved.loanAmount);
                    setIssuedChequeAmount(lastSaved.issuedChequeAmount);
                    setCreditedAmount(lastSaved.creditedAmount);
                    setInventoryValue(lastSaved.inventoryValue);
                    setExpenses(lastSaved.expenses);
                    setBankBalance(lastSaved.bankBalance);
                    setNote(lastSaved.note || '');
                  }} className="px-3 py-1 bg-indigo-600 text-white rounded text-sm">Load Last</button>
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">Date</label>
              <input type="date" className="w-full px-2 py-1 border rounded" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Capital</label>
              <input type="number" min="0" step="0.01" className="w-full px-2 py-1 border rounded" value={partnerInvestment} onChange={e => setPartnerInvestment(Number(e.target.value))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Loan Amount (business loan)</label>
              <input type="number" min="0" step="0.01" className="w-full px-2 py-1 border rounded" value={loanAmount} onChange={e => setLoanAmount(Number(e.target.value))} />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Issued Cheque Amount (payments)</label>
              <input type="number" min="0" step="0.01" className="w-full px-2 py-1 border rounded bg-slate-50" value={issuedChequeAmount} readOnly />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Amount Credited (sales/receipts)</label>
              <input type="number" min="0" step="0.01" className="w-full px-2 py-1 border rounded bg-slate-50" value={creditedAmount} readOnly />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Inventory Value (current)</label>
              <input type="number" min="0" step="0.01" className="w-full px-2 py-1 border rounded bg-slate-50" value={inventoryValue} readOnly />
              <div className="text-xs text-slate-500 mt-1">Pending: Credit {format(pendingCreditTotal)} • Cheque {format(pendingChequeTotal)}</div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Expenses</label>
              <input type="number" min="0" step="0.01" className="w-full px-2 py-1 border rounded bg-slate-50" value={expenses} readOnly />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Pending: Credit</label>
              <div onClick={() => setActiveBox(activeBox === 'pendingCredit' ? null : 'pendingCredit')} role="button" tabIndex={0} className={`w-full px-2 py-2 border rounded bg-white cursor-pointer hover:bg-slate-50 ${activeBox === 'pendingCredit' ? 'ring-2 ring-indigo-300' : ''}`}>
                <div className="font-bold">{format(pendingCreditTotal)}</div>
                <div className="text-xs text-red-600">Source: Collections</div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Pending: Cheque</label>
              <div onClick={() => setActiveBox(activeBox === 'pendingCheque' ? null : 'pendingCheque')} role="button" tabIndex={0} className={`w-full px-2 py-2 border rounded bg-white cursor-pointer hover:bg-slate-50 ${activeBox === 'pendingCheque' ? 'ring-2 ring-indigo-300' : ''}`}>
                <div className="font-bold">{format(pendingChequeTotal)}</div>
                <div className="text-xs text-red-600">Source: Collections</div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Assets Total</label>
              <div onClick={() => setActiveBox(activeBox === 'assetsTotal' ? null : 'assetsTotal')} role="button" tabIndex={0} className={`w-full px-2 py-2 border rounded bg-white cursor-pointer hover:bg-slate-50 ${activeBox === 'assetsTotal' ? 'ring-2 ring-indigo-300' : ''}`}>
                <div className="font-bold">{format(assetsTotal)}</div>
                <div className="text-xs text-red-600">Source: Assets</div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Bank Balance</label>
              <input type="number" min="0" step="0.01" className="w-full px-2 py-1 border rounded" value={bankBalance} onChange={e => setBankBalance(Number(e.target.value))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Note (optional)</label>
              <input className="w-full px-2 py-1 border rounded" value={note} onChange={e => setNote(e.target.value)} />
            </div>
          </div>

            <div className="mt-4 flex items-center gap-3">
            <button onClick={handleSaveBoth} className="px-4 py-2 bg-blue-600 text-white rounded">Save</button>
            <button onClick={() => saveSnapshotToDB({
              id: String(Date.now()),
              date,
              partnerInvestment,
              loanAmount,
              issuedChequeAmount,
              creditedAmount,
              inventoryValue,
              expenses,
              bankBalance,
              note
            })} className="px-4 py-2 bg-yellow-600 text-white rounded">Save Snapshot</button>
            <button onClick={() => setLocalSnapshot({
              id: String(Date.now()),
              date,
              partnerInvestment,
              loanAmount,
              issuedChequeAmount,
              creditedAmount,
              inventoryValue,
              expenses,
              bankBalance,
              note
            })} className="px-4 py-2 bg-amber-500 text-white rounded">Set Snapshot (Local)</button>
            <button onClick={handleRefresh} disabled={isRefreshing} className="px-3 py-2 bg-gray-200 text-slate-700 rounded">{isRefreshing ? 'Refreshing…' : 'Refresh Data'}</button>
            <div className="text-sm text-slate-600">Totals (live):</div>
            <div className="font-mono">Inflows: {format(totalInflows)}</div>
            <div className="font-mono">Outflows: {format(totalOutflows)}</div>
            <div className={`font-mono font-bold ${netPosition >= 0 ? 'text-green-600' : 'text-red-600'}`}>Net: {format(netPosition)}</div>
            <div className="ml-4 text-sm text-slate-600">
              <div>Collections (pending): <span className="font-mono">Credit: {format(pendingCreditTotal)}</span> <span className="font-mono ml-2">Cheque: {format(pendingChequeTotal)}</span></div>
              <div className="text-xs text-slate-500">Completed: Credit {format(completedCreditTotal)} • Cheque {format(completedChequeTotal)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active Snapshot & Reconciliation</CardTitle>
        </CardHeader>
        <CardContent>
            {/* Capital+Loan Dashboard (recent changes) */}
            <div className="mb-4">
              <div className="text-sm font-medium mb-2">Capital + Loan — Recent Changes</div>
              {capitalLoanChanges.length === 0 ? (
                <div className="text-slate-500">No saved entries to show changes.</div>
              ) : (
                <div className="space-y-2">
                  {capitalLoanChanges.map((c, idx) => (
                    <div key={idx} className="p-2 border rounded flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">{c.date}</div>
                        <div className="text-xs text-slate-600">Value: {format(c.value)}</div>
                      </div>
                      <div className="text-right">
                        <div className={`font-bold ${c.delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>{c.delta >= 0 ? '+' : ''}{format(c.delta)}</div>
                        <div className={`text-xs ${c.delta < 0 ? 'text-red-600' : 'text-slate-600'}`}>By: {c.createdBy || 'unknown'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {!snapshotEntry ? (
            <div className="text-slate-500">No active snapshot. Use "Save Snapshot" or "Set Snapshot (Local)" to mark a snapshot.</div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">Snapshot: {snapshotEntry.date} — {snapshotEntry.note || 'Snapshot'}</div>
                  <div className="text-xs text-slate-500">Capital: {format(snapshotEntry.partnerInvestment)} | Loan: {format(snapshotEntry.loanAmount)} | Bank: {format(snapshotEntry.bankBalance)}</div>
                </div>
                <div className="text-right">
                  <button onClick={() => { localStorage.removeItem('partner_snapshot_v1'); setSnapshotId(null); setSnapshotEntry(null); }} className="px-3 py-1 bg-red-600 text-white rounded text-sm">Clear Snapshot</button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-2 border rounded">
                  <div className="text-xs text-slate-600">Snapshot Capital + Loan</div>
                  <div className="font-bold">{format(snapshotEntry.partnerInvestment + snapshotEntry.loanAmount)}</div>
                </div>
                <div className="p-2 border rounded">
                  <div className="text-xs text-slate-600">Current Capital + Loan</div>
                  <div className="font-bold">{format(partnerInvestment + loanAmount)}</div>
                </div>
                <div className="p-2 border rounded">
                  <div className="text-xs text-slate-600">Decrease (Snapshot - Current)</div>
                  <div className="font-bold text-red-600">{format((snapshotEntry.partnerInvestment + snapshotEntry.loanAmount) - (partnerInvestment + loanAmount))}</div>
                </div>
              </div>

              <div className="mt-3 p-2 border rounded bg-slate-50">
                <div className="text-sm font-medium">Reconciliation Check (current)</div>
                <div className="text-xs text-slate-600">Formula: capital + loan = bankBalance + Inventory Value (current) + receivedCheques + credit + asset - IssuedCheques</div>
                <div className="mt-2">
                  <div className="grid grid-cols-1 gap-2">
                    <div className="p-2 border rounded">
                      <div className="text-xs text-slate-600">LHS (capital + loan)</div>
                      <div className="font-bold">{format(partnerInvestment + loanAmount)}</div>
                    </div>

                    <div className="p-2 border rounded">
                      <div className="text-xs text-slate-600">RHS breakdown</div>
                      <div className="mt-2 space-y-1">
                        <div className="text-xs">Bank Balance: <span className="font-mono">{format(bankBalance)}</span></div>
                        <div className="text-xs">Inventory Value (current): <span className="font-mono">{format(inventoryValue)}</span></div>
                        <div className="text-xs">Received Cheques (completed): <span className="font-mono">{format(completedChequeTotal)}</span></div>
                        <div className="text-xs">Credit (sales/receipts): <span className="font-mono">{format(creditedAmount)}</span></div>
                        <div className="text-xs">Issued Cheques (outgoing): <span className="font-mono">{format(issuedChequeAmount)}</span></div>
                        <div className="text-xs">Assets (added): <span className="font-mono">{format(assetsTotal)}</span></div>
                      </div>
                      <div className="mt-3 font-bold">RHS total: {format((bankBalance || 0) + (inventoryValue || 0) + (assetsTotal || 0) + (completedChequeTotal || 0) + (creditedAmount || 0) - (issuedChequeAmount || 0))}</div>
                    </div>
                  </div>

                  <div className="mt-2">
                    <div className={`font-semibold ${Math.abs((partnerInvestment+loanAmount) - ((bankBalance || 0) + (inventoryValue || 0) + (assetsTotal || 0) + (completedChequeTotal || 0) + (creditedAmount || 0) - (issuedChequeAmount || 0))) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                      Difference: {format((partnerInvestment+loanAmount) - ((bankBalance || 0) + (inventoryValue || 0) + (assetsTotal || 0) + (completedChequeTotal || 0) + (creditedAmount || 0) - (issuedChequeAmount || 0)))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saved Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <div className="text-slate-500">No saved entries</div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-600">Select entries to delete</div>
                <div className="flex items-center gap-2">
                  <button onClick={handleDeleteSelected} disabled={selectedIds.length===0} className={`px-3 py-1 rounded text-sm ${selectedIds.length===0 ? 'bg-gray-200 text-slate-500' : 'bg-red-600 text-white'}`}>Delete Selected ({selectedIds.length})</button>
                  <button onClick={() => setSelectedIds([])} className="px-3 py-1 bg-gray-200 text-slate-700 rounded text-sm">Clear Selection</button>
                </div>
              </div>
              {entries.map(e => (
                <div key={e.id} className="border rounded p-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-start gap-3">
                      <input type="checkbox" checked={selectedIds.includes(String(e.id))} onChange={() => handleToggleSelect(String(e.id))} className="mt-1" />
                      <div>
                        <div className="font-medium">{e.date} — {e.note || 'Entry'}</div>
                        <div className="text-xs text-slate-500">Capital: {format(e.partnerInvestment)} | Loan: {format(e.loanAmount)} | Cheque: {format(e.issuedChequeAmount)}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className={`font-mono font-bold ${ ( (e.partnerInvestment+e.loanAmount+e.creditedAmount+e.bankBalance) - (e.issuedChequeAmount+e.expenses+e.inventoryValue) ) >= 0 ? 'text-green-600' : 'text-red-600' }`}>Net {format((e.partnerInvestment+e.loanAmount+e.creditedAmount+e.bankBalance) - (e.issuedChequeAmount+e.expenses+e.inventoryValue))}</div>
                      <div className="flex flex-col space-y-1">
                        <button onClick={() => {
                          // Load this entry into the form for quick editing / review
                          setDate(e.date);
                          setPartnerInvestment(e.partnerInvestment);
                          setLoanAmount(e.loanAmount);
                          setIssuedChequeAmount(e.issuedChequeAmount);
                          setCreditedAmount(e.creditedAmount);
                          setInventoryValue(e.inventoryValue);
                          setExpenses(e.expenses);
                          setBankBalance(e.bankBalance);
                          setNote(e.note || '');
                        }} className="px-2 py-1 bg-indigo-600 text-white rounded text-xs">Load</button>
                        <button onClick={() => handleDeleteEntry(e.id)} className="px-2 py-1 bg-red-600 text-white rounded text-xs">Delete</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PartnerInvestment;
