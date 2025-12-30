import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { supabase } from '../../supabaseClient';

export const DailyTargets: React.FC = () => {
  const { currentUser } = useAuth();
  const { users, suppliers, products, refetchData } = useData();

  const salesReps = useMemo(() => (users || []).filter(u => (u.role || '').toLowerCase().includes('sales')), [users]);
  const categories = useMemo(() => {
    const set = new Set<string>();
    (products || []).forEach(p => { if (p.category) set.add(p.category); });
    return Array.from(set).sort();
  }, [products]);

  const [repId, setRepId] = useState<string>('');
  const [scopeType, setScopeType] = useState<'supplier'|'category'|'product'>('supplier');
  const [scopeId, setScopeId] = useState<string>('');
  const [targetDate, setTargetDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [amountTarget, setAmountTarget] = useState<string>('');
  const [quantityTarget, setQuantityTarget] = useState<string>('');
  const [carryOver, setCarryOver] = useState<boolean>(true);
  const [loading, setLoading] = useState(false);
  const [targets, setTargets] = useState<any[]>([]);
  const [availableAmount, setAvailableAmount] = useState<number | null>(null);
  const [availableQuantity, setAvailableQuantity] = useState<number | null>(null);
  const [inventoryWarning, setInventoryWarning] = useState<string | null>(null);
  const canModify = useMemo(() => {
    return currentUser && ['Admin', 'Manager', 'Secretary'].includes(currentUser.role || '');
  }, [currentUser]);

  const handleEditTarget = async (t: any) => {
    if (!canModify) return alert('You do not have permission to edit targets');
    try {
      const newAmtStr = window.prompt('Amount target (leave blank for none)', t.amount_target != null ? String(t.amount_target) : '');
      if (newAmtStr === null) return; // cancelled
      const newQtyStr = window.prompt('Quantity target (leave blank for none)', t.quantity_target != null ? String(t.quantity_target) : '');
      if (newQtyStr === null) return;

      const newAmt = newAmtStr.trim() === '' ? null : Number(newAmtStr);
      const newQty = newQtyStr.trim() === '' ? null : Number(newQtyStr);

      // adjust remaining by delta so that existing progress is preserved
      const oldAmt = t.amount_target != null ? Number(t.amount_target) : 0;
      const oldQty = t.quantity_target != null ? Number(t.quantity_target) : 0;
      const remAmt = t.remaining_amount != null ? Number(t.remaining_amount) : 0;
      const remQty = t.remaining_quantity != null ? Number(t.remaining_quantity) : 0;

      const deltaAmt = (newAmt != null ? Number(newAmt) : 0) - oldAmt;
      const deltaQty = (newQty != null ? Number(newQty) : 0) - oldQty;

      const newRemAmt = newAmt == null ? 0 : Math.max(0, remAmt + deltaAmt);
      const newRemQty = newQty == null ? 0 : Math.max(0, remQty + deltaQty);

      const { error } = await supabase.from('daily_targets').update({
        amount_target: newAmt,
        quantity_target: newQty,
        remaining_amount: newRemAmt,
        remaining_quantity: newRemQty,
        updated_at: new Date().toISOString(),
      }).eq('id', t.id);

      if (error) {
        console.error('Failed to update target', error);
        alert('Failed to update target: ' + error.message);
        return;
      }

      await refetchData();
      await fetchTargets();
      alert('Target updated');
    } catch (e) {
      console.error('Edit target error', e);
      alert('Unexpected error while editing target');
    }
  };

  const handleDeleteTarget = async (t: any) => {
    if (!canModify) return alert('You do not have permission to delete targets');
    if (!confirm('Delete this daily target? This action cannot be undone.')) return;
    try {
      const { error } = await supabase.from('daily_targets').delete().eq('id', t.id);
      if (error) {
        console.error('Failed to delete target', error);
        alert('Failed to delete target: ' + error.message);
        return;
      }
      await refetchData();
      await fetchTargets();
      alert('Target deleted');
    } catch (e) {
      console.error('Delete target exception', e);
      alert('Unexpected error while deleting target');
    }
  };

  const scopeOptions = useMemo(() => {
    if (scopeType === 'supplier') {
      // If a rep is selected and they have assigned suppliers, limit the options
      if (repId) {
        const rep = (users || []).find((u: any) => String(u.id) === String(repId));
        if (rep) {
          // support multiple possible field names for assigned suppliers
          const assignedIds: string[] = rep.assignedSupplierIds || rep.assignedSuppliers || [];
          const assignedNames: string[] = rep.assignedSupplierNames || [];
          if (Array.isArray(assignedIds) && assignedIds.length > 0) {
            return (suppliers || []).filter((s: any) => assignedIds.map(String).includes(String(s.id))).map((s: any) => ({ id: s.id, label: s.name }));
          }
          if (Array.isArray(assignedNames) && assignedNames.length > 0) {
            const nameSet = new Set(assignedNames.map((n: string) => String(n).toLowerCase()));
            return (suppliers || []).filter((s: any) => nameSet.has(String(s.name).toLowerCase())).map((s: any) => ({ id: s.id, label: s.name }));
          }
        }
      }
      return (suppliers || []).map(s => ({ id: s.id, label: s.name }));
    }
    if (scopeType === 'category') {
      // If a rep is selected, limit categories to those sold by the rep's assigned suppliers
      if (repId) {
        const rep = (users || []).find((u: any) => String(u.id) === String(repId));
        const assignedNames: string[] = rep?.assignedSupplierNames || [];
        if (Array.isArray(assignedNames) && assignedNames.length > 0) {
          const filtered = (products || []).filter((p: any) => assignedNames.map(String).map(s=>s.toLowerCase()).includes(String(p.supplier).toLowerCase()));
          const set = new Set<string>();
          filtered.forEach((p: any) => { if (p.category) set.add(p.category); });
          return Array.from(set).map(c => ({ id: c, label: c }));
        }
      }
      return categories.map(c => ({ id: c, label: c }));
    }

    // product scope
    if (scopeType === 'product') {
      if (repId) {
        const rep = (users || []).find((u: any) => String(u.id) === String(repId));
        const assignedNames: string[] = rep?.assignedSupplierNames || [];
        if (Array.isArray(assignedNames) && assignedNames.length > 0) {
          return (products || []).filter((p: any) => assignedNames.map(String).map(s=>s.toLowerCase()).includes(String(p.supplier).toLowerCase())).map(p => ({ id: p.id, label: `${p.name} (${p.sku || p.id})` }));
        }
      }
      return (products || []).map(p => ({ id: p.id, label: `${p.name} (${p.sku || p.id})` }));
    }
  }, [scopeType, suppliers, categories, products, repId, users]);

  // If scopeType is supplier and a rep is selected, ensure scopeId remains valid
  useEffect(() => {
    if (!repId) return;
    const allowed = scopeOptions.map((s: any) => String(s.id));
    if (scopeId && !allowed.includes(String(scopeId))) {
      setScopeId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repId, scopeType, targets, users, suppliers, products]);

  const repSelectRef = useRef<HTMLSelectElement | null>(null);
  const scopeSelectRef = useRef<HTMLSelectElement | null>(null);

  const clearFormAndBlur = () => {
    setRepId(''); setScopeId(''); setAmountTarget(''); setQuantityTarget(''); setCarryOver(true); setScopeType('supplier');
    // blur selects to ensure UI shows placeholder state
    try { repSelectRef.current?.blur(); scopeSelectRef.current?.blur(); } catch { }
  };

  const handleAmountChange = (val: string) => {
    // Accept empty
    if (val.trim() === '') {
      setAmountTarget('');
      setInventoryWarning(null);
      return;
    }
    // Normalize number
    const num = Number(val);
    if (isNaN(num)) {
      setAmountTarget(val);
      return;
    }
    if (availableAmount != null && num > availableAmount) {
      setAmountTarget(String(availableAmount));
      setInventoryWarning(`Amount capped to available: ${availableAmount}`);
    } else {
      setAmountTarget(String(num));
      setInventoryWarning(null);
    }
  };

  const handleQuantityChange = (val: string) => {
    if (val.trim() === '') {
      setQuantityTarget('');
      setInventoryWarning(null);
      return;
    }
    const num = Number(val);
    if (isNaN(num)) {
      setQuantityTarget(val);
      return;
    }
    if (availableQuantity != null && num > availableQuantity) {
      setQuantityTarget(String(availableQuantity));
      setInventoryWarning(`Quantity capped to available: ${availableQuantity}`);
    } else {
      setQuantityTarget(String(num));
      setInventoryWarning(null);
    }
  };

  // Compute available inventory (amount and quantity) for the selected scope
  useEffect(() => {
    try {
      setInventoryWarning(null);
      setAvailableAmount(null);
      setAvailableQuantity(null);
      if (!scopeType) return;
      if (scopeType === 'product') {
        const prod = (products || []).find((p: any) => String(p.id) === String(scopeId));
        if (prod) {
          const stock = Number(prod.stock || 0);
          const price = Number(prod.price || 0);
          setAvailableQuantity(stock);
          setAvailableAmount(Number((stock * price).toFixed(2)));
        }
      } else if (scopeType === 'supplier') {
        // If specific supplier selected, sum all products for that supplier
        const supId = scopeId || null;
        let matched: any[] = [];
        if (supId) {
          const supplierObj = (suppliers || []).find((s: any) => String(s.id) === String(supId));
          if (supplierObj) {
            matched = (products || []).filter((p: any) => String(p.supplier) === String(supplierObj.name) || String(p.supplier) === String(supplierObj.id));
          } else {
            matched = (products || []).filter((p: any) => String(p.supplier) === String(supId));
          }
        } else {
          // (All) - consider whole inventory across all suppliers
          matched = products || [];
        }
        const totalQty = matched.reduce((s: number, p: any) => s + (Number(p.stock || 0)), 0);
        const totalAmt = matched.reduce((s: number, p: any) => s + (Number(p.stock || 0) * Number(p.price || 0)), 0);
        setAvailableQuantity(totalQty);
        setAvailableAmount(Number(totalAmt.toFixed(2)));
      } else if (scopeType === 'category') {
        if (!scopeId) return;
        const matched = (products || []).filter((p: any) => String(p.category) === String(scopeId));
        const totalQty = matched.reduce((s: number, p: any) => s + (Number(p.stock || 0)), 0);
        const totalAmt = matched.reduce((s: number, p: any) => s + (Number(p.stock || 0) * Number(p.price || 0)), 0);
        setAvailableQuantity(totalQty);
        setAvailableAmount(Number(totalAmt.toFixed(2)));
      }
    } catch (e) {
      console.warn('Failed to compute available inventory', e);
      setAvailableAmount(null);
      setAvailableQuantity(null);
    }
  }, [scopeType, scopeId, products, suppliers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repId) return alert('Please select Sales Rep');
    if (!scopeType) return alert('Please select scope type');

    let amt = amountTarget.trim() === '' ? null : Number(amountTarget);
    let qty = quantityTarget.trim() === '' ? null : Number(quantityTarget);

    // Cap by available inventory if we computed it
    if (amt != null && availableAmount != null && amt > availableAmount) {
      setInventoryWarning(`Amount target reduced to available inventory: ${availableAmount}`);
      amt = availableAmount;
      setAmountTarget(String(availableAmount));
    }
    if (qty != null && availableQuantity != null && qty > availableQuantity) {
      setInventoryWarning(`Quantity target reduced to available inventory: ${availableQuantity}`);
      qty = availableQuantity;
      setQuantityTarget(String(availableQuantity));
    }

    const payload: any = {
      rep_id: repId,
      scope_type: scopeType,
      scope_id: scopeId || null,
      target_date: targetDate,
      amount_target: amt,
      quantity_target: qty,
      remaining_amount: amt || 0,
      remaining_quantity: qty || 0,
      carry_over: carryOver,
      created_by: currentUser?.id || null,
    };

    // If carryOver is enabled, fetch the previous day's target and move leftover into today's payload
    if (carryOver) {
      try {
        const prevDate = new Date(targetDate);
        prevDate.setDate(prevDate.getDate() - 1);
        const prevDateStr = prevDate.toISOString().slice(0,10);

        let sel = supabase.from('daily_targets').select('*').eq('rep_id', repId).eq('scope_type', scopeType).eq('target_date', prevDateStr);
        sel = scopeId ? sel.eq('scope_id', scopeId) : sel.is('scope_id', null);
        const { data: prevTargets, error: prevErr } = await sel.limit(1).maybeSingle();
        if (!prevErr && prevTargets && prevTargets.id) {
          const prevRemAmt = Number(prevTargets.remaining_amount || 0);
          const prevRemQty = Number(prevTargets.remaining_quantity || 0);
          // Only move positive leftovers
          if (prevRemAmt > 0 || prevRemQty > 0) {
            // Add leftovers to today's payload
            payload.amount_target = (payload.amount_target || 0) + prevRemAmt;
            payload.remaining_amount = (payload.remaining_amount || 0) + prevRemAmt;
            payload.quantity_target = (payload.quantity_target || 0) + prevRemQty;
            payload.remaining_quantity = (payload.remaining_quantity || 0) + prevRemQty;

            // Zero previous day's remaining values (mark carried)
            try {
              await supabase.from('daily_targets').update({ remaining_amount: 0, remaining_quantity: 0, updated_at: new Date().toISOString() }).eq('id', prevTargets.id);
            } catch (e) {
              console.warn('Failed to zero previous day remaining during carry-over:', e);
            }
          }
        }
      } catch (e) {
        console.warn('Carry-over check failed, continuing without carry:', e);
      }
    }

    try {
      setLoading(true);
      // Try upsert first (preferred). If DB doesn't have the unique constraint
      // PostgREST will return 42P10. In that case fall back to select->update/insert.
      const { data, error } = await supabase
        .from('daily_targets')
        .upsert([payload], { onConflict: 'rep_id,scope_type,scope_id,target_date' })
        .select();
      if (error) {
        console.warn('Upsert returned error, attempting fallback insert/update', error);
        // If error indicates missing column (e.g., carry_over not present in older schema),
        // retry the upsert/insert without that field so older DBs still work.
        const msg = (error.message || '').toLowerCase();
        if (error.code === 'PGRST204' || msg.includes('carry_over') || msg.includes("could not find the 'carry_over'")) {
          try {
            const payloadNoCarry: any = { ...payload };
            delete payloadNoCarry.carry_over;
            const { data: d2, error: err2 } = await supabase
              .from('daily_targets')
              .upsert([payloadNoCarry], { onConflict: 'rep_id,scope_type,scope_id,target_date' })
              .select();
            if (!err2) {
              if (inventoryWarning) alert(inventoryWarning);
              alert('Daily target saved');
              await refetchData();
              clearFormAndBlur();
              return;
            }
            console.warn('Retry without carry_over failed', err2);
            // continue to fallback handling below
          } catch (retryEx) {
            console.warn('Retry without carry_over exception', retryEx);
          }
        }
        // If error indicates missing unique constraint, perform manual upsert
        if (error.code === '42P10' || (error.message || '').includes('no unique or exclusion constraint')) {
          // Build selector
          let sel: any = supabase.from('daily_targets').select('*');
          sel = sel.eq('rep_id', repId).eq('scope_type', scopeType).eq('target_date', targetDate);
          sel = scopeId ? sel.eq('scope_id', scopeId) : sel.is('scope_id', null);
          const { data: existing, error: selErr } = await sel.limit(1).maybeSingle();
          if (selErr) {
            console.error('Select existing daily target failed', selErr);
            alert('Failed to check existing target: ' + selErr.message);
            return;
          }

          if (existing && existing.id) {
            const { error: updErr } = await supabase.from('daily_targets').update({
              amount_target: amt,
              quantity_target: qty,
              remaining_amount: amt || 0,
              remaining_quantity: qty || 0,
              created_by: currentUser?.id || null,
              updated_at: new Date().toISOString(),
            }).eq('id', existing.id);
            if (updErr) {
              console.error('Update daily target failed', updErr);
              alert('Failed to update target: ' + updErr.message);
              return;
            }
          } else {
            const { error: insErr } = await supabase.from('daily_targets').insert([payload]).select();
            if (insErr) {
              console.error('Insert daily target fallback failed', insErr);
              alert('Failed to insert target: ' + insErr.message);
              return;
            }
          }

          alert('Daily target saved');
          await refetchData();
          clearFormAndBlur();
          return;
        }

        // Other errors
        console.error('Insert daily target error', error);
        if ((error.message || '').includes('Could not find the')) {
          alert('Failed to save target: DB schema missing column. Run migration and refresh Supabase schema.');
        } else {
          alert('Failed to save target: ' + error.message);
        }
        return;
      }

      // Success path
      if (inventoryWarning) alert(inventoryWarning);
      alert('Daily target saved');

      // Ensure next day's default exists: if there's no target for targetDate + 1,
      // create a copy so the target set once becomes the default for the next day.
      try {
        const nextDate = new Date(targetDate);
        nextDate.setDate(nextDate.getDate() + 1);
        const nextDateStr = nextDate.toISOString().slice(0,10);

        let selNext: any = supabase.from('daily_targets').select('id').eq('rep_id', repId).eq('scope_type', scopeType).eq('target_date', nextDateStr);
        selNext = scopeId ? selNext.eq('scope_id', scopeId) : selNext.is('scope_id', null);
        const { data: existingNext, error: nextErr } = await selNext.limit(1).maybeSingle();
        if (!nextErr && (!existingNext || !existingNext.id)) {
          const copyPayload: any = {
            rep_id: repId,
            scope_type: scopeType,
            scope_id: scopeId || null,
            target_date: nextDateStr,
            amount_target: amt,
            quantity_target: qty,
            remaining_amount: amt || 0,
            remaining_quantity: qty || 0,
            carry_over: false,
            created_by: currentUser?.id || null,
          };
          const { error: insNextErr } = await supabase.from('daily_targets').insert([copyPayload]);
          if (insNextErr) console.warn('Failed to create next day default target', insNextErr);
        }
      } catch (e) {
        console.warn('Next-day default creation failed', e);
      }

      await refetchData();
      // reset form and blur selects so placeholder shows
      clearFormAndBlur();
    } finally {
      setLoading(false);
    }
  };

  const fetchTargets = async (date?: string) => {
    try {
      const d = date || targetDate;
      const { data, error } = await supabase.from('daily_targets').select('*').eq('target_date', d).order('rep_id', { ascending: true });
      if (error) {
        console.error('Fetch daily targets error', error);
        setTargets([]);
        return;
      }

      // If no targets for this date, attempt to copy previous day's targets
      if ((!data || data.length === 0) && d) {
        try {
          const prev = new Date(d);
          prev.setDate(prev.getDate() - 1);
          const prevStr = prev.toISOString().slice(0,10);
          const { data: prevData, error: prevErr } = await supabase.from('daily_targets').select('*').eq('target_date', prevStr);
          if (!prevErr && prevData && prevData.length > 0) {
            // Build copies for current date
            const copies = prevData.map((p: any) => ({
              rep_id: p.rep_id,
              scope_type: p.scope_type,
              scope_id: p.scope_id || null,
              target_date: d,
              amount_target: p.amount_target,
              quantity_target: p.quantity_target,
              remaining_amount: p.amount_target || 0,
              remaining_quantity: p.quantity_target || 0,
              carry_over: false,
              created_by: p.created_by || currentUser?.id || null,
            }));

            const { data: insData, error: insErr } = await supabase.from('daily_targets').insert(copies).select();
            if (insErr) {
              console.warn('Failed to create copies for empty date', insErr);
              setTargets([]);
              return;
            }
            setTargets(insData || []);
            return;
          }
        } catch (e) {
          console.warn('Auto-copy prev-day targets failed', e);
        }
      }

      setTargets(data || []);
    } catch (err) {
      console.error('Fetch targets exception', err);
      setTargets([]);
    }
  };

  useEffect(() => {
    fetchTargets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetDate]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Daily Targets</h1>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
        <div>
          <label className="block text-sm font-medium mb-1">Sales Rep</label>
          <select ref={repSelectRef} value={repId} onChange={e => setRepId(e.target.value)} className="w-full p-2 border rounded bg-transparent text-white placeholder:text-slate-300">
            <option value="">Select Sales Rep</option>
            {salesReps.map(u => <option key={u.id} value={u.id}>{u.name || u.email || u.id}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Scope Type</label>
          <select value={scopeType} onChange={e => { setScopeType(e.target.value as any); setScopeId(''); }} className="w-full p-2 border rounded bg-transparent text-white">
            <option value="supplier">Supplier</option>
            <option value="category">Category</option>
            <option value="product">Product</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Scope</label>
          <select ref={scopeSelectRef} value={scopeId} onChange={e => setScopeId(e.target.value)} className="w-full p-2 border rounded bg-transparent text-white">
            {/* If a Sales Rep is selected and they have assigned suppliers, do not show (All) for supplier scope */}
            {!(scopeType === 'supplier' && repId && ((users || []).find((u:any)=>String(u.id)===String(repId))?.assignedSupplierNames || []).length > 0) && (
              <option value="">(All)</option>
            )}

            {/* Product scope: group products by supplier using optgroup for easier selection */}
            {scopeType === 'product' ? (
              (() => {
                try {
                  // Determine allowed products (apply rep filter if present)
                  const rep = repId ? (users || []).find((u:any)=>String(u.id)===String(repId)) : null;
                  const assignedNames: string[] = rep?.assignedSupplierNames || [];
                  let allowedProducts = (products || []);
                  if (rep && Array.isArray(assignedNames) && assignedNames.length > 0) {
                    const nameSet = new Set(assignedNames.map((n:string)=>String(n).toLowerCase()));
                    allowedProducts = allowedProducts.filter((p:any) => nameSet.has(String(p.supplier).toLowerCase()));
                  }

                  // Group by supplier label (attempt to map supplier id -> supplier.name when possible)
                  const groups = new Map<string, any[]>();
                  for (const p of allowedProducts) {
                    let supplierLabel = String(p.supplier || 'Unassigned');
                    try {
                      const supObj = (suppliers || []).find((s:any) => String(s.id) === String(p.supplier) || String(s.name).toLowerCase() === String(p.supplier).toLowerCase());
                      if (supObj && supObj.name) supplierLabel = supObj.name;
                    } catch { /* ignore */ }
                    if (!groups.has(supplierLabel)) groups.set(supplierLabel, []);
                    groups.get(supplierLabel).push(p);
                  }

                  const entries = Array.from(groups.entries()).sort((a,b) => a[0].localeCompare(b[0]));
                  return entries.map(([supplierLabel, prods]) => (
                    <optgroup key={supplierLabel} label={supplierLabel}>
                      {prods.map((p:any) => (
                        <option key={p.id} value={p.id}>{`${p.name} (${p.sku || p.id})`}</option>
                      ))}
                    </optgroup>
                  ));
                } catch (e) {
                  console.warn('Failed to build grouped product options', e);
                  return scopeOptions.map((o:any) => <option key={o.id} value={o.id}>{o.label}</option>);
                }
              })()
            ) : (
              scopeOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)
            )}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Date</label>
          <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} className="w-full p-2 border rounded bg-transparent text-white" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Amount Target</label>
            <input
              type="number"
              step="0.01"
              value={amountTarget}
              onChange={e => handleAmountChange(e.target.value)}
              className="w-full p-2 border rounded bg-transparent text-white"
            />
            {availableAmount != null && (
              <div className="text-xs text-slate-300 mt-1">Available amount: {availableAmount}</div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Quantity Target</label>
            <input
              type="number"
              value={quantityTarget}
              onChange={e => handleQuantityChange(e.target.value)}
              className="w-full p-2 border rounded bg-transparent text-white"
            />
            {availableQuantity != null && (
              <div className="text-xs text-slate-300 mt-1">Available quantity: {availableQuantity}</div>
            )}
          </div>
        </div>
        {inventoryWarning && (
          <div className="text-sm text-red-400 mt-2">{inventoryWarning}</div>
        )}

        <div className="flex items-center space-x-2">
          <input id="carry" type="checkbox" checked={carryOver} onChange={e => setCarryOver(e.target.checked)} />
          <label htmlFor="carry" className="text-sm">Carry leftover to next day</label>
        </div>

        <div>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
            disabled={loading || (
              (amountTarget.trim() !== '' && availableAmount != null && Number(amountTarget) > availableAmount) ||
              (quantityTarget.trim() !== '' && availableQuantity != null && Number(quantityTarget) > availableQuantity)
            )}
          >
            {loading ? 'Saving...' : 'Save Target'}
          </button>
        </div>
      </form>
      
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-3">Targets for {targetDate}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse text-white">
              <thead>
                <tr className="text-left bg-slate-100 dark:bg-slate-700">
                  <th className="px-3 py-2">Sales Rep</th>
                  <th className="px-3 py-2">Scope</th>
                  <th className="px-3 py-2">Amount Target</th>
                  <th className="px-3 py-2">Remaining Amount</th>
                  <th className="px-3 py-2">Quantity Target</th>
                  <th className="px-3 py-2">Remaining Qty</th>
                  {canModify && <th className="px-3 py-2">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {targets.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-4 text-slate-500">No targets for this date</td></tr>
                )}
                {targets.map(t => {
                  const rep = (users || []).find(u => String(u.id) === String(t.rep_id));
                  let scopeLabel = '(All)';
                  if (t.scope_type === 'supplier') {
                    const s = (suppliers || []).find((sp: any) => String(sp.id) === String(t.scope_id));
                    scopeLabel = s ? s.name : (t.scope_id || '(All)');
                  } else if (t.scope_type === 'category') {
                    scopeLabel = t.scope_id || '(All)';
                  } else if (t.scope_type === 'product') {
                    const p = (products || []).find((pr: any) => String(pr.id) === String(t.scope_id));
                    scopeLabel = p ? `${p.name}` : (t.scope_id || '(All)');
                  }
                  return (
                    <tr key={t.id} className="border-t">
                      <td className="px-3 py-2">{rep ? (rep.name || rep.email) : t.rep_id}</td>
                      <td className="px-3 py-2">{t.scope_type} — {scopeLabel}</td>
                      <td className="px-3 py-2">{t.amount_target != null ? t.amount_target : '-'}</td>
                      <td className="px-3 py-2">{t.remaining_amount != null ? t.remaining_amount : '-'}</td>
                      <td className="px-3 py-2">{t.quantity_target != null ? t.quantity_target : '-'}</td>
                      <td className="px-3 py-2">{t.remaining_quantity != null ? t.remaining_quantity : '-'}</td>
                      {canModify && (
                        <td className="px-3 py-2">
                          <button onClick={() => handleEditTarget(t)} className="mr-2 px-2 py-1 bg-yellow-400 text-black rounded">Edit</button>
                          <button onClick={() => handleDeleteTarget(t)} className="px-2 py-1 bg-red-600 text-white rounded">Delete</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
    </div>
  );
};

export default DailyTargets;
