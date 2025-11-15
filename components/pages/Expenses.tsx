import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { supabase } from '../../supabaseClient';
// lightweight formatting without new dependency
import { useAuth } from '../../contexts/AuthContext';
import { UserRole } from '../../types';
import { exportToPDF } from '../../utils/pdfExport';

const categories = ['Fuel', 'Driver Salaries', 'Worker Salaries', 'Vehicle Rent', 'Common Expenses', 'Other'];

// Color palette for categories and accents
const CATEGORY_COLORS: Record<string, string> = {
    'Fuel': '#FF7043',
    'Driver Salaries': '#42A5F5',
    'Worker Salaries': '#7E57C2',
    'Vehicle Rent': '#26A69A',
    'Common Expenses': '#FFCA28',
    'Other': '#9E9E9E',
};

const colorForCategory = (cat?: string) => {
    if (!cat) return '#9E9E9E';
    return CATEGORY_COLORS[cat] || '#90A4AE';
};

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
    const { currentUser, refreshAuth } = useAuth();

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

    // PDF Export function
    const exportExpensesPDF = () => {
        const columns = [
            { key: 'date', title: 'Date' },
            { key: 'category', title: 'Category' },
            { key: 'amount', title: 'Amount' },
            { key: 'note', title: 'Note' },
            { key: 'createdBy', title: 'Added By' }
        ];

        const data = filteredExpenses.map(expense => ({
            date: new Date(expense.date).toLocaleDateString(),
            category: expense.category,
            amount: `${currentUser?.settings.currency || 'LKR'} ${formatCurrency(expense.amount)}`,
            note: expense.note || 'No note',
            createdBy: expense.created_by || 'System'
        }));

        const totalAmount = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);

        exportToPDF('Expenses Report', columns, data, {
            summary: {
                'Total Expenses': `${currentUser?.settings.currency || 'LKR'} ${formatCurrency(totalAmount)}`,
                'Number of Entries': filteredExpenses.length.toString(),
                'Period': monthFilter ? `${monthFilter}` : 'All Time'
            }
        });
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
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>Add Expense</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <input id="expense-date" name="expense-date" type="date" value={date} onChange={e => setDate(e.target.value)} className="p-2 border rounded bg-slate-900 text-white placeholder-slate-400 focus:outline-none focus:ring-2" style={{borderColor: '#374151'}} />
                        <input id="expense-amount" name="expense-amount" type="number" placeholder="Amount" value={amount} onChange={e => setAmount(e.target.value)} className="p-2 border rounded bg-slate-900 text-white placeholder-slate-400 focus:outline-none focus:ring-2" style={{borderColor: '#374151'}} />
                        <select id="expense-category" name="expense-category" value={category} onChange={e => setCategory(e.target.value)} className="p-2 border rounded bg-slate-900 text-white focus:outline-none focus:ring-2" style={{borderColor: colorForCategory(category)}}>
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <input id="expense-note" name="expense-note" placeholder="Note" value={note} onChange={e => setNote(e.target.value)} className="p-2 border rounded bg-slate-900 text-white placeholder-slate-400 focus:outline-none focus:ring-2" style={{borderColor: '#374151'}} />
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                        <button onClick={handleAdd} className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-pink-500 text-white rounded shadow hover:from-indigo-600 hover:to-pink-600 transition-colors">Save Expense</button>
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
                            }} className="ml-3 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors">Export CSV</button>
                        )}
                        <button 
                            onClick={exportExpensesPDF}
                            className="ml-3 px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                        >
                            📄 Export PDF
                        </button>
                        <div className="ml-auto text-sm text-slate-400">Pro tip: use categories to color-code expenses</div>
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
                        <input id="filter-month" name="filter-month" type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="p-2 border rounded bg-slate-900 text-white placeholder-slate-400 appearance-none focus:outline-none" style={{borderColor: '#374151'}} />
                        <label className="text-sm">Details:</label>
                        <input id="filter-details" name="filter-details" placeholder="Search details" value={detailsFilter} onChange={e => setDetailsFilter(e.target.value)} className="p-2 border rounded bg-slate-900 text-white placeholder-slate-400 focus:outline-none" style={{borderColor: '#374151'}} />
                        <button onClick={() => { setMonthFilter(''); setDetailsFilter(''); }} className="ml-2 px-3 py-1 bg-gray-700 text-white border border-slate-700 rounded hover:bg-gray-600 transition-colors">Clear</button>
                    </div>
                    {loading ? <p>Loading...</p> : (
                        <div className="mb-4 flex items-center justify-between">
                            <div className="text-sm">Total: <span className="font-bold text-green-400">{formatCurrency(totalFiltered)}</span></div>
                            <div></div>
                        </div>
                    )}
                    {loading ? null : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="text-left text-xs text-slate-400">
                                    <tr>
                                        <th className="py-2 px-3 w-36">Date</th>
                                        <th className="py-2 px-3 w-48">Details</th>
                                        <th className="py-2 px-3 text-right w-36">Expense</th>
                                        <th className="py-2 px-3 w-1/3">Note</th>
                                        <th className="py-2 px-3 text-center w-28">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredExpenses.map(exp => (
                                        <tr key={exp.id} className="border-t">
                                            <td className="py-2 px-3 w-36">{new Date(exp.date).toISOString().split('T')[0]}</td>
                                            <td className="py-2 px-3 w-48 flex items-center gap-2">
                                                <span className="w-3 h-3 rounded-full" style={{backgroundColor: colorForCategory(exp.category)}} />
                                                <span className="truncate">{exp.category}</span>
                                            </td>
                                            <td className="py-2 px-3 text-right w-36"><span className="inline-block px-3 py-1 rounded-full font-medium text-white" style={{backgroundColor: '#16A34A'}}>{formatCurrency(parseFloat(exp.amount || 0))}</span></td>
                                            <td className="py-2 px-3 w-1/3 truncate">{exp.note}</td>
                                            <td className="py-2 px-3 text-center w-28">
                                                {(currentUser?.role === UserRole.Admin || currentUser?.role === UserRole.Secretary || currentUser?.role === UserRole.Manager) && (
                                                    <button
                                                        onClick={async () => {
                                                            console.log('Delete button clicked for expense ID:', exp.id);
                                                            
                                                            // Confirm deletion
                                                            if (!confirm('Delete this expense?')) return;
                                                            
                                                            try {
                                                                if (fallbackMode) {
                                                                    // Handle localStorage fallback mode
                                                                    const local = localStorage.getItem('app_expenses_v1');
                                                                    const arr = local ? JSON.parse(local) : [];
                                                                    const filtered = arr.filter((r: any) => r.id !== exp.id);
                                                                    localStorage.setItem('app_expenses_v1', JSON.stringify(filtered));
                                                                    setExpenses(filtered);
                                                                    alert('Expense deleted locally.');
                                                                    return;
                                                                }

                                                                // Check authentication first
                                                                const { data: { user }, error: authError } = await supabase.auth.getUser();
                                                                console.log('Auth check before delete:', { user, authError });
                                                                
                                                                // Handle missing Supabase auth session
                                                                if ((authError || !user) && currentUser) {
                                                                    console.log('No Supabase auth session detected. This is expected with custom auth system.');
                                                                    console.log('Proceeding with delete attempt - RLS may block this operation.');
                                                                } else if (!currentUser) {
                                                                    alert('Please log in to delete expenses.');
                                                                    return;
                                                                }

                                                                // Try to delete from Supabase
                                                                console.log('Attempting to delete expense from database...', exp.id);
                                                                const deleteResult = await supabase.from('expenses').delete().eq('id', exp.id);
                                                                console.log('Delete result:', deleteResult);
                                                                
                                                                if (deleteResult.error) {
                                                                    console.error('Delete error details:', deleteResult.error);
                                                                    
                                                                    // Handle JWT/Auth errors (most common with custom auth + RLS)
                                                                    if (deleteResult.error.message?.toLowerCase().includes('jwt') || 
                                                                        deleteResult.error.message?.toLowerCase().includes('invalid token') ||
                                                                        deleteResult.error.message?.toLowerCase().includes('row level security') || 
                                                                        deleteResult.error.code === '42501' ||
                                                                        deleteResult.error.code === 'PGRST301') {
                                                                        
                                                                        // RLS/Auth error - remove locally and queue for manual deletion
                                                                        const newList = expenses.filter((r: any) => r.id !== exp.id);
                                                                        setExpenses(newList);
                                                                        const pending = [...pendingDeletes, exp.id];
                                                                        setPendingDeletes(pending);
                                                                        localStorage.setItem('expenses_pending_deletes_v1', JSON.stringify(pending));
                                                                        
                                                                        alert(`Authentication issue: ${deleteResult.error.message}\n\nExpense removed from display. Admin will need to delete from database manually or configure RLS policies.`);
                                                                        return;
                                                                    }
                                                                    
                                                                    alert(`Delete failed: ${deleteResult.error.message}\n\nError code: ${deleteResult.error.code || 'Unknown'}`);
                                                                    return;
                                                                }
                                                                
                                                                // Verify the delete actually worked by checking the count
                                                                const { count, error: countError } = await supabase
                                                                    .from('expenses')
                                                                    .select('*', { count: 'exact', head: true })
                                                                    .eq('id', exp.id);
                                                                
                                                                console.log('Verification count after delete:', { count, countError });
                                                                
                                                                if (count && count > 0) {
                                                                    console.warn('Delete appeared successful but record still exists!');
                                                                    alert('Delete may have failed - record still exists in database. Removing from display and queuing for cleanup.');
                                                                    const newList = expenses.filter((r: any) => r.id !== exp.id);
                                                                    setExpenses(newList);
                                                                    const pending = [...pendingDeletes, exp.id];
                                                                    setPendingDeletes(pending);
                                                                    localStorage.setItem('expenses_pending_deletes_v1', JSON.stringify(pending));
                                                                    return;
                                                                }
                                                                
                                                                // Success - refresh the expenses list
                                                                console.log('Delete verified successful');
                                                                await fetchExpenses();
                                                                alert('Expense deleted successfully from database.');
                                                                
                                                            } catch (err: any) {
                                                                console.error('Unexpected delete error:', err);
                                                                alert('Delete failed. Please try again.');
                                                            }
                                                        }}
                                                        className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
                                                    >Delete</button>
                                                )}
                                                {!(currentUser?.role === UserRole.Admin || currentUser?.role === UserRole.Secretary || currentUser?.role === UserRole.Manager) && (
                                                    <span className="text-xs text-gray-500">No Access</span>
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