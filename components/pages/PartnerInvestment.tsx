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
  }, [entries]);

  const totalInflows = useMemo(() => {
    // Inflows: partner investment, loan, creditedAmount, bank balance
    return partnerInvestment + loanAmount + creditedAmount + bankBalance;
  }, [partnerInvestment, loanAmount, creditedAmount, bankBalance]);

  const totalOutflows = useMemo(() => {
    // Outflows: issued cheques (payments), expenses, inventory (cash tied up)
    return issuedChequeAmount + expenses + inventoryValue;
  }, [issuedChequeAmount, expenses, inventoryValue]);

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

  const { currentUser } = useAuth();

  const saveEntryToDB = async (entry: InvestmentEntry) => {
    try {
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
        created_by: currentUser?.id || null,
      };
      const { data, error } = await supabase.from('partner_investments').insert([payload]).select();
      if (error) {
        console.error('Failed to save partner investment to DB', error);
        alert('Failed to save to database. See console for details.');
        return null;
      }
      // After successful insert, reload entries from DB to ensure canonical view
      if (data && Array.isArray(data) && data[0]) {
        await loadEntriesFromDB();
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
        note: r.note || ''
      }));
      setEntries(mapped);
      if (mapped && mapped.length) setLastSaved(mapped[0]);
      // Also mirror to localStorage for offline convenience
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(mapped)); } catch(e){}
    } catch (err) {
      console.error('Error loading partner investments', err);
    }
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
      try {
        const { data: collData, error: collError } = await supabase.from('collections').select('amount,order_id,collection_type,status');
        if (!collError && Array.isArray(collData)) {
          extraCollections = collData.reduce((s: number, c: any) => {
            const tiedToOrder = !!(c.order_id && String(c.order_id).trim() !== '');
            if (!tiedToOrder && (c.status || '').toLowerCase() === 'complete') return s + (Number(c.amount) || 0);
            return s;
          }, 0);

          // Compute pending/completed totals split by collection_type
          const pendingCredit = collData.filter((c: any) => (c.collection_type === 'credit') && ((c.status||'').toLowerCase() === 'pending')).reduce((s: number, c: any) => s + (Number(c.amount) || 0), 0);
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

          const finalPendingCheque = pendingChequeFromCheques > 0 ? pendingChequeFromCheques : pendingChequeFromCollections;

          setPendingCreditTotal(pendingCredit);
          setPendingChequeTotal(finalPendingCheque);
          setCompletedCreditTotal(completedCredit);
          setCompletedChequeTotal(completedCheque);
        }
      } catch (e) {
        console.warn('Failed to fetch extra collections for credited amount', e);
      }

      setCreditedAmount(ordersPaid + driverPaid + extraCollections);

      // Inventory value: sum(stock * costPrice (fallback marginPrice))
      const inv = (products || []).reduce((s: number, p: any) => {
        const stock = Number(p.stock || 0) || 0;
        const cost = Number(p.costPrice ?? p.costprice ?? p.marginPrice ?? p.marginprice ?? 0) || 0;
        return s + stock * cost;
      }, 0);
      setInventoryValue(inv);

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
                  <div className="text-xs text-slate-600">Partner: {format(lastSaved.partnerInvestment)} • Loan: {format(lastSaved.loanAmount)} • Bank: {format(lastSaved.bankBalance)}</div>
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
              <label className="block text-xs font-medium text-slate-700">Partner Investment</label>
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
              <label className="block text-xs font-medium text-slate-700">Bank Balance</label>
              <input type="number" min="0" step="0.01" className="w-full px-2 py-1 border rounded" value={bankBalance} onChange={e => setBankBalance(Number(e.target.value))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Note (optional)</label>
              <input className="w-full px-2 py-1 border rounded" value={note} onChange={e => setNote(e.target.value)} />
            </div>
          </div>

            <div className="mt-4 flex items-center gap-3">
            <button onClick={handleAdd} className="px-4 py-2 bg-blue-600 text-white rounded">Save Entry</button>
            <button onClick={() => saveEntryToDB({
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
            })} className="px-4 py-2 bg-green-600 text-white rounded">Save Entry to DB</button>
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
          <CardTitle>Saved Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <div className="text-slate-500">No saved entries</div>
          ) : (
            <div className="space-y-3">
              {entries.map(e => (
                <div key={e.id} className="border rounded p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">{e.date} — {e.note || 'Entry'}</div>
                      <div className="text-xs text-slate-500">Partner: {format(e.partnerInvestment)} | Loan: {format(e.loanAmount)} | Cheque: {format(e.issuedChequeAmount)}</div>
                    </div>
                    <div className={`font-mono font-bold ${ ( (e.partnerInvestment+e.loanAmount+e.creditedAmount+e.bankBalance) - (e.issuedChequeAmount+e.expenses+e.inventoryValue) ) >= 0 ? 'text-green-600' : 'text-red-600' }`}>Net {format((e.partnerInvestment+e.loanAmount+e.creditedAmount+e.bankBalance) - (e.issuedChequeAmount+e.expenses+e.inventoryValue))}</div>
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
