import { createClient } from '@supabase/supabase-js';

// NOTE: This script updates the `orders` table's `orderitems` JSON to include
// `costPrice` and `marginPrice` for each product entry. It defaults to a dry-run
// and will not write anything unless you run it with `DRY_RUN=false`.

const supabaseUrl = 'https://xsoptewtyrogfepnpsde.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzb3B0ZXd0eXJvZ2ZlcG5wc2RlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1NjE0NTcsImV4cCI6MjA3MzEzNzQ1N30.y42ifDCqqbmK5cnpOxLLA796XMNG1w6EbmuibHgX1PI';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const DRY_RUN = process.env.DRY_RUN !== 'false';

function normalizeNumber(v) {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

async function run() {
  console.log('Starting orderitems cost/margin enrichment. DRY_RUN=', DRY_RUN);

  // Load products and map by id
  const { data: products, error: prodErr } = await supabase.from('products').select('id,marginprice,costprice');
  if (prodErr) {
    console.error('Could not fetch products:', prodErr);
    process.exit(1);
  }

  const productMap = new Map();
  for (const p of products || []) {
    productMap.set(p.id, {
      costPrice: normalizeNumber(p.costprice),
      marginPrice: normalizeNumber(p.marginprice),
    });
  }

  // Fetch orders (id, orderitems and status)
  const { data: orders, error: ordErr } = await supabase.from('orders').select('id,orderitems,status');
  if (ordErr) {
    console.error('Could not fetch orders:', ordErr);
    process.exit(1);
  }

  let updatedCount = 0;
  let totalOrders = 0;

  for (const row of orders || []) {
    totalOrders++;
    const orderId = row.id;
    let items = row.orderitems;

    if (!items) continue;

    // Handle stringified JSON
    if (typeof items === 'string') {
      try {
        items = JSON.parse(items);
      } catch (e) {
        console.warn(`Skipping order ${orderId}: orderitems is invalid JSON`);
        continue;
      }
    }

    if (!Array.isArray(items)) continue;

    // Compute per-item cost/margin and totals. For Delivered orders we DO NOT overwrite
    // existing item.costPrice/item.marginPrice; we only compute totals from what's present.
    const isDelivered = String(row.status).toLowerCase() === 'delivered';
    let changed = false;
    let totalCost = 0;
    let totalMargin = 0;

    for (const it of items) {
      const pid = it.productId || it.productid || it.product_id || (it.productId && it.productId.toString());
      const qty = normalizeNumber(it.quantity);

      let itemCost = normalizeNumber(it.costPrice);
      let itemMargin = normalizeNumber(it.marginPrice);

      if (!isDelivered) {
        // For non-delivered orders attempt to source latest values from products
        const prod = productMap.get(pid);
        if (prod) {
          if (itemCost !== prod.costPrice) {
            it.costPrice = prod.costPrice;
            itemCost = prod.costPrice;
            changed = true;
          }
          if (itemMargin !== prod.marginPrice) {
            it.marginPrice = prod.marginPrice;
            itemMargin = prod.marginPrice;
            changed = true;
          }
        }
      }

      // Use whatever values are present (either existing or sourced)
      totalCost += itemCost * qty;
      totalMargin += itemMargin * qty;
    }

    // Round totals to 2 decimals
    totalCost = Math.round(totalCost * 100) / 100;
    totalMargin = Math.round(totalMargin * 100) / 100;

    // Determine whether DB update required: changed items OR totals mismatch
    const needUpdate = changed || true; // we'll update totals always to ensure values exist
    if (needUpdate) {
      updatedCount++;
      console.log(`Order ${orderId} will be updated (items: ${items.length}) - Delivered=${isDelivered}. Totals: cost=${totalCost}, margin=${totalMargin}`);
      if (!DRY_RUN) {
        const payload = {
          orderitems: JSON.stringify(items),
          total_cost_price: totalCost,
          total_margin_price: totalMargin,
        };
        const { error: upErr } = await supabase.from('orders').update(payload).eq('id', orderId);
        if (upErr) {
          console.error(`Failed to update order ${orderId}:`, upErr);
        } else {
          console.log(`Order ${orderId} updated.`);
        }
      }
    }
  }

  console.log(`Processed ${totalOrders} orders, ${updatedCount} require updates.`);
  if (DRY_RUN) console.log('Dry-run mode: no changes were written. To apply changes set DRY_RUN=false');
}

run().catch(err => {
  console.error('Migration script failed:', err);
  process.exit(1);
});
