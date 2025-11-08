import React, { useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { useData } from '../../contexts/DataContext';
import { supabase } from '../../supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { OrderStatus, DriverAllocation } from '../../types';
import html2pdf from 'html2pdf.js';
import { COMPANY_DETAILS } from '../../constants';

// Deliveries page: group orders by expected delivery date, aggregate product quantities
export const Deliveries: React.FC = () => {
  const { orders, products, users, driverAllocations, setDriverAllocations, refetchData, deliveryAggregatedProducts, setDeliveryAggregatedProducts } = useData();
  // Allow selecting multiple dates to combine allocations/aggregation
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [allocatingToDriver, setAllocatingToDriver] = useState<string | null>(null);
  const [allocationsLocal, setAllocationsLocal] = useState<Record<string, { productId: string; qty: number }[]>>({});
  const [loading, setLoading] = useState(false);

  // Group orders by expectedDeliveryDate (or order date if missing)
  const ordersByDate = useMemo(() => {
    // Only include orders that are Pending (exclude already Delivered)
    return orders.reduce((acc: Record<string, any[]>, order) => {
      if (order.status !== OrderStatus.Pending) return acc;
      const date = (order.expectedDeliveryDate || order.date || '').slice(0, 10) || 'unspecified';
      if (!acc[date]) acc[date] = [];
      acc[date].push(order);
      return acc;
    }, {} as Record<string, any[]>);
  }, [orders]);

  // Aggregate products for all selected dates combined
  const aggregatedProducts = useMemo(() => {
    if (!selectedDates || selectedDates.size === 0) return [];
    console.log('🔍 AGGREGATION DEBUG - Selected dates:', Array.from(selectedDates));
    console.log('🔍 AGGREGATION DEBUG - ordersByDate:', ordersByDate);
    
    const map = new Map<string, number>();
    Array.from(selectedDates).forEach(selDate => {
      const dateOrders = ordersByDate[selDate] || [];
      console.log(`🔍 Orders for date ${selDate}:`, dateOrders.length, dateOrders);
      
      // Check for duplicate orders
      const orderIds = dateOrders.map(o => o.id);
      const uniqueOrderIds = [...new Set(orderIds)];
      if (orderIds.length !== uniqueOrderIds.length) {
        console.warn(`⚠️ DUPLICATE ORDERS found for date ${selDate}:`, orderIds.length, 'total,', uniqueOrderIds.length, 'unique');
      }
      
      dateOrders.forEach((order, orderIndex) => {
        console.log(`🔍 Processing order ${orderIndex + 1}/${dateOrders.length} (ID: ${order.id}):`, order.orderItems);
        (order.orderItems || []).forEach((item: any) => {
          const prev = map.get(item.productId) || 0;
          const newTotal = prev + (item.quantity || 0);
          console.log(`📦 Product ${item.productId}: adding ${item.quantity}, total becomes ${newTotal}`);
          map.set(item.productId, newTotal);
        });
      });
    });
    
    const result = Array.from(map.entries()).map(([productId, qty]) => ({ productId, qty }));
    console.log('🔍 Final aggregated products:', result);
    return result;
  }, [ordersByDate, selectedDates]);

  // Publish per-date aggregated products into DataContext so other pages (Drivers) can consume
  React.useEffect(() => {
    if (!setDeliveryAggregatedProducts) return;
    // Build map for each selected date individually so Drivers can import per-date lists
    const perDate: Record<string, { productId: string; qty: number }[]> = {};
    if (selectedDates && selectedDates.size > 0) {
      Array.from(selectedDates).forEach(selDate => {
        const dateOrders = ordersByDate[selDate] || [];
        const map = new Map<string, number>();
        dateOrders.forEach(order => {
          (order.orderItems || []).forEach((item: any) => {
            const prev = map.get(item.productId) || 0;
            map.set(item.productId, prev + (item.quantity || 0));
          });
        });
        const key = String(selDate);
        perDate[key] = Array.from(map.entries()).map(([productId, qty]) => ({ productId, qty }));
      });
    }
    setDeliveryAggregatedProducts(prev => ({ ...prev, ...perDate }));
  }, [selectedDates, ordersByDate, setDeliveryAggregatedProducts]);

  const drivers = users.filter(u => u.role === 'Driver');

  // Modal state for allocating directly from the date list
  const [dateAllocateModal, setDateAllocateModal] = useState<{ date: string } | null>(null);
  const [dateAllocateDriver, setDateAllocateDriver] = useState<string>('');

  // Set of dates that already have an allocation (any driver)
  const allocatedDates = React.useMemo(() => {
    const set = new Set<string>();
    // Only consider allocations that are still active (not reconciled).
    (driverAllocations || []).forEach((a: any) => {
      if (!a || !a.date) return;
      const status = (a.status ?? 'Allocated');
      if (status === 'Reconciled') return; // treat reconciled as not allocated
      set.add(a.date.slice ? a.date.slice(0, 10) : a.date);
    });
    return set;
  }, [driverAllocations]);

  const handleAllocate = async (driverId: string) => {
    if (!selectedDates || selectedDates.size === 0) return;
    if (aggregatedProducts.length === 0) {
      alert('No products to allocate for the selected date.');
      return;
    }
    // Warn about any already-allocated dates and skip them
    try {
      const already = Array.from(selectedDates).filter(d => allocatedDates.has(d));
      if (already.length > 0) {
        alert('Some selected dates are already allocated and will be skipped: ' + already.join(', '));
      }
    } catch (err) {
      console.warn('Failed to check existing allocations:', err);
    }

    // Build allocation record for driver - clean version
    const items = aggregatedProducts.map(p => ({ productId: p.productId, quantity: p.qty }));
    setLoading(true);
    // Insert into Supabase driver_allocations table
    try {
      const datesToInsert = Array.from(selectedDates).filter(d => !allocatedDates.has(d));
      const driverName = users.find(u => u.id === driverId)?.name || '';
      const payload = datesToInsert.map(d => ({
        driver_id: driverId,
        driver_name: driverName,
        date: d,
        allocated_items: JSON.stringify(items),
        returned_items: null,
        sales_total: 0,
        status: 'Allocated',
      }));
      if (payload.length === 0) {
        setLoading(false);
        alert('All selected dates were already allocated. Nothing to do.');
        return;
      }
      // Check if allocation already exists before inserting.
      // Fetch existing allocations for this driver and normalize dates to YYYY-MM-DD to avoid format mismatches.
      const { data: existing } = await supabase
        .from('driver_allocations')
        .select('id,date,driver_id')
        .eq('driver_id', driverId);

      const existingDateSet = new Set<string>();
      if (existing && Array.isArray(existing)) {
        existing.forEach((row: any) => {
          if (!row || !row.date) return;
          const d = typeof row.date === 'string' ? row.date.slice(0,10) : new Date(row.date).toISOString().slice(0,10);
          existingDateSet.add(d);
        });
      }

  const datesToActuallyInsert = Array.from(selectedDates).filter((d: any) => !existingDateSet.has(String(d)));
      if (datesToActuallyInsert.length === 0) {
        setLoading(false);
        alert('Allocation already exists for this driver and date(s). Please unallocate first.');
        return;
      }

      // Build payload using the filtered dates
      const payloadToInsert = datesToActuallyInsert.map(d => ({
        driver_id: driverId,
        driver_name: driverName,
        date: d,
        allocated_items: JSON.stringify(items),
        returned_items: null,
        sales_total: 0,
        status: 'Allocated',
      }));

      const { data, error } = await supabase.from('driver_allocations').insert(payloadToInsert).select();
      setLoading(false);
      if (error) {
        alert('Failed to allocate to driver: ' + error.message);
        return;
      }
      const insertedArray = Array.isArray(data) ? data : [];
      // rely on refetchData to load fresh (and deduplicated) allocations from DB
      if (insertedArray.length > 0) {
        await refetchData();
      }
    } catch (err: any) {
      setLoading(false);
      console.error(err);
      alert('Failed to allocate: ' + err?.message);
    }
  };

  // Find allocation object for currently selected single date (if exactly one selected)
  const allocationForSelectedDate = React.useMemo(() => {
    if (!driverAllocations || !selectedDates || selectedDates.size !== 1) return null;
    const onlyDate = Array.from(selectedDates)[0];
    // Only return active (non-reconciled) allocations for the selected date
    return (driverAllocations as any[]).find(a => {
      if (!a || !a.date) return false;
      const status = (a.status ?? 'Allocated');
      if (status === 'Reconciled') return false;
      const d = a.date.slice ? a.date.slice(0, 10) : a.date;
      return d === onlyDate;
    }) || null;
  }, [selectedDates, driverAllocations]);

  // Helper: find allocation object for an arbitrary date
  const getAllocationForDate = (date: string) => {
    if (!driverAllocations) return null;
    // Only treat non-reconciled allocations as active for unallocate purposes
    return (driverAllocations as any[]).find(a => {
      if (!a || !a.date) return false;
      const status = (a.status ?? 'Allocated');
      if (status === 'Reconciled') return false;
      const d = a.date.slice ? a.date.slice(0, 10) : a.date;
      return d === date;
    }) || null;
  };

  const handleUnallocateForDate = async (date: string) => {
    const alloc = getAllocationForDate(date);
    if (!alloc) {
      alert('No allocation found for that date.');
      return;
    }
    const driverName = alloc.driverName || alloc.driver_name || (() => {
      const driverId = alloc.driverId || alloc.driver_id;
      const u = users.find((usr: any) => usr.id === driverId);
      return u ? u.name : 'driver';
    })();
  // Remove without browser confirmation, show alert after
    try {
      const id = alloc.id;
      if (!id) { alert('Allocation id missing'); return; }
      const { error } = await supabase.from('driver_allocations').delete().eq('id', id);
      if (error) { alert('Failed to remove allocation: ' + error.message); return; }
  setDriverAllocations(prev => (prev || []).filter(a => a.id !== id));
  await refetchData();
    } catch (err) {
      console.error('Unallocate error:', err);
      alert('Failed to remove allocation. See console.');
    }
  };

  const handleUnallocate = async () => {
    if (!allocationForSelectedDate) return;
    // Resolve driver display name reliably
    const driverName = allocationForSelectedDate.driverName || allocationForSelectedDate.driver_name || (() => {
      const driverId = allocationForSelectedDate.driverId || allocationForSelectedDate.driver_id;
      const u = users.find((usr: any) => usr.id === driverId);
      return u ? u.name : 'driver';
    })();

    // Remove without browser confirmation; proceed immediately
    try {
      const id = allocationForSelectedDate.id;
      if (!id) {
        alert('Cannot remove allocation: allocation record id is missing.');
        return;
      }
      const { error } = await supabase.from('driver_allocations').delete().eq('id', id);
      if (error) {
        alert('Failed to remove allocation: ' + error.message);
        return;
      }
  // Update local DataContext state and refetch
  setDriverAllocations(prev => (prev || []).filter(a => a.id !== id));
  await refetchData();
    } catch (err) {
      console.error('Unallocate error:', err);
      alert('Failed to remove allocation. See console for details.');
    }
  };

  const handlePrintAggregated = () => {
    if (!selectedDates || selectedDates.size === 0) {
      alert('Please select a date to print.');
      return;
    }
    if (aggregatedProducts.length === 0) {
      alert('No products to print for the selected date.');
      return;
    }

    const rowsHtml = aggregatedProducts.map(row => {
      const prod = products.find(p => p.id === row.productId);
      const name = prod?.name || row.productId;
      return `<tr><td style="padding:4px 0;">${name}</td><td style="padding:4px 0;text-align:right;">${row.qty}</td></tr>`;
    }).join('');

  const billHTML = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Deliveries - ${Array.from(selectedDates).join(', ')}</title>
          <style>
            body { font-family: Arial, Helvetica, sans-serif; color: #000; width: 80mm; margin: 0; padding: 6px; }
            .center { text-align: center; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            td { vertical-align: top; }
            .header { margin-bottom: 6px; }
            .company { font-weight: bold; font-size: 14px; }
            .date { font-size: 11px; margin-bottom: 6px; }
            .divider { border-top: 1px dashed #000; margin: 6px 0; }
          </style>
        </head>
        <body>
          <div class="center header">
            <div class="company">${COMPANY_DETAILS.name}</div>
            <div class="date">${COMPANY_DETAILS.address || ''}</div>
            <div class="date">${COMPANY_DETAILS.phone || ''}</div>
            <div class="date">Delivery Dates: ${Array.from(selectedDates).join(', ')}</div>
          </div>
          <div class="divider"></div>
          <table>
            <thead>
              <tr>
                <td style="font-weight:bold;">Product</td>
                <td style="font-weight:bold;text-align:right;">Qty</td>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <div class="divider"></div>
          <div style="text-align:center;font-size:11px;margin-top:6px;">Thank you - ${COMPANY_DETAILS.name}</div>
        </body>
      </html>
    `;

    const height = Math.max(200, 20 + aggregatedProducts.length * 12);
    const options = {
      margin: 1,
  filename: `Deliveries-${Array.from(selectedDates).join('_')}.pdf`,
      image: { type: 'jpeg', quality: 1 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: [80, height], orientation: 'portrait' }
    } as any;

    html2pdf().set(options).from(billHTML).save();
  };

  // Confirm Delivery removed - deliveries are handled per-order via Orders page / Drivers flow

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-700 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent mb-2">
            🚚 Delivery Management
          </h1>
          <p className="text-slate-600 dark:text-slate-400 font-medium">
            Organize and allocate products for efficient delivery
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <Card className="bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-emerald-900/30 dark:via-teal-900/30 dark:to-cyan-900/30 border-0 shadow-xl shadow-emerald-100/50 dark:shadow-emerald-900/20 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-white/60 via-transparent to-transparent dark:from-black/20 dark:via-transparent dark:to-transparent pointer-events-none"></div>
              <CardHeader className="relative z-10 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 text-white">
                <CardTitle className="flex items-center gap-2 text-lg font-bold drop-shadow-sm">
                  📅 Delivery Dates
                </CardTitle>
              </CardHeader>
              <CardContent className="relative z-10 p-4">
              <div className="space-y-2">
                {Object.keys(ordersByDate).length === 0 && (
                  <div className="py-6 text-center text-slate-500 dark:text-slate-400">
                    <div className="text-4xl mb-2">📦</div>
                    <p className="font-medium">No scheduled deliveries</p>
                  </div>
                )}
                {Object.keys(ordersByDate).sort().map(date => {
                  const isAllocated = allocatedDates.has(date);
                  const isSelected = selectedDates.has(date);
                  return (
                    <div 
                      key={date} 
                      className={`p-3 rounded-xl cursor-pointer transform transition-all duration-300 hover:scale-[1.02] hover:shadow-lg ${
                        isSelected
                          ? 'bg-gradient-to-r from-blue-100 via-indigo-100 to-purple-100 dark:from-blue-900/40 dark:via-indigo-900/40 dark:to-purple-900/40 border-2 border-blue-400 shadow-lg'
                          : 'bg-white/50 dark:bg-slate-800/50 hover:bg-white/80 dark:hover:bg-slate-800/80'
                      }`} 
                      onClick={() => setSelectedDates(prev => {
                        const next = new Set(prev);
                        if (next.has(date)) next.delete(date); else next.add(date);
                        return next;
                      })}
                    >
                      <div className="flex justify-between items-center">
                        <div className={`font-semibold ${isAllocated ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>
                          <span className="mr-2">{isAllocated ? '✅' : (isSelected ? '☑️' : '📅')}</span>
                          {date}
                        </div>
                        <div className="flex items-center space-x-2">
                          {!isAllocated && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setDateAllocateModal({ date }); setDateAllocateDriver(''); }}
                              className="px-3 py-1 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-lg text-xs font-semibold hover:from-blue-600 hover:to-indigo-600 transition-all duration-200 shadow-md"
                            >
                              Allocate
                            </button>
                          )}
                          {isAllocated && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleUnallocateForDate(date); }}
                              className="px-3 py-1 bg-gradient-to-r from-red-500 to-rose-500 text-white rounded-lg text-xs font-semibold hover:from-red-600 hover:to-rose-600 transition-all duration-200 shadow-md"
                            >
                              Unallocate
                            </button>
                          )}
                          <Badge 
                            variant={isAllocated ? 'success' : 'default'} 
                            className={`font-bold ${isAllocated ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-slate-100 text-slate-800 border-slate-300'}`}
                          >
                            {ordersByDate[date].length}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 border-0 shadow-xl shadow-orange-100/50 dark:shadow-orange-900/20 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-white/60 via-transparent to-transparent dark:from-black/20 dark:via-transparent dark:to-transparent pointer-events-none"></div>
            <CardHeader className="relative z-10 bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 text-white">
              <CardTitle className="flex items-center gap-2 text-lg font-bold drop-shadow-sm">
                📊 Aggregated Products for {selectedDates.size > 0 ? Array.from(selectedDates).join(', ') : '—'}
              </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10 p-4">
              {aggregatedProducts.length === 0 ? (
                <div className="py-12 text-center text-slate-500 dark:text-slate-400">
                  <div className="text-6xl mb-4">📦</div>
                  <p className="text-lg font-semibold mb-2">Select a date to see aggregated products</p>
                  <p className="text-sm">Choose from the delivery dates on the left</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl bg-white/70 dark:bg-slate-800/70 shadow-inner">
                  <table className="w-full text-sm">
                    <thead className="bg-gradient-to-r from-slate-100 via-gray-100 to-zinc-100 dark:from-slate-700 dark:via-gray-700 dark:to-zinc-700">
                      <tr>
                        <th className="text-left p-3 font-bold text-slate-700 dark:text-slate-300">📦 Product</th>
                        <th className="text-right p-3 font-bold text-slate-700 dark:text-slate-300">📊 Qty</th>
                        <th className="text-right p-3 font-bold text-slate-700 dark:text-slate-300">📋 Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aggregatedProducts.map((row, index) => {
                        const prod = products.find(p => p.id === row.productId);
                        const isLowStock = prod?.stock && prod.stock < row.qty;
                        return (
                          <tr 
                            key={row.productId} 
                            className={`border-b border-slate-200 dark:border-slate-600 hover:bg-slate-50/50 dark:hover:bg-slate-700/50 transition-colors ${
                              index % 4 === 0 ? 'bg-slate-50/30 dark:bg-slate-800/30' : 'bg-white/30 dark:bg-slate-700/30'
                            }`}
                          >
                            <td className="p-3 font-medium text-slate-700 dark:text-slate-300">{prod?.name || row.productId}</td>
                            <td className="p-3 text-right font-bold text-blue-600 dark:text-blue-400">{row.qty}</td>
                            <td className={`p-3 text-right font-bold ${isLowStock ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                              {isLowStock && '⚠️ '}
                              {prod?.stock ?? 'N/A'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-6 p-4 bg-gradient-to-r from-slate-100/70 via-gray-100/70 to-zinc-100/70 dark:from-slate-800/70 dark:via-gray-800/70 dark:to-zinc-800/70 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                      🚛 Select Driver
                    </label>
                    <select 
                      value={allocatingToDriver ?? ''} 
                      onChange={(e) => setAllocatingToDriver(e.target.value)} 
                      className="w-full p-3 border-2 border-slate-300 dark:border-slate-600 rounded-lg bg-white/80 dark:bg-slate-700/80 text-slate-900 dark:text-slate-100 font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                    >
                      <option value="">Assign to driver (optional)</option>
                      {drivers.map(d => (
                        <option key={d.id} value={d.id}>🚛 {d.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => allocatingToDriver ? handleAllocate(allocatingToDriver) : alert('Select a driver to allocate')}
                      className={`px-6 py-3 rounded-xl font-bold text-sm shadow-lg transition-all duration-300 ${
                        Array.from(selectedDates).some(d => allocatedDates.has(d)) 
                          ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-emerald-200 dark:shadow-emerald-900/50' 
                          : 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-blue-200 dark:shadow-blue-900/50 hover:shadow-xl hover:-translate-y-0.5'
                      } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg`}
                      disabled={!allocatingToDriver || aggregatedProducts.length === 0 || loading || selectedDates.size === 0}
                    >
                      {Array.from(selectedDates).some(d => allocatedDates.has(d)) ? '✅ Allocated' : (loading ? '⏳ Allocating...' : '🚀 Allocate')}
                    </button>
                    
                    {allocationForSelectedDate && (
                      <button 
                        onClick={handleUnallocate} 
                        className="px-6 py-3 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-red-200 dark:shadow-red-900/50 transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5"
                      >
                        ❌ Unallocate
                      </button>
                    )}
                    
                    {/* Print moved to Driver Daily Log - removed from Deliveries UI per request */}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Enhanced Date allocate modal */}
      {dateAllocateModal && (
        <Modal isOpen={true} onClose={() => setDateAllocateModal(null)} title={`🚛 Allocate Delivery for ${dateAllocateModal.date}`}>
          <div className="p-6 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-900/30 dark:via-indigo-900/30 dark:to-purple-900/30">
            <div className="mb-4">
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">
                🚛 Select Driver for Assignment
              </label>
              <select 
                value={dateAllocateDriver} 
                onChange={(e) => setDateAllocateDriver(e.target.value)} 
                className="w-full p-3 border-2 border-slate-300 dark:border-slate-600 rounded-lg mb-6 bg-white/80 dark:bg-slate-700/80 text-slate-900 dark:text-slate-100 font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
              >
                <option value="">Select driver</option>
                {drivers.map(d => <option key={d.id} value={d.id}>🚛 {d.name}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setDateAllocateModal(null)}
                className="px-4 py-2 bg-gradient-to-r from-slate-400 to-gray-400 hover:from-slate-500 hover:to-gray-500 text-white rounded-lg font-semibold transition-all duration-200"
              >
                Cancel
              </button>
              <button 
                onClick={async () => {
                  if (!dateAllocateDriver) { alert('Select a driver'); return; }
                  // Ensure the clicked date is included in selection before allocating
                  setSelectedDates(prev => { const next = new Set(prev); if (dateAllocateModal.date) next.add(dateAllocateModal.date); return next; });
                  await handleAllocate(dateAllocateDriver);
                  setDateAllocateModal(null);
                }} 
                className="px-6 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white rounded-lg font-bold shadow-lg shadow-blue-200 dark:shadow-blue-900/50 transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5"
              >
                ✅ Confirm Allocation
              </button>
            </div>
          </div>
        </Modal>
      )}
      </div>
    </div>
  );
};
