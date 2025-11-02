import React, { useState, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { Customer, UserRole } from '../../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/Card';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { exportCustomers } from '../../utils/exportUtils';

const formatCurrency = (amount: number, currency: string) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount).replace('$', `${currency} `);
};

export const Customers: React.FC = () => {
  const { customers, setCustomers, orders, products, suppliers, refetchData } = useData();
  const { currentUser } = useAuth();
  const currency = currentUser?.settings.currency || 'LKR';

  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [currentCustomer, setCurrentCustomer] = useState<Partial<Customer>>({});
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

  // Filter states
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const canEdit = useMemo(() =>
    currentUser?.role === UserRole.Admin ||
    currentUser?.role === UserRole.Manager ||
    currentUser?.role === UserRole.Sales ||
    currentUser?.role === UserRole.Driver,
    [currentUser]
  );

  const openModal = (mode: 'add' | 'edit', customer?: Customer) => {
    setModalMode(mode);
    if (mode === 'edit' && customer) {
      setCurrentCustomer({ ...customer });
    } else {
      setCurrentCustomer({ name: '', email: '', phone: '', location: '', outstandingBalance: 0, avatarUrl: `https://i.pravatar.cc/100?u=new` });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setCurrentCustomer({});
  };

  const openDeleteConfirm = (customer: Customer) => setCustomerToDelete(customer);
  const closeDeleteConfirm = () => setCustomerToDelete(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setCurrentCustomer(prev => ({ ...prev, avatarUrl: base64String }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    try {
      if (!currentCustomer.name) { alert('Please fill in the customer name'); return; }
      if (!currentCustomer.phone) { alert('Please fill in the phone number'); return; }

      // Check phone uniqueness
      if (modalMode === 'add' || (modalMode === 'edit' && currentCustomer.phone !== customers.find(c => c.id === currentCustomer.id)?.phone)) {
        const { data: existingCustomers, error: checkError } = await supabase.from('customers').select('id, phone').eq('phone', currentCustomer.phone);
        if (checkError) { alert(`Error checking phone number: ${checkError.message}`); return; }
        if (existingCustomers && existingCustomers.length > 0) {
          if (!(modalMode === 'edit' && existingCustomers[0].id === currentCustomer.id)) {
            alert('This phone number is already registered with another customer. Please use a different phone number.');
            return;
          }
        }
      }

      if (modalMode === 'add') {
        const uniqueId = `CUST${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`;
        const newCustomer = {
          id: uniqueId,
          name: currentCustomer.name || '',
          email: currentCustomer.email || '',
          phone: currentCustomer.phone || '',
          location: currentCustomer.location || '',
          joindate: new Date().toISOString().split('T')[0],
          totalspent: 0,
          outstandingbalance: 0,
          avatarurl: currentCustomer.avatarUrl || `https://i.pravatar.cc/40?u=${currentCustomer.email || 'new'}`,
        };

        try {
          const customerWithCreatedBy = { ...newCustomer, created_by: currentUser?.id || 'system' };
          const { error } = await supabase.from('customers').insert([customerWithCreatedBy]);
          if (error) {
            // fallback if column missing
            if ((error.message || '').includes('created_by') || (error.message || '').includes('column')) {
              const { error: fallbackError } = await supabase.from('customers').insert([newCustomer]);
              if (fallbackError) { alert(`Error adding customer: ${fallbackError.message}`); return; }
              alert('Customer added successfully! Note: Run database migration for sales rep segregation.');
            } else {
              alert(`Error adding customer: ${error.message}`); return;
            }
          } else {
            alert('Customer added successfully!');
          }
        } catch (err) {
          console.error('Unexpected error:', err);
          const { error: basicError } = await supabase.from('customers').insert([newCustomer]);
          if (basicError) { alert(`Error adding customer: ${basicError.message}`); return; }
          alert('Customer added successfully! (Basic mode - no sales rep segregation)');
        }

        await refetchData();
      } else {
        const { error } = await supabase.from('customers').update({
          name: currentCustomer.name,
          email: currentCustomer.email,
          phone: currentCustomer.phone,
          location: currentCustomer.location,
          outstandingbalance: currentCustomer.outstandingBalance,
          avatarurl: currentCustomer.avatarUrl,
        }).eq('id', currentCustomer.id);
        if (error) { alert(`Error updating customer: ${error.message}`); return; }
        alert('Customer updated successfully!');
        await refetchData();
      }

      closeModal();
    } catch (error) {
      console.error('Unexpected error in customer operation:', error);
      alert('An unexpected error occurred. Please try again.');
    }
  };

  const handleDelete = async () => {
    if (!customerToDelete) return;
    try {
      const { error } = await supabase.from('customers').delete().eq('id', customerToDelete.id);
      if (error) { alert(`Error deleting customer: ${error.message}`); return; }
      alert('Customer deleted successfully!');
      await refetchData();
      closeDeleteConfirm();
    } catch (err) {
      console.error('Unexpected error deleting customer:', err);
      alert('An unexpected error occurred while deleting. Please try again.');
    }
  };

  // Calculate outstanding for each customer from orders table
  const customerOutstandingMap: Record<string, number> = {};
  orders.forEach(order => {
    if (!order.customerId) return;
    const cheque = order.chequeBalance == null || isNaN(Number(order.chequeBalance)) ? 0 : Number(order.chequeBalance);
    const credit = order.creditBalance == null || isNaN(Number(order.creditBalance)) ? 0 : Number(order.creditBalance);
    customerOutstandingMap[order.customerId] = (customerOutstandingMap[order.customerId] || 0) + cheque + credit;
  });

  const filteredCustomers = useMemo(() => {
    let filtered = customers;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(customer => (customer.name || '').toLowerCase().includes(q) || (customer.email || '').toLowerCase().includes(q) || (customer.location || '').toLowerCase().includes(q));
    }

    // Supplier filter - based on customer's primary supplier from orders
    if (selectedSupplier !== 'all') {
      filtered = filtered.filter(customer => {
        const customerOrders = orders.filter(o => o.customerId === customer.id);
        if (customerOrders.length === 0) return selectedSupplier === 'Unassigned';
        const spendingBySupplier: Record<string, number> = {};
        customerOrders.forEach(order => order.orderItems.forEach(item => {
          const product = products.find(p => p.id === item.productId);
          if (product) {
            const supplier = product.supplier || 'Unassigned';
            const itemTotal = item.price * item.quantity * (1 - (item.discount || 0) / 100);
            spendingBySupplier[supplier] = (spendingBySupplier[supplier] || 0) + itemTotal;
          }
        }));
        const primarySupplier = Object.keys(spendingBySupplier).reduce((a, b) => spendingBySupplier[a] > spendingBySupplier[b] ? a : b, 'Unassigned');
        return primarySupplier === selectedSupplier;
      });
    }

    if (selectedCustomer !== 'all') filtered = filtered.filter(c => c.id === selectedCustomer);

    if (selectedCategory !== 'all') {
      filtered = filtered.filter(customer => {
        const customerOrders = orders.filter(o => o.customerId === customer.id);
        if (customerOrders.length === 0) return false;
        const categoryCount: Record<string, number> = {};
        customerOrders.forEach(order => order.orderItems.forEach(item => {
          const product = products.find(p => p.id === item.productId);
          if (product) categoryCount[product.category] = (categoryCount[product.category] || 0) + item.quantity;
        }));
        const primaryCategory = Object.keys(categoryCount).reduce((a, b) => categoryCount[a] > categoryCount[b] ? a : b, '');
        return primaryCategory === selectedCategory;
      });
    }

    if (startDate) filtered = filtered.filter(c => c.joinDate >= startDate);
    if (endDate) filtered = filtered.filter(c => c.joinDate <= endDate);

    return filtered;
  }, [customers, searchTerm, selectedSupplier, selectedCustomer, selectedCategory, startDate, endDate, orders, products]);

  const resetFilters = () => { setSelectedSupplier('all'); setSelectedCustomer('all'); setSelectedCategory('all'); setStartDate(''); setEndDate(''); setSearchTerm(''); };

  const customersBySupplier = useMemo(() => {
    const getPrimarySupplier = (customerId: string) => {
      const customerOrders = orders.filter(o => o.customerId === customerId);
      if (customerOrders.length === 0) return 'Unassigned';
      const spendingBySupplier: Record<string, number> = {};
      customerOrders.forEach(order => order.orderItems.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        if (product) {
          const supplier = product.supplier || 'Unassigned';
          const itemTotal = item.price * item.quantity * (1 - (item.discount || 0) / 100);
          spendingBySupplier[supplier] = (spendingBySupplier[supplier] || 0) + itemTotal;
        }
      }));
      const top = Object.entries(spendingBySupplier).sort((a, b) => b[1] - a[1])[0];
      return top ? top[0] : 'Unassigned';
    };
    const grouped: Record<string, Customer[]> = {};
    filteredCustomers.forEach(c => { const primary = getPrimarySupplier(c.id); if (!grouped[primary]) grouped[primary] = []; grouped[primary].push(c); });
    return grouped;
  }, [filteredCustomers, orders, products]);

  const allCustomers = Object.values(customersBySupplier).flat() as Customer[];
  const totalOutstanding = useMemo(() => allCustomers.reduce((s, c) => s + (customerOutstandingMap[c.id] || 0), 0), [allCustomers, customerOutstandingMap]);

  const customerTotalSpentMap: Record<string, number> = {};
  orders.forEach(order => { if (!order.customerId || order.status !== 'Delivered') return; customerTotalSpentMap[order.customerId] = (customerTotalSpentMap[order.customerId] || 0) + (order.total || 0); });
  const totalSpent = useMemo(() => allCustomers.reduce((s, c) => s + (customerTotalSpentMap[c.id] || 0), 0), [allCustomers, customerTotalSpentMap]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Customers</h1>
        <div className="flex gap-2">
          <button onClick={() => exportCustomers(filteredCustomers, 'csv')} className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm">📊 CSV</button>
          <button onClick={() => exportCustomers(filteredCustomers, 'xlsx')} className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm">📋 Excel</button>
          {canEdit && (<button onClick={() => openModal('add')} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Add Customer</button>)}
        </div>
      </div>

      {/* Filter Section */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 flex-1">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Primary Supplier</label>
              <select value={selectedSupplier} onChange={(e) => setSelectedSupplier(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                <option value="all">All Suppliers</option>
                <option value="Unassigned">Unassigned</option>
                {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Specific Customer</label>
              <select value={selectedCustomer} onChange={(e) => setSelectedCustomer(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                <option value="all">All Customers</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Primary Category</label>
              <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                <option value="all">All Categories</option>
                {Array.from(new Set(products.map(p => p.category))).sort().map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Join Date From</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Join Date To</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
            </div>
          </div>
          <button onClick={resetFilters} className="px-4 py-2 bg-slate-500 hover:bg-slate-600 text-white rounded-lg">Reset Filters</button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader><CardTitle>Total Customers</CardTitle><CardDescription>Visible in current view</CardDescription></CardHeader><CardContent><p className="text-3xl font-bold">{allCustomers.length}</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Total Spent</CardTitle><CardDescription>For visible customers</CardDescription></CardHeader><CardContent><p className="text-3xl font-bold text-green-600">{formatCurrency(totalSpent, currency)}</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Total Outstanding</CardTitle><CardDescription>For visible customers</CardDescription></CardHeader><CardContent><p className="text-3xl font-bold text-red-500">{formatCurrency(totalOutstanding, currency)}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Customer List</CardTitle>
          <CardDescription>Manage your customer information, grouped by primary supplier.</CardDescription>
          <div className="pt-4">
            <input type="text" placeholder="Search customers..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full max-w-sm px-4 py-2 border rounded-lg" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-8">
            {(() => {
              const supplierEntries = Object.entries(customersBySupplier) as [string, Customer[]][];
              return supplierEntries.map(([supplierName, supplierCustomers]) => (
              <div key={supplierName}>
                <div className="flex items-center space-x-3 mb-4">
                  <h2 className="text-xl font-semibold">{supplierName}</h2>
                  <Badge variant="default">{supplierCustomers.length} {supplierCustomers.length === 1 ? 'Customer' : 'Customers'}</Badge>
                </div>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs uppercase bg-slate-50">
                      <tr>
                        <th className="px-6 py-3">Customer</th>
                        <th className="px-6 py-3">Contact</th>
                        <th className="px-6 py-3">Total Spent</th>
                        <th className="px-6 py-3">Outstanding</th>
                        {canEdit && <th className="px-6 py-3">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {supplierCustomers.map(customer => (
                        <tr key={customer.id} className="border-b hover:bg-slate-50">
                          <td className="px-6 py-4 flex items-center gap-3">
                            <img src={customer.avatarUrl} alt={customer.name} className="w-10 h-10 rounded-full" />
                            <div>
                              <div className="font-medium">{customer.name}</div>
                              <div className="text-xs text-slate-500">{customer.location}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div>{customer.email}</div>
                            <div className="text-xs text-slate-500">{customer.phone}</div>
                          </td>
                          <td className="px-6 py-4">{formatCurrency(customerTotalSpentMap[customer.id] || 0, currency)}</td>
                          <td className={`px-6 py-4 font-bold ${(customerOutstandingMap[customer.id] || 0) > 0 ? 'text-red-500' : 'text-green-500'}`}>{formatCurrency(customerOutstandingMap[customer.id] || 0, currency)}</td>
                          {canEdit && (
                            <td className="px-6 py-4 space-x-2">
                              <button onClick={() => openModal('edit', customer)} className="text-blue-600">Edit</button>
                              <button onClick={() => openDeleteConfirm(customer)} className="text-red-600">Delete</button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              ));
            })()}

            {Object.keys(customersBySupplier).length === 0 && (
              <div className="text-center py-10"><p className="text-slate-500">No customers found matching your criteria.</p></div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Modal */}
      <Modal isOpen={isModalOpen} onClose={closeModal} title={modalMode === 'add' ? 'Add New Customer' : 'Edit Customer'}>
        <div className="p-6 space-y-4">
          <div className="flex flex-col items-center space-y-2">
            <img src={currentCustomer.avatarUrl || 'https://i.pravatar.cc/100?u=default'} alt="Avatar" className="w-24 h-24 rounded-full" />
            <label className="cursor-pointer text-sm text-blue-600">Upload Photo<input type="file" className="hidden" accept="image/*" onChange={handleAvatarChange} /></label>
          </div>
          <div>
            <label className="block mb-2 text-sm">Name</label>
            <input type="text" value={currentCustomer.name || ''} onChange={(e) => setCurrentCustomer({ ...currentCustomer, name: e.target.value })} className="w-full p-2.5 border rounded" />
          </div>
          <div>
            <label className="block mb-2 text-sm">Email <span className="text-slate-400">(Optional)</span></label>
            <input type="email" value={currentCustomer.email || ''} onChange={(e) => setCurrentCustomer({ ...currentCustomer, email: e.target.value })} className="w-full p-2.5 border rounded" placeholder="customer@example.com" />
          </div>
          <div>
            <label className="block mb-2 text-sm">Phone Number <span className="text-red-500">*</span></label>
            <input type="tel" value={currentCustomer.phone || ''} onChange={(e) => setCurrentCustomer({ ...currentCustomer, phone: e.target.value })} className="w-full p-2.5 border rounded" placeholder="Enter unique phone number" />
          </div>
          <div>
            <label className="block mb-2 text-sm">Location</label>
            <input type="text" value={currentCustomer.location || ''} onChange={(e) => setCurrentCustomer({ ...currentCustomer, location: e.target.value })} className="w-full p-2.5 border rounded" placeholder="City, State" />
          </div>
          {modalMode === 'edit' && (
            <div>
              <label className="block mb-2 text-sm">Outstanding Balance</label>
              <input type="number" value={currentCustomer.outstandingBalance || ''} readOnly className="w-full p-2.5 border rounded bg-gray-100" />
            </div>
          )}
          <div className="flex items-center justify-end space-x-2">
            <button onClick={closeModal} className="px-4 py-2 border rounded">Cancel</button>
            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded">Save Customer</button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={!!customerToDelete} onClose={closeDeleteConfirm} title="Confirm Deletion">
        <div className="p-6">
          <p>Are you sure you want to delete the customer "{customerToDelete?.name}"?</p>
        </div>
        <div className="flex items-center justify-end p-6 space-x-2">
          <button onClick={closeDeleteConfirm} className="px-4 py-2 border rounded">Cancel</button>
          <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded">Delete</button>
        </div>
      </Modal>
    </div>
  );
};

export default Customers;
