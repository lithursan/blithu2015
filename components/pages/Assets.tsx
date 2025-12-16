import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

type Asset = {
  id: string;
  name: string;
  value: number;
  note?: string;
  created_at?: string;
};

const AssetsPage: React.FC = () => {
  const [name, setName] = useState<string>('');
  const [value, setValue] = useState<number>(0);
  const [note, setNote] = useState<string>('');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { currentUser } = useAuth();

  const format = (v: number) => `LKR ${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  const loadAssets = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.from('assets').select('*').order('created_at', { ascending: false }).limit(500);
      if (error) {
        console.warn('Failed to load assets', error);
        return;
      }
      if (!data) return;
      setAssets(data.map((r: any) => ({ id: r.id, name: r.name, value: Number(r.value) || 0, note: r.note || '', created_at: r.created_at })));
    } catch (e) {
      console.error('Error loading assets', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAssets();
  }, []);

  const saveAsset = async () => {
    if (!name || Number(value) <= 0) {
      alert('Please provide an asset name and a positive value');
      return;
    }
    try {
      if (editingId) {
        // Update existing asset
        const payload: any = { name, value, note: note || null };
        const { data, error } = await supabase.from('assets').update(payload).eq('id', editingId).select();
        if (error) {
          console.error('Failed to update asset', error);
          alert('Failed to update asset: ' + (error.message || JSON.stringify(error)));
          return;
        }
        // Refresh list and clear editing state
        await loadAssets();
        setEditingId(null);
        setName(''); setValue(0); setNote('');
        alert('Asset updated');
        return;
      }
      // created_by column is uuid in DB; ensure we send a valid UUID or null
      const isUUID = (v: any) => typeof v === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(v);
      const createdBy = isUUID(currentUser?.id) ? currentUser?.id : null;
      const payload = { name, value, note: note || null, created_by: createdBy };
      const { data, error } = await supabase.from('assets').insert([payload]).select();
      if (error) {
        console.error('Failed to save asset', error);
        // Show a more descriptive message to help debugging: include Supabase error message/details
        const errMsg = (error && (error.message || error.details)) ? (error.message || error.details) : JSON.stringify(error);
        alert('Failed to save asset: ' + errMsg);
        return;
      }
      setName('');
      setValue(0);
      setNote('');
      await loadAssets();
      alert('Saved asset');
    } catch (e) {
      console.error('Exception saving asset', e);
      alert('Failed to save asset (exception): ' + (e && (e.message || JSON.stringify(e))));
    }
  };

  const handleEdit = (a: Asset) => {
    setEditingId(a.id);
    setName(a.name);
    setValue(a.value || 0);
    setNote(a.note || '');
    // scroll into view maybe or focus
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this asset? This action cannot be undone.')) return;
    try {
      const { error } = await supabase.from('assets').delete().eq('id', id);
      if (error) {
        console.error('Failed to delete asset', error);
        alert('Failed to delete asset: ' + (error.message || JSON.stringify(error)));
        return;
      }
      // Optimistic update
      setAssets(prev => prev.filter(p => p.id !== id));
      alert('Asset deleted');
    } catch (e) {
      console.error('Exception deleting asset', e);
      alert('Failed to delete asset (exception): ' + (e && (e.message || JSON.stringify(e))));
    }
  };

  const total = assets.reduce((s, a) => s + (Number(a.value) || 0), 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Assets</h1>
          <p className="text-sm text-slate-600 mt-1">Add individual assets and track their total value used in Partner Investment reconciliation.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add Asset</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">Asset name</label>
              <input value={name} onChange={e => setName(e.target.value)} className="w-full px-2 py-1 border rounded" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Value</label>
              <input type="number" min="0" step="0.01" value={value} onChange={e => setValue(Number(e.target.value))} className="w-full px-2 py-1 border rounded" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Note (optional)</label>
              <input value={note} onChange={e => setNote(e.target.value)} className="w-full px-2 py-1 border rounded" />
            </div>
          </div>
            <div className="mt-4 flex items-center gap-3">
            <button onClick={saveAsset} className="px-4 py-2 bg-blue-600 text-white rounded">{editingId ? 'Update Asset' : 'Save Asset'}</button>
            {editingId && <button onClick={() => { setEditingId(null); setName(''); setValue(0); setNote(''); }} className="px-4 py-2 bg-gray-300 text-slate-700 rounded">Cancel</button>}
            <button onClick={loadAssets} className="px-4 py-2 bg-gray-200 text-slate-700 rounded">Refresh</button>
            <div className="ml-auto font-mono">Total assets: <span className="font-bold">{format(total)}</span></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saved Assets</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <div>Loading…</div> : (
            assets.length === 0 ? <div className="text-slate-500">No assets</div> : (
              <div className="space-y-3">
                {assets.map(a => (
                  <div key={a.id} className="border rounded p-3 flex justify-between items-center">
                    <div>
                      <div className="font-medium">{a.name}</div>
                      <div className="text-xs text-slate-500">{a.note || ''} • {a.created_at ? new Date(a.created_at).toLocaleString() : ''}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="font-mono font-bold">{format(a.value)}</div>
                      <button onClick={() => handleEdit(a)} className="px-2 py-1 bg-amber-400 text-white rounded text-xs">Edit</button>
                      <button onClick={() => handleDelete(a.id)} className="px-2 py-1 bg-red-600 text-white rounded text-xs">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AssetsPage;
