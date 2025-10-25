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

  const canDelete = useMemo(() => 
    currentUser?.role === UserRole.Admin,
    [currentUser]
  );




  const openModal = (mode: 'add' | 'edit', customer?: Customer) => {
    setModalMode(mode);
    if (mode === 'edit' && customer) {
      // For edit mode, preserve all existing customer data including outstandingBalance
      setCurrentCustomer({ ...customer });
    } else {
      // For add mode, set default values
      setCurrentCustomer({ name: '', email: '', phone: '', location: '', outstandingBalance: 0, avatarUrl: `https://i.pravatar.cc/100?u=new` });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setCurrentCustomer({});
  };

  const openDeleteConfirm = (customer: Customer) => {
    setCustomerToDelete(customer);
  };

  const closeDeleteConfirm = () => {
    setCustomerToDelete(null);
  };

    const handleSave = () => {
    (async () => {
      try {
        if (!currentCustomer.name) {
          alert('Please fill in the customer name');
          return;
        }

        if (!currentCustomer.phone) {
          alert('Please fill in the phone number');
          return;
        }

        // Check if phone number already exists (only for new customers or when editing phone)
        if (modalMode === 'add' || (modalMode === 'edit' && currentCustomer.phone !== customers.find(c => c.id === currentCustomer.id)?.phone)) {
          const { data: existingCustomers, error: checkError } = await supabase
            .from('customers')
            .select('id, phone')
            .eq('phone', currentCustomer.phone);
          
          if (checkError) {
            alert(`Error checking phone number: ${checkError.message}`);
            return;
          }
          
          if (existingCustomers && existingCustomers.length > 0) {
            // If editing, make sure it's not the same customer
            if (modalMode === 'edit' && existingCustomers[0].id === currentCustomer.id) {
              // Same customer, continue
            } else {
              alert('This phone number is already registered with another customer. Please use a different phone number.');
              return;
            }
          }
        }

        if (modalMode === 'add') {
          // Generate unique ID using timestamp and random number
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
          
          const { error } = await supabase.from('customers').insert([newCustomer]);
          if (error) {
            alert(`Error adding customer: ${error.message}`);
            return;
          }
          // Refresh customers data
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
          
          if (error) {
            alert(`Error updating customer: ${error.message}`);
            return;
          }
          alert('Customer updated successfully!');
          // Refresh customers data
          await refetchData();
        }
        // Close modal after data refresh
        closeModal();
      } catch (error) {
        console.error('Unexpected error in customer operation:', error);
        alert('An unexpected error occurred. Please try again.');
      }
    })();
  };
  
  const handleDelete = async () => {
    if (customerToDelete) {
      try {
        const { error } = await supabase.from('customers').delete().eq('id', customerToDelete.id);
        if (error) {
          alert(`Error deleting customer: ${error.message}`);
          return;
        }
        
        alert('Customer deleted successfully!');
        // Refresh customers data
        await refetchData();
        closeDeleteConfirm();
      } catch (error) {
        console.error('Unexpected error deleting customer:', error);
        alert('An unexpected error occurred while deleting. Please try again.');
      }
    }
  };
  
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



  // Calculate outstanding for each customer from orders table
  const customerOutstandingMap: Record<string, number> = {};
  orders.forEach(order => {
    if (!order.customerId) return;
    // Treat null, undefined, or non-number as 0
    const cheque = order.chequeBalance == null || isNaN(Number(order.chequeBalance)) ? 0 : Number(order.chequeBalance);
    const credit = order.creditBalance == null || isNaN(Number(order.creditBalance)) ? 0 : Number(order.creditBalance);
    customerOutstandingMap[order.customerId] = (customerOutstandingMap[order.customerId] || 0) + cheque + credit;
  });

  const filteredCustomers = useMemo(() => {
    let filtered = customers;

    // Sales Rep filter - show only customers with orders assigned to them
    if (currentUser?.role === UserRole.Sales) {
      filtered = filtered.filter(customer => {
        // Check if this customer has any orders assigned to the current sales rep
        const customerOrders = orders.filter(o => o.customerId === customer.id && o.assignedUserId === currentUser.id);
        return customerOrders.length > 0;
      });
    }

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(customer =>
        customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.location.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Supplier filter - based on customer's primary supplier from orders
    if (selectedSupplier !== 'all') {
      filtered = filtered.filter(customer => {
        const customerOrders = orders.filter(o => o.customerId === customer.id);
        if (customerOrders.length === 0) return selectedSupplier === 'Unassigned';

        // Find primary supplier based on spending
        const spendingBySupplier: Record<string, number> = {};
        customerOrders.forEach(order => {
          order.orderItems.forEach(item => {
            const product = products.find(p => p.id === item.productId);
            if (product) {
              const supplier = product.supplier || 'Unassigned';
              const itemTotal = item.price * item.quantity * (1 - (item.discount || 0) / 100);
              spendingBySupplier[supplier] = (spendingBySupplier[supplier] || 0) + itemTotal;
            }
          });
        });

        const primarySupplier = Object.keys(spendingBySupplier).reduce((a, b) => 
          spendingBySupplier[a] > spendingBySupplier[b] ? a : b
        ) || 'Unassigned';

        return primarySupplier === selectedSupplier;
      });
    }

    // Customer filter (for specific customer selection)
    if (selectedCustomer !== 'all') {
      filtered = filtered.filter(customer => customer.id === selectedCustomer);
    }

    // Category filter - based on most ordered category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(customer => {
        const customerOrders = orders.filter(o => o.customerId === customer.id);
        if (customerOrders.length === 0) return false;

        const categoryCount: Record<string, number> = {};
        customerOrders.forEach(order => {
          order.orderItems.forEach(item => {
            const product = products.find(p => p.id === item.productId);
            if (product) {
              categoryCount[product.category] = (categoryCount[product.category] || 0) + item.quantity;
            }
          });
        });

        const primaryCategory = Object.keys(categoryCount).reduce((a, b) => 
          categoryCount[a] > categoryCount[b] ? a : b
        ) || '';

        return primaryCategory === selectedCategory;
      });
    }

    // Date range filter - based on join date
    if (startDate) {
      filtered = filtered.filter(customer => customer.joinDate >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter(customer => customer.joinDate <= endDate);
    }

    return filtered;
  }, [customers, searchTerm, selectedSupplier, selectedCustomer, selectedCategory, startDate, endDate, orders, products]);

  // Reset filters function
  const resetFilters = () => {
    setSelectedSupplier('all');
    setSelectedCustomer('all');
    setSelectedCategory('all');
    setStartDate('');
    setEndDate('');
    setSearchTerm('');
  };
  
  const customersBySupplier = useMemo(() => {
    const getPrimarySupplier = (customerId: string): string => {
        const customerOrders = orders.filter(o => o.customerId === customerId);
        if (customerOrders.length === 0) return 'Unassigned';

        const spendingBySupplier: Record<string, number> = {};

        customerOrders.forEach(order => {
            order.orderItems.forEach(item => {
                const product = products.find(p => p.id === item.productId);
                if (product) {
                    const supplier = product.supplier || 'Unassigned';
                    const itemTotal = item.price * item.quantity * (1 - (item.discount || 0) / 100);
                    spendingBySupplier[supplier] = (spendingBySupplier[supplier] || 0) + itemTotal;
                }
            });
        });
        
        const topSupplier = Object.entries(spendingBySupplier).sort((a, b) => b[1] - a[1])[0];
        return topSupplier ? topSupplier[0] : 'Unassigned';
    };

    const grouped = filteredCustomers.reduce((acc, customer) => {
        const primarySupplier = getPrimarySupplier(customer.id);
        if (!acc[primarySupplier]) {
            acc[primarySupplier] = [];
        }
        acc[primarySupplier].push(customer);
        return acc;
    }, {} as Record<string, Customer[]>);

    // Sort customers within each supplier group by outstanding amount (highest first)
    Object.keys(grouped).forEach(supplierName => {
        grouped[supplierName].sort((a, b) => {
            const outstandingA = customerOutstandingMap[a.id] || 0;
            const outstandingB = customerOutstandingMap[b.id] || 0;
            return outstandingB - outstandingA; // Descending order (highest outstanding first)
        });
    });

    return grouped;
  }, [filteredCustomers, orders, products, customerOutstandingMap]);

  const allCustomers = Object.values(customersBySupplier).flat() as Customer[];
  // Total outstanding from orders table
  const totalOutstanding = useMemo(() => 
    allCustomers.reduce((sum, customer) => sum + (customerOutstandingMap[customer.id] || 0), 0), 
    [allCustomers, customerOutstandingMap]
  );


  // Calculate total spent for each customer from delivered orders
  const customerTotalSpentMap: Record<string, number> = {};
  orders.forEach(order => {
    if (!order.customerId || order.status !== 'Delivered') return;
    // Sum up the total for each delivered order
    customerTotalSpentMap[order.customerId] = (customerTotalSpentMap[order.customerId] || 0) + (order.total || 0);
  });

  // Total spent for visible customers
  const totalSpent = useMemo(() => 
    allCustomers.reduce((sum, customer) => sum + (customerTotalSpentMap[customer.id] || 0), 0),
    [allCustomers, customerTotalSpentMap]
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Customers</h1>
        <div className="flex gap-2">
          {/* Export Buttons */}
          <button
            onClick={() => exportCustomers(filteredCustomers, 'csv')}
            className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
            title="Export as CSV"
          >
            📊 CSV
          </button>
          <button
            onClick={() => exportCustomers(filteredCustomers, 'xlsx')}
            className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
            title="Export as Excel"
          >
            📋 Excel
          </button>
          {canEdit && (
              <button 
                  onClick={() => openModal('add')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
              Add Customer
              </button>
          )}
        </div>
      </div>

      {/* Filter Section */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 flex-1">
            {/* Supplier Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Primary Supplier
              </label>
              <select
                value={selectedSupplier}
                onChange={(e) => setSelectedSupplier(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Suppliers</option>
                <option value="Unassigned">Unassigned</option>
                {suppliers.map(supplier => (
                  <option key={supplier.id} value={supplier.name}>{supplier.name}</option>
                ))}
              </select>
            </div>

            {/* Customer Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Specific Customer
              </label>
              <select
                value={selectedCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Customers</option>
                {customers.map(customer => (
                  <option key={customer.id} value={customer.id}>{customer.name}</option>
                ))}
              </select>
            </div>

            {/* Category Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Primary Category
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Categories</option>
                {Array.from(new Set(products.map(p => p.category))).sort().map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Join Date From
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Join Date To
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Reset Button */}
          <button
            onClick={resetFilters}
            className="px-4 py-2 bg-slate-500 hover:bg-slate-600 text-white rounded-lg transition-colors whitespace-nowrap"
          >
            Reset Filters
          </button>
        </div>
      </div>

       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader>
          <CardTitle>Total Customers</CardTitle>
          <CardDescription>Visible in current view</CardDescription>
        </CardHeader>
        <CardContent>
                    <p className="text-3xl font-bold text-slate-900 dark:text-white">{allCustomers.length}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Total Spent</CardTitle>
          <CardDescription>For visible customers</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-green-600">{formatCurrency(totalSpent, currency)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Total Outstanding</CardTitle>
          <CardDescription>For visible customers</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-red-500">{formatCurrency(totalOutstanding, currency)}</p>
        </CardContent>
      </Card>
        </div>


      <Card>
        <CardHeader>
          <CardTitle>Customer List</CardTitle>
          <CardDescription>Manage your customer information, grouped by primary supplier.</CardDescription>
           <div className="pt-4">
             <input
                type="text"
                placeholder="Search customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full max-w-sm px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </CardHeader>
        <CardContent>
           <div className="space-y-8">
            {Object.entries(customersBySupplier).map(([supplierName, supplierCustomers]) => (
              <div key={supplierName}>
                <div className="flex items-center space-x-3 mb-4">
                  <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-300">{supplierName}</h2>
                  <Badge variant="default">{(supplierCustomers as Customer[]).length} {(supplierCustomers as Customer[]).length === 1 ? 'Customer' : 'Customers'}</Badge>
                </div>
                 <div className="overflow-x-auto border dark:border-slate-700 rounded-lg">
                    <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                      <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-400">
                        <tr>
                          <th scope="col" className="px-6 py-3 z-20 sticky left-0">Customer</th>
                          <th scope="col" className="px-6 py-3">Join Date</th>
                          <th scope="col" className="px-6 py-3 z-20 sticky right-0">Outstanding & Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(supplierCustomers as Customer[]).map((customer) => {
                          // Calculate primary supplier for this customer
                          const customerOrders = orders.filter(o => o.customerId === customer.id);
                          let primarySupplier = 'Unassigned';
                          let primaryCategory = 'N/A';
                          
                          if (customerOrders.length > 0) {
                            // Calculate primary supplier based on spending
                            const spendingBySupplier: Record<string, number> = {};
                            const categoryCount: Record<string, number> = {};
                            
                            customerOrders.forEach(order => {
                              order.orderItems.forEach(item => {
                                const product = products.find(p => p.id === item.productId);
                                if (product) {
                                  // Supplier calculation
                                  const supplier = product.supplier || 'Unassigned';
                                  const itemTotal = item.price * item.quantity * (1 - (item.discount || 0) / 100);
                                  spendingBySupplier[supplier] = (spendingBySupplier[supplier] || 0) + itemTotal;
                                  
                                  // Category calculation
                                  categoryCount[product.category] = (categoryCount[product.category] || 0) + item.quantity;
                                }
                              });
                            });
                            
                            // Get primary supplier and category
                            if (Object.keys(spendingBySupplier).length > 0) {
                              primarySupplier = Object.keys(spendingBySupplier).reduce((a, b) => 
                                spendingBySupplier[a] > spendingBySupplier[b] ? a : b
                              );
                            }
                            
                            if (Object.keys(categoryCount).length > 0) {
                              primaryCategory = Object.keys(categoryCount).reduce((a, b) => 
                                categoryCount[a] > categoryCount[b] ? a : b
                              );
                            }
                          }
                          
                          return (
                            <tr key={customer.id} className="border-b dark:bg-slate-800 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600">
                              <td className="px-6 py-4 font-medium text-slate-900 dark:text-white z-10 sticky left-0">
                                <div className="flex items-center space-x-3">
                                  <img src={customer.avatarUrl} alt={customer.name} className="w-10 h-10 rounded-full" />
                                  <div>
                                    <span className="block">{customer.name}</span>
                                    <p className="text-xs text-slate-500">{customer.location}</p>
                                    <p className="text-xs text-blue-600">{customer.phone}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-sm">
                                {customer.joinDate ? new Date(customer.joinDate).toLocaleDateString('en-GB') : 'N/A'}
                              </td>
                              <td className="px-6 py-4 z-10 sticky right-0">
                                <div className="flex flex-col space-y-2">
                                  <div className={`font-bold text-sm ${(customerOutstandingMap[customer.id] || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    {formatCurrency(customerOutstandingMap[customer.id] || 0, currency)}
                                  </div>
                                  <div className="flex flex-col space-y-1">
                                    {canEdit && (
                                      <button onClick={() => openModal('edit', customer)} className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium text-xs text-left">
                                        Edit
                                      </button>
                                    )}
                                    {canDelete && (
                                      <button onClick={() => openDeleteConfirm(customer)} className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-medium text-xs text-left">
                                        Delete
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
              </div>
            ))}
            {Object.keys(customersBySupplier).length === 0 && (
              <div className="text-center py-10">
                <p className="text-slate-500 dark:text-slate-400">No customers found matching your criteria.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
        
        {/* Add/Edit Modal */}
        <Modal isOpen={isModalOpen} onClose={closeModal} title={modalMode === 'add' ? 'Add New Customer' : 'Edit Customer'}>
            <div className="p-6 space-y-4">
                <div className="flex flex-col items-center space-y-2">
                    <img 
                        src={currentCustomer.avatarUrl || 'https://i.pravatar.cc/100?u=default'} 
                        alt="Avatar preview" 
                        className="w-24 h-24 rounded-full object-cover border-4 border-slate-200 dark:border-slate-600"
                    />
                    <label htmlFor="avatar-upload-customer" className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                        Upload Photo
                        <input 
                            id="avatar-upload-customer" 
                            type="file" 
                            className="hidden" 
                            accept="image/png, image/jpeg, image/gif"
                            onChange={handleAvatarChange}
                        />
                    </label>
                </div>
                 <div>
                    <label htmlFor="name" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Name</label>
                    <input
                        type="text"
                        id="name"
                        value={currentCustomer.name || ''}
                        onChange={(e) => setCurrentCustomer({ ...currentCustomer, name: e.target.value })}
                        className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:placeholder-slate-400 dark:text-white"
                        required
                    />
                </div>
                 <div>
                    <label htmlFor="email" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Email <span className="text-slate-400">(Optional)</span></label>
                    <input
                        type="email"
                        id="email"
                        value={currentCustomer.email || ''}
                        onChange={(e) => setCurrentCustomer({ ...currentCustomer, email: e.target.value })}
                        className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:placeholder-slate-400 dark:text-white"
                        placeholder="customer@example.com (optional)"
                    />
                </div>
                <div>
                    <label htmlFor="phone" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Phone Number <span className="text-red-500">*</span></label>
                    <input
                        type="tel"
                        id="phone"
                        value={currentCustomer.phone || ''}
                        onChange={(e) => setCurrentCustomer({ ...currentCustomer, phone: e.target.value })}
                        className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:placeholder-slate-400 dark:text-white"
                        placeholder="Enter unique phone number"
                        required
                    />
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Each phone number must be unique</p>
                </div>
                <div>
                    <label htmlFor="location" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Location</label>
                    <input
                        type="text"
                        id="location"
                        value={currentCustomer.location || ''}
                        onChange={(e) => setCurrentCustomer({ ...currentCustomer, location: e.target.value })}
                        className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:placeholder-slate-400 dark:text-white"
                        placeholder="City, State"
                        required
                    />
                </div>
                 {modalMode === 'edit' && (
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="outstandingBalance" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Outstanding Balance</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{currency}</span>
                                <input
                                    type="number"
                                    id="outstandingBalance"
                                    value={currentCustomer.outstandingBalance || ''}
                                    onChange={(e) => setCurrentCustomer({ ...currentCustomer, outstandingBalance: parseFloat(e.target.value) || 0 })}
                                    className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 pl-12 dark:bg-slate-700 dark:border-slate-600 dark:placeholder-slate-400 dark:text-white"
                                    readOnly
                                />
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                This amount is calculated from pending orders and payments
                            </p>
                        </div>
                        
                    </div>
                )}
            </div>
             <div className="flex items-center justify-end p-6 space-x-2 border-t border-slate-200 rounded-b dark:border-slate-600">
                <button onClick={closeModal} type="button" className="text-slate-500 bg-white hover:bg-slate-100 focus:ring-4 focus:outline-none focus:ring-blue-300 rounded-lg border border-slate-200 text-sm font-medium px-5 py-2.5 hover:text-slate-900 focus:z-10 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-500 dark:hover:text-white dark:hover:bg-slate-600">
                    Cancel
                </button>
                <button onClick={handleSave} type="button" className="text-white bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700">
                    Save Customer
                </button>
            </div>
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal isOpen={!!customerToDelete} onClose={closeDeleteConfirm} title="Confirm Deletion">
            <div className="p-6">
                <p className="text-slate-600 dark:text-slate-300">Are you sure you want to delete the customer "{customerToDelete?.name}"?</p>
            </div>
            <div className="flex items-center justify-end p-6 space-x-2 border-t border-slate-200 rounded-b dark:border-slate-600">
                <button onClick={closeDeleteConfirm} type="button" className="text-slate-500 bg-white hover:bg-slate-100 focus:ring-4 focus:outline-none focus:ring-blue-300 rounded-lg border border-slate-200 text-sm font-medium px-5 py-2.5 hover:text-slate-900 focus:z-10 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-500 dark:hover:text-white dark:hover:bg-slate-600">
                    Cancel
                </button>
                <button onClick={handleDelete} type="button" className="text-white bg-red-600 hover:bg-red-700 focus:ring-4 focus:outline-none focus:ring-red-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-red-600 dark:hover:bg-red-700">
                    Delete
                </button>
            </div>
        </Modal>
    </div>
  );
};
