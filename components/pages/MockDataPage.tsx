import React, { useState } from 'react';
import { mockProducts, mockCustomers, mockUsers, mockOrders, mockSuppliers, mockExpenses } from '../../data/mockData';
import { supabase } from '../../supabaseClient';

const MockDataPage: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const appendLog = (msg: string) => setLog(l => [msg, ...l]);

  const seed = async () => {
    setBusy(true);
    setLog([]);
    try {
      appendLog('Seeding products...');
      const { error: prodErr } = await supabase.from('products').upsert(mockProducts.map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
        price: p.price,
        // Seed both marginprice (new) and costprice (legacy) for compatibility
        marginprice: (p as any).marginPrice ?? (p as any).costPrice ?? null,
        costprice: (p as any).costPrice ?? null,
        stock: p.stock,
        sku: p.sku,
        supplier: p.supplier,
        imageurl: p.imageUrl,
      })), { onConflict: 'id' });
      appendLog(prodErr ? `Products error: ${prodErr.message}` : 'Products seeded');

      appendLog('Seeding customers...');
      const { error: custErr } = await supabase.from('customers').upsert(mockCustomers.map(c => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        location: c.location,
        joindate: c.joinDate,
        avatarurl: c.avatarUrl,
  })), { onConflict: 'id' });
      appendLog(custErr ? `Customers error: ${custErr.message}` : 'Customers seeded');

      appendLog('Seeding suppliers...');
      const { error: suppErr } = await supabase.from('suppliers').upsert(mockSuppliers.map(s => ({
        id: s.id,
        name: s.name,
        contactperson: s.contactPerson,
        email: s.email,
        phone: s.phone,
        address: s.address,
        joindate: s.joinDate,
  })), { onConflict: 'id' });
      appendLog(suppErr ? `Suppliers error: ${suppErr.message}` : 'Suppliers seeded');

      appendLog('Seeding users... (passwords stored in mock only — create real accounts separately)');
      const { error: usersErr } = await supabase.from('users').upsert(mockUsers.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        status: u.status,
        avatarurl: u.avatarUrl,
  })), { onConflict: 'id' });
      appendLog(usersErr ? `Users error: ${usersErr.message}` : 'Users seeded');

      appendLog('Seeding orders...');
      // Orders in DB expect certain column names; map fields accordingly
      const ordersPayload = mockOrders.map(o => ({
        id: o.id,
        customerid: o.customerId,
        customername: o.customerName,
        orderdate: o.date,
        expecteddeliverydate: o.expectedDeliveryDate || null,
        totalamount: o.total,
        status: o.status,
        assigneduserid: o.assignedUserId || null,
        orderitems: JSON.stringify(o.orderItems || []),
      }));
      const { error: ordersErr } = await supabase.from('orders').upsert(ordersPayload, { onConflict: 'id' });
      appendLog(ordersErr ? `Orders error: ${ordersErr.message}` : 'Orders seeded');

      appendLog('Seeding expenses...');
      // Check auth: expenses table has RLS that requires an authenticated user.
      const { data: authData } = await supabase.auth.getUser();
      const user = (authData as any)?.user || null;
      if (!user) {
        appendLog('Skipping expenses: you are not signed in. Supabase Row Level Security requires an authenticated user to INSERT into `expenses`.');
        appendLog('Options: 1) Sign in via the app and re-run seeding, or 2) run a dev SQL policy to allow inserts (see README).');
      } else {
        const { error: expErr } = await supabase.from('expenses').upsert((mockExpenses || []).map(e => ({
          id: e.id,
          date: e.date,
          amount: e.amount,
          category: e.category,
          note: e.note,
        })), { onConflict: 'id' });
        appendLog(expErr ? `Expenses error: ${expErr.message}` : 'Expenses seeded');
      }

      appendLog('Seeding complete');
    } catch (e: any) {
      appendLog(`Unexpected error: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold mb-4">Mock Data & Seeder</h2>
      <p className="mb-4">This page shows the in-repo mock dataset and provides a one-click seeding action to insert/upsert it into your Supabase project (use only in development).</p>

      <div className="mb-4">
        <button onClick={seed} disabled={busy} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-60">
          {busy ? 'Seeding...' : 'Seed to Supabase'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded shadow">
          <h3 className="font-medium mb-2">Products ({mockProducts.length})</h3>
          <ul className="text-sm">
            {mockProducts.map(p => (
              <li key={p.id} className="py-1 border-b border-slate-100 dark:border-slate-700">{p.id} — {p.name} — stock: {p.stock}</li>
            ))}
          </ul>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded shadow">
          <h3 className="font-medium mb-2">Customers ({mockCustomers.length})</h3>
          <ul className="text-sm">
            {mockCustomers.map(c => (
              <li key={c.id} className="py-1 border-b border-slate-100 dark:border-slate-700">{c.id} — {c.name} — {c.phone}</li>
            ))}
          </ul>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded shadow">
          <h3 className="font-medium mb-2">Users ({mockUsers.length})</h3>
          <ul className="text-sm">
            {mockUsers.map(u => (
              <li key={u.id} className="py-1 border-b border-slate-100 dark:border-slate-700">{u.id} — {u.name} — {u.role}</li>
            ))}
          </ul>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded shadow">
          <h3 className="font-medium mb-2">Orders ({mockOrders.length})</h3>
          <ul className="text-sm">
            {mockOrders.map(o => (
              <li key={o.id} className="py-1 border-b border-slate-100 dark:border-slate-700">{o.id} — {o.customerName} — {o.total} — {o.status}</li>
            ))}
          </ul>
        </div>
        
        <div className="bg-white dark:bg-slate-800 p-4 rounded shadow">
          <h3 className="font-medium mb-2">Expenses ({mockExpenses.length})</h3>
          <ul className="text-sm">
            {mockExpenses.map(e => (
              <li key={e.id} className="py-1 border-b border-slate-100 dark:border-slate-700">{e.id} — {e.date} — {e.category} — {e.amount}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-6 bg-white dark:bg-slate-800 p-4 rounded shadow">
        <h3 className="font-medium mb-2">Action log</h3>
        <div className="h-40 overflow-auto text-sm font-mono bg-slate-50 dark:bg-slate-900 p-2 rounded">
          {log.length === 0 ? <div className="text-slate-500">No actions yet</div> : (
            <ul>
              {log.map((l, i) => <li key={i} className="py-1">{l}</li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default MockDataPage;
