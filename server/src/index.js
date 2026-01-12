const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const PORT = process.env.PORT || 4000;

app.get('/health', (_, res) => res.json({ ok: true }));

// GET /orders - fetch orders (simple proxy)
app.get('/orders', async (req, res) => {
  try {
    const { data, error } = await supabase.from('orders').select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json({ data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Unexpected error' });
  }
});

// POST /orders - create an order (safe insert then optional patch)
app.post('/orders', async (req, res) => {
  try {
    const payload = req.body;
    if (!payload || !payload.id) return res.status(400).json({ error: 'Missing payload or id' });

    const safeInsert = (({ costamount, created_at, ...rest }) => rest)(payload);
    const { data, error } = await supabase.from('orders').insert([safeInsert]).select('*');
    if (error) {
      // fallback try full payload
      const { data: d2, error: e2 } = await supabase.from('orders').insert([payload]).select('*');
      if (e2) return res.status(500).json({ error: e2.message });
      // attempt optional patch
      try {
        const optionalPatch = {};
        if (payload.costamount !== undefined) optionalPatch.costamount = payload.costamount;
        if (payload.created_at !== undefined) optionalPatch.created_at = payload.created_at;
        if (payload.deliveryaddress !== undefined) optionalPatch.deliveryaddress = payload.deliveryaddress;
        if (Object.keys(optionalPatch).length > 0) {
          await supabase.from('orders').update(optionalPatch).eq('id', payload.id);
        }
      } catch (e) { console.warn('optional patch failed', e); }
      return res.json({ data: d2 });
    }

    // try optional patch
    try {
      const optionalPatch = {};
      if (payload.costamount !== undefined) optionalPatch.costamount = payload.costamount;
      if (payload.created_at !== undefined) optionalPatch.created_at = payload.created_at;
      if (payload.deliveryaddress !== undefined) optionalPatch.deliveryaddress = payload.deliveryaddress;
      if (Object.keys(optionalPatch).length > 0) {
        await supabase.from('orders').update(optionalPatch).eq('id', payload.id);
      }
    } catch (e) { console.warn('optional patch failed', e); }

    res.json({ data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Unexpected insert error' });
  }
});

// POST /orders/:id/save-balances
app.post('/orders/:id/save-balances', async (req, res) => {
  try {
    const id = req.params.id;
    const { chequeBalance = 0, creditBalance = 0, returnAmount = 0, amountPaid = 0 } = req.body;
    const { error } = await supabase.from('orders').update({ chequebalance: chequeBalance, creditbalance: creditBalance, returnamount: returnAmount, amountpaid: amountPaid }).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });

    // upsert collection records for delivered orders – client can decide status
    if (req.body.createCollections) {
      const collectionRecords = [];
      if (chequeBalance > 0) collectionRecords.push({ order_id: id, customer_id: req.body.customerId || '', collection_type: 'cheque', amount: chequeBalance, status: 'pending', collected_by: req.body.collectedBy || '', created_at: req.body.collectionDate || new Date().toISOString() });
      if (creditBalance > 0) collectionRecords.push({ order_id: id, customer_id: req.body.customerId || '', collection_type: 'credit', amount: creditBalance, status: 'pending', collected_by: req.body.collectedBy || '', created_at: req.body.collectionDate || new Date().toISOString() });
      if (collectionRecords.length > 0) {
        await supabase.from('collections').upsert(collectionRecords, { onConflict: 'order_id,collection_type' });
      }
    }

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Unexpected error saving balances' });
  }
});

// POST /orders/:id/finalize - mark delivered (simplified)
app.post('/orders/:id/finalize', async (req, res) => {
  try {
    const id = req.params.id;
    const { sold = null } = req.body;
    const updatePayload = { status: 'Delivered' };
    if (typeof sold === 'number') updatePayload.sold = sold;
    const { error } = await supabase.from('orders').update(updatePayload).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });

    // Optionally apply targets or driver_allocations updates – keep this minimal here
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Unexpected finalize error' });
  }
});

app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
