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

const IssuedCheques: React.FC = () => {
  const { currentUser } = useAuth();
  const { refetchData, customers } = useData();
  const [issuedCheques, setIssuedCheques] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    payeeName: '',
    amount: '',
    bank: '',
    chequeNumber: '',
    issueDate: new Date().toISOString().slice(0, 10),
    cashDate: '',
    purpose: '',
    notes: ''
  });
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    fetchIssuedCheques();
  }, [currentUser]);

  const fetchIssuedCheques = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('issued_cheques')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Fetch issued cheques error', error);
        setIssuedCheques([]);
      } else {
        setIssuedCheques(data || []);
      }
    } catch (err) {
      console.error('Unexpected error fetching issued cheques', err);
      setIssuedCheques([]);
    } finally {
      setLoading(false);
    }
  };

  const isChequeUpcoming = (c: any) => {
    try {
      if (!c || !c.cash_date) return false;
      const st = (c.status || '').toLowerCase();
      if (st === 'cashed' || st === 'cancelled' || st === 'stopped') return false;
      const today = new Date();
      today.setHours(0,0,0,0);
      const d = new Date(c.cash_date);
      d.setHours(0,0,0,0);
      const diff = Math.round((d.getTime() - today.getTime()) / (1000*60*60*24));
      return diff >= 0 && diff <= 3;
    } catch (e) { return false; }
  };

  const isChequeDueToday = (c: any) => {
    try {
      if (!c || !c.cash_date) return false;
      const today = new Date();
      today.setHours(0,0,0,0);
      const d = new Date(c.cash_date);
      d.setHours(0,0,0,0);
      return d.getTime() === today.getTime();
    } catch (e) { return false; }
  };

  const isChequeOverdue = (c: any) => {
    try {
      if (!c || !c.cash_date) return false;
      const st = (c.status || '').toLowerCase();
      if (st === 'cashed' || st === 'cancelled' || st === 'stopped') return false;
      const today = new Date();
      today.setHours(0,0,0,0);
      const d = new Date(c.cash_date);
      d.setHours(0,0,0,0);
      return d.getTime() < today.getTime();
    } catch (e) { return false; }
  };

  const handleChange = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    
    // Validate all required fields
    if (!form.payeeName?.trim() || 
        !form.amount || 
        Number(form.amount) <= 0 || 
        !form.bank?.trim() || 
        !form.chequeNumber?.trim() || 
        !form.issueDate?.trim() ||
        !form.purpose?.trim()) {
      alert('Please fill in all required fields: Payee Name, Amount, Bank, Cheque Number, Issue Date, and Purpose.');
      return;
    }
    
    const payload = {
      payee_name: form.payeeName || null,
      amount: Number(form.amount) || 0,
      bank: form.bank || null,
      cheque_number: form.chequeNumber || null,
      issue_date: form.issueDate || null,
      cash_date: form.cashDate || null,
      purpose: form.purpose || null,
      notes: form.notes || null,
      status: 'Issued'
    };

    setLoading(true);
    try {
      const { data, error } = await supabase.from('issued_cheques').insert([payload]).select();
      if (error) {
        console.error('Insert issued cheque error', error);
        alert('Failed to save issued cheque. See console for details.');
      } else {
        setIssuedCheques(prev => [(data && data[0]) || payload, ...prev]);
        setForm({ 
          payeeName: '', 
          amount: '', 
          bank: '', 
          chequeNumber: '', 
          issueDate: new Date().toISOString().slice(0,10), 
          cashDate: '',
          purpose: '',
          notes: '' 
        });
        setShowForm(false);
      }
    } catch (err) {
      console.error('Unexpected insert error', err);
    } finally {
      setLoading(false);
    }
  };

  const markCashed = async (id: any) => {
    if (!id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('issued_cheques').update({ 
        status: 'Cashed', 
        cashed_at: new Date().toISOString() 
      }).eq('id', id).select();
      if (error) {
        console.error('Mark cashed error', error);
        alert('Failed to update cheque status.');
      } else {
        const updatedCheque = (data && data[0]) || null;
        setIssuedCheques(prev => prev.map(c => c.id === id ? updatedCheque || { ...c, status: 'Cashed' } : c));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const setCashDate = async (id: any, date: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('issued_cheques').update({ cash_date: date }).eq('id', id).select();
      if (error) {
        console.error('Set cash date error', error);
        alert('Failed to set cash date');
      } else {
        setIssuedCheques(prev => prev.map(c => c.id === id ? (data && data[0]) || { ...c, cash_date: date } : c));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const markStopped = async (id: any) => {
    if (!id) return;
    const reason = prompt('Reason for stopping payment:');
    if (!reason) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.from('issued_cheques').update({ 
        status: 'Stopped', 
        stopped_at: new Date().toISOString(),
        notes: (issuedCheques.find(c => c.id === id)?.notes || '') + `\nPayment stopped: ${reason}`
      }).eq('id', id).select();
      if (error) {
        console.error('Mark stopped error', error);
        alert('Failed to stop payment.');
      } else {
        const updatedCheque = (data && data[0]) || null;
        setIssuedCheques(prev => prev.map(c => c.id === id ? updatedCheque || { ...c, status: 'Stopped' } : c));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const deleteCheque = async (id: any) => {
    if (!id) return;
    const ok = window.confirm('Are you sure you want to delete this issued cheque? This action cannot be undone.');
    if (!ok) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('issued_cheques').delete().eq('id', id).select();
      if (error) {
        console.error('Delete issued cheque error', error);
        alert('Failed to delete issued cheque. See console for details.');
      } else {
        setIssuedCheques(prev => prev.filter(c => c.id !== id));
      }
    } catch (err) {
      console.error('Unexpected delete error', err);
      alert('Failed to delete issued cheque. See console for details.');
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser || currentUser.role !== 'Admin') {
    return <div className="p-6">You must be an Admin to access Issued Cheques Management.</div>;
  }

  // Get upcoming alerts count
  const upcomingCheques = issuedCheques.filter(c => isChequeUpcoming(c));
  const dueTodayCheques = issuedCheques.filter(c => isChequeDueToday(c));
  const overdueCheques = issuedCheques.filter(c => isChequeOverdue(c));

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header Section */}
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 4v12l-4-2-4 2V4M8 2h8a2 2 0 012 2v16l-6-3-6 3V4a2 2 0 012-2z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 7h.01M9 11h6M9 15h6" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
                Issued Cheques
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-1 font-medium">
                Track and monitor cheques issued to vendors and suppliers
              </p>
            </div>
          </div>
          <div className="mt-4 sm:mt-0 flex space-x-3">
            <button
              onClick={() => setShowForm(s => !s)}
              className="flex items-center px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-[1.02] font-medium"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {showForm ? 'Hide Form' : 'Record Issued Cheque'}
            </button>
          </div>
        </div>
      </div>

      {/* Alert Cards */}
      {(dueTodayCheques.length > 0 || upcomingCheques.length > 0 || overdueCheques.length > 0) && (
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
                    <p className="text-xs text-orange-700 dark:text-orange-300">cheque(s) to process</p>
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

          {overdueCheques.length > 0 && (
            <Card className="border-0 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02]">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="p-3 bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-lg animate-pulse">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-semibold text-red-800 dark:text-red-200 uppercase tracking-wide">Overdue</p>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">{overdueCheques.length}</p>
                    <p className="text-xs text-red-700 dark:text-red-300">requires attention</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <Card className="border-0 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 shadow-lg hover:shadow-xl transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">Total Issued</p>
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-2">{issuedCheques.length}</p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  {formatCurrency(issuedCheques.reduce((sum, c) => sum + (c.amount || 0), 0))}
                </p>
              </div>
              <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-0 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 shadow-lg hover:shadow-xl transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-green-700 dark:text-green-300 uppercase tracking-wide">Cashed</p>
                <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">
                  {issuedCheques.filter(c => c.status === 'Cashed').length}
                </p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  {formatCurrency(issuedCheques.filter(c => c.status === 'Cashed').reduce((sum, c) => sum + (c.amount || 0), 0))}
                </p>
              </div>
              <div className="p-3 bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20 shadow-lg hover:shadow-xl transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide">Pending</p>
                <p className="text-3xl font-bold text-amber-600 dark:text-amber-400 mt-2">
                  {issuedCheques.filter(c => c.status === 'Issued').length}
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  {formatCurrency(issuedCheques.filter(c => c.status === 'Issued').reduce((sum, c) => sum + (c.amount || 0), 0))}
                </p>
              </div>
              <div className="p-3 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl shadow-lg">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 shadow-lg hover:shadow-xl transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-red-700 dark:text-red-300 uppercase tracking-wide">Stopped</p>
                <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-2">
                  {issuedCheques.filter(c => c.status === 'Stopped').length}
                </p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {formatCurrency(issuedCheques.filter(c => c.status === 'Stopped').reduce((sum, c) => sum + (c.amount || 0), 0))}
                </p>
              </div>
              <div className="p-3 bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-lg">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Form Section */}
      {showForm && (
        <Card className="border-0 bg-gradient-to-br from-slate-50 to-white dark:from-slate-800 dark:to-slate-900 shadow-xl">
          <CardHeader className="pb-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <div>
                <CardTitle className="text-xl font-bold text-slate-800 dark:text-slate-100">Record Issued Cheque</CardTitle>
                <CardDescription className="text-slate-600 dark:text-slate-400 font-medium">Enter details for a cheque you issued to vendors or suppliers</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Payee Name *
                </label>
                <input 
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 shadow-sm hover:shadow-md" 
                  value={form.payeeName} 
                  onChange={e => handleChange('payeeName', e.target.value)}
                  placeholder="Enter payee name"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Amount (LKR) *
                </label>
                <input 
                  type="number" 
                  step="0.01" 
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 shadow-sm hover:shadow-md" 
                  value={form.amount} 
                  onChange={e => handleChange('amount', e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Bank *
                </label>
                <input 
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 shadow-sm hover:shadow-md" 
                  value={form.bank} 
                  onChange={e => handleChange('bank', e.target.value)}
                  placeholder="Bank name"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Cheque Number *
                </label>
                <input 
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 shadow-sm hover:shadow-md" 
                  value={form.chequeNumber} 
                  onChange={e => handleChange('chequeNumber', e.target.value)}
                  placeholder="Cheque number"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Issue Date *
                </label>
                <input 
                  type="date" 
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 shadow-sm hover:shadow-md" 
                  value={form.issueDate} 
                  onChange={e => handleChange('issueDate', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Expected Cash Date
                </label>
                <input 
                  type="date" 
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 shadow-sm hover:shadow-md" 
                  value={form.cashDate} 
                  onChange={e => handleChange('cashDate', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Purpose *
                </label>
                <input 
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 shadow-sm hover:shadow-md" 
                  value={form.purpose} 
                  onChange={e => handleChange('purpose', e.target.value)}
                  placeholder="Payment purpose"
                />
              </div>
              <div className="md:col-span-2 space-y-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Notes (Optional)
                </label>
                <textarea 
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 shadow-sm hover:shadow-md resize-none" 
                  value={form.notes} 
                  onChange={e => handleChange('notes', e.target.value)}
                  placeholder="Additional notes..."
                  rows={3}
                />
              </div>
              <div className="md:col-span-2 flex justify-end pt-4">
                <button 
                  type="submit" 
                  disabled={loading} 
                  className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 disabled:from-indigo-400 disabled:to-indigo-500 text-white rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-[1.02] font-semibold"
                >
                  {loading ? 'Recording...' : 'Record Issued Cheque'}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Issued Cheques List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Issued Cheques</CardTitle>
              <CardDescription>
                {issuedCheques.length} cheque(s) issued • Total Value: {formatCurrency(issuedCheques.reduce((sum, c) => sum + (c.amount || 0), 0))}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-slate-500">Loading issued cheques...</div>
            </div>
          ) : issuedCheques.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-2">📄</div>
              <p className="text-slate-500 mb-2">No issued cheques recorded yet</p>
              <p className="text-sm text-slate-400">Click "Record Issued Cheque" to add your first cheque</p>
            </div>
          ) : (
            <>
              {/* Group cheques by cash_date */}
              {(() => {
                const groups: Record<string, any[]> = {};
                for (const c of issuedCheques) {
                  const key = c.cash_date ? (c.cash_date.slice ? c.cash_date.slice(0,10) : String(c.cash_date)) : 'Unscheduled';
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
                      <div key={k} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                        <div className="bg-slate-50 dark:bg-slate-800 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                          <div className="flex items-center justify-between">
                            <h3 className="font-medium text-slate-900 dark:text-slate-100">
                              {k === 'Unscheduled' ? '📅 No Cash Date Set' : `📅 ${new Date(k).toLocaleDateString('en-GB', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}`}
                            </h3>
                            <div className="text-sm text-slate-500">
                              {groups[k].length} cheque(s) • {formatCurrency(groups[k].reduce((sum, c) => sum + (c.amount || 0), 0))}
                            </div>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-slate-100 dark:bg-slate-700">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Payee</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Amount</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Bank</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Cheque #</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Issue Date</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Cash Date</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Purpose</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                              {groups[k].map((c:any) => (
                                <tr key={c.id} className={`${
                                  isChequeDueToday(c) ? 'bg-orange-50 dark:bg-orange-900/20' : 
                                  isChequeOverdue(c) ? 'bg-red-50 dark:bg-red-900/20' : 
                                  isChequeUpcoming(c) ? 'bg-yellow-50 dark:bg-yellow-900/20' : 
                                  'bg-white dark:bg-slate-800'
                                } hover:bg-slate-50 dark:hover:bg-slate-700/50`}>
                                  <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">{c.payee_name || '-'}</td>
                                  <td className="px-4 py-3 text-sm font-semibold text-red-600">{formatCurrency(c.amount || 0)}</td>
                                  <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{c.bank || '-'}</td>
                                  <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{c.cheque_number || '-'}</td>
                                  <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{(c.issue_date || c.created_at || '').slice ? (c.issue_date || c.created_at).slice(0,10) : String(c.issue_date || c.created_at)}</td>
                                  <td className="px-4 py-3">
                                    <input 
                                      type="date" 
                                      defaultValue={c.cash_date ? (c.cash_date.slice ? c.cash_date.slice(0,10) : c.cash_date) : ''} 
                                      onChange={(e) => setCashDate(c.id, e.target.value)} 
                                      className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500 focus:border-transparent" 
                                    />
                                  </td>
                                  <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 max-w-32 truncate" title={c.purpose}>{c.purpose || '-'}</td>
                                  <td className="px-4 py-3">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                      c.status === 'Cashed' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                      c.status === 'Stopped' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                                      'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
                                    }`}>
                                      {c.status || 'Issued'}
                                    </span>
                                    {isChequeDueToday(c) && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">Due Today</span>}
                                    {isChequeOverdue(c) && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Overdue</span>}
                                  </td>
                                  <td className="px-4 py-3">
                                    {c.status === 'Cashed' || c.status === 'Stopped' ? (
                                      <button 
                                        onClick={() => deleteCheque(c.id)} 
                                        className="px-3 py-1 text-xs bg-slate-600 hover:bg-slate-700 text-white rounded transition-colors"
                                      >
                                        Delete
                                      </button>
                                    ) : (
                                      <div className="flex space-x-2">
                                        <button 
                                          onClick={() => markCashed(c.id)} 
                                          className="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                                        >
                                          Mark Cashed
                                        </button>
                                        <button 
                                          onClick={() => markStopped(c.id)} 
                                          className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                                        >
                                          Stop Payment
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
    </div>
  );
};

export default IssuedCheques;