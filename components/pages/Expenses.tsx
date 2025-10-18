import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { supabase } from '../../supabaseClient';
// lightweight formatting without new dependency
import { useAuth } from '../../contexts/AuthContext';
import { UserRole } from '../../types';

const categories = ['Fuel', 'Driver Salaries', 'Worker Salaries', 'Vehicle Rent', 'Common Expenses', 'Other'];

const Expenses: React.FC = () => {
    const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [amount, setAmount] = useState<string>('');
    const [category, setCategory] = useState<string>(categories[0]);
    const [note, setNote] = useState<string>('');
    const [expenses, setExpenses] = useState<any[]>([]);
    const [monthFilter, setMonthFilter] = useState<string>('');
    const [detailsFilter, setDetailsFilter] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [fallbackMode, setFallbackMode] = useState(false);
    const [rlsBlocked, setRlsBlocked] = useState(false);
    const [dismissBanner, setDismissBanner] = useState<boolean>(() => {
        try { return localStorage.getItem('expenses_fallback_dismissed') === '1'; } catch { return false; }
    });
    const [pendingDeletes, setPendingDeletes] = useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem('expenses_pending_deletes_v1') || '[]'); } catch { return []; }
    });

    // Attempt to delete any pending IDs from the DB using current session
    const attemptPendingDeletes = async () => {
        if (!pendingDeletes || pendingDeletes.length === 0) return;
        try {
            const userRes = await supabase.auth.getUser();
            const userId = (userRes as any)?.data?.user?.id || null;
            if (!userId) {
                console.warn('Cannot retry pending deletes: not signed in');
                alert('Sign in to complete pending deletes.');
                return;
            }

            const remaining: string[] = [];
            for (const id of pendingDeletes) {
                try {
                    const { error } = await supabase.from('expenses').delete().eq('id', id);
                    if (error) {
                        console.error('Pending delete failed for', id, error);
                        // keep it in remaining
                        remaining.push(id);
                    }
                } catch (err) {
                    console.error('Network error retrying delete for', id, err);
                    remaining.push(id);
                }
            }
            setPendingDeletes(remaining);
            try { localStorage.setItem('expenses_pending_deletes_v1', JSON.stringify(remaining)); } catch {}
            if (remaining.length === 0) {
                alert('All pending deletes completed successfully.');
            } else {
                alert(`${remaining.length} pending deletes remain (check console for details).`);
            }
            // refresh list
            fetchExpenses();
        } catch (err) {
            console.error('attemptPendingDeletes failed', err);
            alert('Failed to retry pending deletes (see console).');
        }
    };

    // Listen for auth state changes and attempt pending deletes when a user signs in
    React.useEffect(() => {
        const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                attemptPendingDeletes().catch(e => console.error('auto retry pending deletes failed', e));
            }
        });
        return () => { sub?.subscription?.unsubscribe?.(); };
    }, [pendingDeletes]);
    const { currentUser } = useAuth();

    const fetchExpenses = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.from('expenses').select('*').order('date', { ascending: false });
            if (error) {
                console.error('Error fetching expenses:', error);
                const msg = (error.message || '').toString().toLowerCase();
                // Table missing -> fallback to localStorage
                if (error.code === 'PGRST205') {
                    setFallbackMode(true);
                    const local = localStorage.getItem('app_expenses_v1');
                    setExpenses(local ? JSON.parse(local) : []);
                    console.warn('Switched to localStorage fallback for expenses. Run migration to restore DB persistence.');
                } else if (msg.includes('row-level') || msg.includes('forbidden') || (error.code && error.code.toString().startsWith('PG'))) {
                    // Likely RLS blocking SELECT for anon users
                    setRlsBlocked(true);
                    setExpenses([]);
                    console.warn('Row Level Security is preventing reading the `expenses` table. Sign in or adjust SELECT policy in Supabase.');
                } else {
                    alert('Error fetching expenses: ' + (error.message || JSON.stringify(error)));
                }
            } else if (data) {
                // Debug raw rows to console to help identify mismatches
                console.debug('Fetched expenses (raw):', data);

                // Normalize rows: some projects return numeric as string and column names may vary
                const normalized = data.map((row: any) => ({
                    id: row.id,
                    // prefer explicit `date` column, fall back to date part of created_at
                    date: row.date || (row.created_at ? new Date(row.created_at).toISOString().split('T')[0] : null),
                    amount: row.amount == null ? 0 : Number(row.amount),
                    category: row.category || row.type || '',
                    note: row.note || row.notes || '',
                    created_at: row.created_at || null,
                }));

                setExpenses(normalized);
            }
        } catch (err) {
            console.error('Unexpected error fetching expenses:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchExpenses();
    }, []);

    const handleAdd = async () => {
        const amt = parseFloat(amount);
        if (isNaN(amt) || amt <= 0) {
            alert('Enter a valid amount');
            return;
        }
        try {
            const payload = { date, amount: amt, category, note };
            if (fallbackMode) {
                // Save locally
                const local = localStorage.getItem('app_expenses_v1');
                const arr = local ? JSON.parse(local) : [];
                const newRow = { id: `local-${Date.now()}`, ...payload, created_at: new Date().toISOString() };
                arr.unshift(newRow);
                localStorage.setItem('app_expenses_v1', JSON.stringify(arr));
                setExpenses(arr);
            } else {
                // If authenticated, try to include created_by so RLS per-user policies work
                const userRes = await supabase.auth.getUser();
                const userId = (userRes as any)?.data?.user?.id || null;

                let insertPayload: any = { ...payload };
                if (userId) insertPayload.created_by = userId;

                const { error } = await supabase.from('expenses').insert([insertPayload]);
                if (error) {
                    console.error('Insert error:', error);
                    // If the error indicates missing column (or RLS) try again without created_by
                    const msg = (error.message || '').toString().toLowerCase();
                    if (msg.includes('column "created_by"') || msg.includes('unknown column') || msg.includes('row-level') || error.code === 'PGRST205') {
                        // retry without created_by (for older DBs) or fallback in case of missing table
                        try {
                            const { error: retryErr } = await supabase.from('expenses').insert([{ date, amount: amt, category, note }]);
                            if (retryErr) {
                                console.error('Retry insert failed:', retryErr);
                                if (retryErr.code === 'PGRST205') {
                                    setFallbackMode(true);
                                    const local = localStorage.getItem('app_expenses_v1');
                                    const arr = local ? JSON.parse(local) : [];
                                    const newRow = { id: `local-${Date.now()}`, date, amount: amt, category, note, created_at: new Date().toISOString() };
                                    arr.unshift(newRow);
                                    localStorage.setItem('app_expenses_v1', JSON.stringify(arr));
                                    setExpenses(arr);
                                    alert('Expenses table missing in Supabase. Your expense was saved locally. Run migration: supabase_migrations/create_expenses.sql');
                                } else {
                                    alert('Failed to save expense: ' + (retryErr.message || JSON.stringify(retryErr)));
                                }
                            }
                        } catch (retryCatch) {
                            console.error('Retry failed with exception:', retryCatch);
                            alert('Failed to save expense');
                        }
                    } else {
                        alert('Failed to save expense: ' + (error.message || JSON.stringify(error)));
                        return;
                    }
                }
            }
            setAmount('');
            setNote('');
            setCategory(categories[0]);
            fetchExpenses();
        } catch (err) {
            console.error('Unexpected insert error:', err);
            alert('Failed to save expense');
        }
    };

    const filteredExpenses = expenses.filter(exp => {
        const matchesMonth = !monthFilter || (new Date(exp.date).toISOString().slice(0,7) === monthFilter);
        const matchesDetails = !detailsFilter || ((exp.category || '') + ' ' + (exp.note || '')).toLowerCase().includes(detailsFilter.toLowerCase());
        return matchesMonth && matchesDetails;
    });

    const totalFiltered = filteredExpenses.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

    const formatCurrency = (v: number) => {
        return v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            {fallbackMode && !dismissBanner && (
                <div className="mb-4 p-3 bg-yellow-900 text-white border border-yellow-700 rounded flex justify-between items-center">
                    <div>Running in local fallback mode — expenses are stored in your browser (localStorage). Run migration <code className="bg-black/10 px-1 py-0.5 rounded">supabase_migrations/create_expenses.sql</code> to enable DB persistence.</div>
                    <div>
                        <button onClick={() => { setDismissBanner(true); try { localStorage.setItem('expenses_fallback_dismissed','1'); } catch{} }} className="ml-3 bg-transparent text-white px-2 py-1 rounded">✕</button>
                    </div>
                </div>
            )}
            {rlsBlocked && (
                <div className="mb-4 p-3 bg-red-700 text-white border border-red-600 rounded">
                    Your current session cannot read the `expenses` table due to Row Level Security. Options:
                    <ul className="ml-4 list-disc">
                        <li>Sign in to the app (Supabase Auth) and reload — authenticated users are allowed by the example policy.</li>
                        <li>Or temporarily relax the SELECT policy in Supabase SQL editor (dev only) to allow reading while seeding.</li>
                    </ul>
                </div>
            )}
            <h1 className="text-3xl font-bold mb-4">Expenses</h1>
            <div className="mb-4 text-sm text-slate-500">
                <button onClick={async () => { const u = await supabase.auth.getUser(); console.log('auth.getUser()', u); alert('Check console for auth.getUser()'); }} className="mr-2 px-2 py-1 bg-slate-700 text-white rounded">Debug: auth.getUser()</button>
                <button onClick={async () => { const s = await supabase.auth.getSession(); console.log('auth.getSession()', s); alert('Check console for auth.getSession()'); }} className="mr-2 px-2 py-1 bg-slate-700 text-white rounded">Debug: auth.getSession()</button>
                <button onClick={() => { fetchExpenses(); alert('Re-fetching expenses'); }} className="px-2 py-1 bg-slate-700 text-white rounded">Re-fetch</button>
            </div>
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>Add Expense</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <input id="expense-date" name="expense-date" type="date" value={date} onChange={e => setDate(e.target.value)} className="p-2 border rounded bg-slate-800 text-slate-100 placeholder-slate-400" />
                        <input id="expense-amount" name="expense-amount" type="number" placeholder="Amount" value={amount} onChange={e => setAmount(e.target.value)} className="p-2 border rounded bg-slate-800 text-slate-100 placeholder-slate-400" />
                        <select id="expense-category" name="expense-category" value={category} onChange={e => setCategory(e.target.value)} className="p-2 border rounded bg-slate-800 text-slate-100">
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <input id="expense-note" name="expense-note" placeholder="Note" value={note} onChange={e => setNote(e.target.value)} className="p-2 border rounded bg-slate-800 text-slate-100 placeholder-slate-400" />
                    </div>
                    <div className="mt-4">
                        <button onClick={handleAdd} className="px-4 py-2 bg-blue-600 text-white rounded">Save Expense</button>
                        {fallbackMode && (
                            <button onClick={() => {
                                const local = localStorage.getItem('app_expenses_v1');
                                if (!local) return alert('No local expenses to export');
                                const rows = JSON.parse(local);
                                const csv = [Object.keys(rows[0]).join(','), ...rows.map(r => Object.values(r).map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','))].join('\n');
                                const blob = new Blob([csv], { type: 'text/csv' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url; a.download = 'expenses_local_export.csv'; a.click();
                                URL.revokeObjectURL(url);
                            }} className="ml-3 px-3 py-2 bg-gray-700 text-white rounded">Export CSV</button>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Recent Expenses</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="mb-4 flex gap-3 items-center">
                        <label className="text-sm">Month:</label>
                        <input id="filter-month" name="filter-month" type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="p-2 border rounded bg-slate-800 text-slate-100 placeholder-slate-400 appearance-none" />
                        <label className="text-sm">Details:</label>
                        <input id="filter-details" name="filter-details" placeholder="Search details" value={detailsFilter} onChange={e => setDetailsFilter(e.target.value)} className="p-2 border rounded bg-slate-800 text-slate-100 placeholder-slate-400" />
                        <button onClick={() => { setMonthFilter(''); setDetailsFilter(''); }} className="ml-2 px-3 py-1 bg-slate-800 text-slate-100 border border-slate-700 rounded">Clear</button>
                    </div>
                    {pendingDeletes.length > 0 && (
                        <div className="mb-4 p-3 bg-yellow-800 text-white rounded">
                            <div className="flex items-center justify-between">
                                <div>Pending DB deletes: {pendingDeletes.length} rows (deleted locally)</div>
                                <div>
                                    <button onClick={() => {
                                        const sql = pendingDeletes.map(id => `DELETE FROM public.expenses WHERE id = '${id}';`).join('\n');
                                        navigator.clipboard?.writeText(sql);
                                        alert('SQL copied to clipboard. Paste into Supabase SQL editor as admin to remove rows.');
                                    }} className="px-3 py-1 bg-gray-700 text-white rounded mr-2">Copy SQL</button>
                                    <button onClick={() => { try { localStorage.removeItem('expenses_pending_deletes_v1'); setPendingDeletes([]); alert('Cleared pending deletes (local only)'); } catch {}}} className="px-3 py-1 bg-slate-700 text-white rounded mr-2">Clear</button>
                                    <button onClick={() => attemptPendingDeletes()} className="px-3 py-1 bg-green-600 text-white rounded">Retry pending deletes</button>
                                </div>
                            </div>
                        </div>
                    )}
                    {loading ? <p>Loading...</p> : (
                        <div className="mb-4 flex items-center justify-between">
                            <div className="text-sm text-slate-500">Total: <span className="font-bold">{formatCurrency(totalFiltered)}</span></div>
                            <div></div>
                        </div>
                    )}
                    {loading ? null : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="text-left text-xs text-slate-400">
                                    <tr>
                                        <th className="py-2 px-3">Date</th>
                                        <th className="py-2 px-3">Details</th>
                                        <th className="py-2 px-3 text-right">Expense</th>
                                        <th className="py-2 px-3">Note</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredExpenses.map(exp => (
                                        <tr key={exp.id} className="border-t">
                                            <td className="py-2 px-3">{new Date(exp.date).toISOString().split('T')[0]}</td>
                                            <td className="py-2 px-3">{exp.category}</td>
                                            <td className="py-2 px-3 text-right">{exp.amount}</td>
                                            <td className="py-2 px-3">{exp.note}</td>
                                            <td className="py-2 px-3">
                                                {currentUser?.role === UserRole.Admin && (
                                                    <button
                                                        onClick={async () => {
                                                            if (!confirm('Delete this expense?')) return;
                                                            try {
                                                                if (fallbackMode) {
                                                                    const local = localStorage.getItem('app_expenses_v1');
                                                                    const arr = local ? JSON.parse(local) : [];
                                                                    const filtered = arr.filter((r:any) => r.id !== exp.id);
                                                                    localStorage.setItem('app_expenses_v1', JSON.stringify(filtered));
                                                                    setExpenses(filtered);
                                                                } else {
                                                                        // Ensure user is signed in (RLS will block unauthenticated deletes)
                                                                        const userRes = await supabase.auth.getUser();
                                                                        const userId = (userRes as any)?.data?.user?.id || null;
                                                                        if (!userId) {
                                                                            alert('You must be signed in to delete expenses. Please sign in and try again.');
                                                                            return;
                                                                        }

                                                                        try {
                                                                            const { error } = await supabase.from('expenses').delete().eq('id', exp.id);
                                                                            if (error) {
                                                                                console.error('Delete error:', error);
                                                                                const isRls = ((error.code || '').toString() === '42501') || (error.message || '').toLowerCase().includes('row-level');
                                                                                // If RLS or network prevents deleting, fall back to a local pending-deletes approach
                                                                                if (isRls || (error.message || '').toLowerCase().includes('failed to fetch')) {
                                                                                    // remove from UI and store pending delete
                                                                                    const newList = expenses.filter((r:any) => r.id !== exp.id);
                                                                                    setExpenses(newList);
                                                                                    const pending = [...pendingDeletes, exp.id];
                                                                                    setPendingDeletes(pending);
                                                                                    try { localStorage.setItem('expenses_pending_deletes_v1', JSON.stringify(pending)); } catch {}
                                                                                    alert('Removed locally. The row could not be removed from the DB (network or RLS). You can run the provided SQL in Supabase SQL editor to delete it permanently.');
                                                                                    return;
                                                                                }
                                                                                alert('Failed to delete expense: ' + (error.message || JSON.stringify(error)));
                                                                                return;
                                                                            }
                                                                        } catch (networkErr: any) {
                                                                            console.error('Network/delete failed:', networkErr);
                                                                            // fallback to local pending delete
                                                                            const newList = expenses.filter((r:any) => r.id !== exp.id);
                                                                            setExpenses(newList);
                                                                            const pending = [...pendingDeletes, exp.id];
                                                                            setPendingDeletes(pending);
                                                                            try { localStorage.setItem('expenses_pending_deletes_v1', JSON.stringify(pending)); } catch {}
                                                                            alert('Network error while deleting. Removed locally and queued for manual deletion from DB later.');
                                                                            return;
                                                                        }
                                                                    // refresh list
                                                                    fetchExpenses();
                                                                }
                                                            } catch (err) {
                                                                console.error('Delete failed', err);
                                                                    // If unexpected, still fallback to local removal
                                                                    try {
                                                                        const newList = expenses.filter((r:any) => r.id !== exp.id);
                                                                        setExpenses(newList);
                                                                        const pending = [...pendingDeletes, exp.id];
                                                                        setPendingDeletes(pending);
                                                                        localStorage.setItem('expenses_pending_deletes_v1', JSON.stringify(pending));
                                                                    } catch {}
                                                                    alert('Failed to delete expense remotely — removed locally and queued for manual DB deletion.');
                                                            }
                                                        }}
                                                        className="px-3 py-1 bg-red-600 text-white rounded"
                                                    >Delete</button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default Expenses;
