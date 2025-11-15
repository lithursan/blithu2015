import React, { useState, useMemo } from 'react';
import { Supplier, UserRole } from '../../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/Card';
import { Modal } from '../ui/Modal';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabaseClient';
import { exportSuppliers } from '../../utils/exportUtils';
import { exportToPDF } from '../../utils/pdfExport';
import { confirmSecureDelete } from '../../utils/passwordConfirmation';

export const Suppliers: React.FC = () => {
  // small deterministic color picker for suppliers (keeps colors consistent)
  const COLORS = ['#FF8A80', '#FFD180', '#FFFF8D', '#CCFF90', '#A7FFEB', '#80D8FF', '#B388FF', '#FF80AB'];
  const colorFor = (key: string | undefined) => {
    if (!key) return COLORS[0];
    let h = 0;
    for (let i = 0; i < key.length; i++) {
      h = (h << 5) - h + key.charCodeAt(i);
      h |= 0;
    }
    const idx = Math.abs(h) % COLORS.length;
    return COLORS[idx];
  };

  const initials = (name?: string) => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };
  // convert hex like #RRGGBB to rgba with given alpha for subtle tint
  const hexToRgba = (hex: string, alpha = 0.06) => {
    if (!hex) return `rgba(0,0,0,${alpha})`;
    const h = hex.replace('#', '');
    const bigint = parseInt(h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };
  // Helper functions for Supabase CRUD
  // Toast for error feedback
  const showToast = (msg: string) => {
    alert(msg); // Replace with your toast system if available
  };

  const addSupplierToDB = async (supplier: Supplier) => {
    const dbSupplier = {
      id: supplier.id,
      name: supplier.name,
      contactperson: supplier.contactPerson,
      email: supplier.email,
      phone: supplier.phone,
      address: supplier.address,
      joindate: supplier.joinDate,
    };
    const { error } = await supabase.from('suppliers').insert([dbSupplier]);
    if (error) showToast('Error adding supplier: ' + error.message);
  };

  const updateSupplierInDB = async (id: string, newData: Partial<Supplier>) => {
    const dbUpdate: any = {};
    if (newData.name !== undefined) dbUpdate.name = newData.name;
    if (newData.contactPerson !== undefined) dbUpdate.contactperson = newData.contactPerson;
    if (newData.email !== undefined) dbUpdate.email = newData.email;
    if (newData.phone !== undefined) dbUpdate.phone = newData.phone;
    if (newData.address !== undefined) dbUpdate.address = newData.address;
    if (newData.joinDate !== undefined) dbUpdate.joindate = newData.joinDate;
    const { error } = await supabase.from('suppliers').update(dbUpdate).eq('id', id);
    if (error) showToast('Error updating supplier: ' + error.message);
  };

  const deleteSupplierFromDB = async (id: string) => {
    const { error } = await supabase.from('suppliers').delete().eq('id', id);
    if (error) showToast('Error deleting supplier: ' + error.message);
  };
  const { suppliers, setSuppliers, orders, products } = useData();
  const { currentUser } = useAuth();

  if (currentUser?.role !== UserRole.Admin && currentUser?.role !== UserRole.Secretary && currentUser?.role !== UserRole.Manager && currentUser?.role !== UserRole.Sales) {
    return (
        <div className="p-4 sm:p-6 lg:p-8 text-center">
             <Card className="max-w-md mx-auto">
                <CardHeader>
                    <CardTitle className="text-red-500">Access Denied</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-slate-600 dark:text-slate-400">You do not have permission to view this page.</p>
                </CardContent>
            </Card>
        </div>
    );
  }

  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [currentSupplier, setCurrentSupplier] = useState<Partial<Supplier>>({});
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);

  const canEdit = useMemo(() => 
    currentUser?.role === UserRole.Admin || 
    currentUser?.role === UserRole.Manager,
    [currentUser]
  );
  
  const accessibleSuppliers = useMemo(() => {
    if (currentUser?.role === UserRole.Sales && currentUser.assignedSupplierNames) {
        return new Set(currentUser.assignedSupplierNames);
    }
    return null; // null means all access for Admin/Manager
  }, [currentUser]);

  const openModal = (mode: 'add' | 'edit', supplier?: Supplier) => {
    setModalMode(mode);
    setCurrentSupplier(supplier || { name: '', contactPerson: '', email: '', phone: '', address: '' });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setCurrentSupplier({});
  };

  const openDeleteConfirm = (supplier: Supplier) => {
    setSupplierToDelete(supplier);
  };

  const closeDeleteConfirm = () => {
    setSupplierToDelete(null);
  };

  const handleSave = () => {
    (async () => {
      if (modalMode === 'add') {
        // Generate unique ID using timestamp and random number
        const uniqueId = `SUPP${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`;
        const newSupplier: Supplier = {
          id: uniqueId,
          name: currentSupplier.name || '',
          contactPerson: currentSupplier.contactPerson || '',
          email: currentSupplier.email || '',
          phone: currentSupplier.phone || '',
          address: currentSupplier.address || '',
          joinDate: new Date().toISOString().split('T')[0],
        };
        await addSupplierToDB(newSupplier);
      } else {
        await updateSupplierInDB(currentSupplier.id as string, currentSupplier);
      }
      // Fetch fresh suppliers and map
      const { data, error } = await supabase.from('suppliers').select('*');
      if (error) showToast('Error fetching suppliers: ' + error.message);
      if (data) {
        const mappedSuppliers = data.map((row: any) => ({
          id: row.id,
          name: row.name,
          contactPerson: row.contactperson,
          email: row.email,
          phone: row.phone,
          address: row.address,
          joinDate: row.joindate,
        }));
        setSuppliers(mappedSuppliers);
      }
      closeModal();
    })();
  };

  const handleDelete = () => {
    (async () => {
      if (!supplierToDelete || !currentUser?.email) return;
      
      // Require password confirmation for delete
      const confirmed = await confirmSecureDelete(
        supplierToDelete.name, 
        'Supplier', 
        currentUser.email
      );
      
      if (!confirmed) {
        closeDeleteConfirm();
        return;
      }
      
      if (supplierToDelete) {
        await deleteSupplierFromDB(supplierToDelete.id);
        // Fetch fresh suppliers and map
        const { data, error } = await supabase.from('suppliers').select('*');
        if (error) showToast('Error fetching suppliers: ' + error.message);
        if (data) {
          const mappedSuppliers = data.map((row: any) => ({
            id: row.id,
            name: row.name,
            contactPerson: row.contactperson,
            email: row.email,
            phone: row.phone,
            address: row.address,
            joinDate: row.joindate,
          }));
          setSuppliers(mappedSuppliers);
        }
        closeDeleteConfirm();
      }
    })();
  };

  const filteredSuppliers = useMemo(() => {
    const baseSuppliers = accessibleSuppliers 
        ? suppliers.filter(s => accessibleSuppliers.has(s.name))
        : suppliers;

    if (!searchTerm) {
      return baseSuppliers;
    }

    const lowercasedTerm = searchTerm.toLowerCase();
    return baseSuppliers.filter(supplier =>
      supplier.name.toLowerCase().includes(lowercasedTerm) ||
      supplier.contactPerson.toLowerCase().includes(lowercasedTerm) ||
      supplier.email.toLowerCase().includes(lowercasedTerm)
    );
  },[suppliers, searchTerm, accessibleSuppliers]
  );

  // PDF Export function
  const exportSuppliersPDF = () => {
    const columns = [
      { key: 'name', title: 'Supplier Name' },
      { key: 'contactPerson', title: 'Contact Person' },
      { key: 'phone', title: 'Phone' },
      { key: 'email', title: 'Email' },
      { key: 'address', title: 'Address' },
      { key: 'productCount', title: 'Products' },
      { key: 'totalOrders', title: 'Total Orders' }
    ];

    const data = filteredSuppliers.map(supplier => {
      const supplierProducts = products.filter(p => p.supplier === supplier.name);
      const supplierOrders = orders.filter(order => 
        order.orderItems.some(item => {
          const product = products.find(p => p.id === item.productId);
          return product?.supplier === supplier.name;
        })
      );

      return {
        name: supplier.name,
        contactPerson: supplier.contactPerson,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        productCount: supplierProducts.length.toString(),
        totalOrders: supplierOrders.length.toString()
      };
    });

    exportToPDF('Suppliers Report', columns, data);
  };
  
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <Card>
        <CardHeader>
          <div className="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Suppliers</h1>
              <CardDescription>View and manage your product suppliers.</CardDescription>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Search by name, contact, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <div className="flex items-center gap-2">
                <button
                  onClick={exportSuppliersPDF}
                  className="px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm"
                  title="Export as PDF"
                >
                  📄 PDF
                </button>
                <button
                  onClick={() => exportSuppliers(filteredSuppliers, 'csv')}
                  className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm"
                  title="Export as CSV"
                >
                  📊 CSV
                </button>
                <button
                  onClick={() => exportSuppliers(filteredSuppliers, 'xlsx')}
                  className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm"
                  title="Export as Excel"
                >
                  📋 Excel
                </button>
                {canEdit && (
                  <button onClick={() => openModal('add')} className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm">
                    + Add
                  </button>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3">
            {filteredSuppliers.map((supplier) => {
              const color = colorFor(supplier.name);
              const bgStyle: React.CSSProperties = { borderLeft: `4px solid ${color}` };
              const avatarBg: React.CSSProperties = { backgroundColor: color };
              return (
                // apply a soft background tint matching the supplier color
                <div key={supplier.id} style={{ ...bgStyle, backgroundColor: hexToRgba(color, 0.06) }} className="border border-slate-100 dark:border-slate-700 rounded-lg p-5 shadow-sm hover:shadow-md transition-transform transform hover:-translate-y-0.5 min-h-[180px]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div style={avatarBg} className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-base flex-shrink-0">
                        {initials(supplier.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{supplier.name}</div>
                        <p className="text-xs text-slate-500 truncate mt-1">{supplier.address}</p>
                      </div>
                    </div>
                    <div className="text-xs text-slate-400">{supplier.joinDate}</div>
                  </div>

                  <div className="mt-3 text-sm text-slate-700 dark:text-slate-300">
                    <div className="truncate">{supplier.email}</div>
                    <div className="text-xs text-slate-500">{supplier.phone}</div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-sm text-slate-600 dark:text-slate-400">Orders: <span className="font-medium text-slate-900 dark:text-white">
                      {
                        orders.filter(order => {
                          if (!order.orderItems || order.orderItems.length === 0) return false;
                          return order.orderItems.some(item => {
                            const product = products.find(p => p.id === item.productId);
                            return product && product.supplier === supplier.name;
                          });
                        }).length
                      }
                    </span></div>

                    {canEdit ? (
                      <div className="flex items-center gap-2">
                        <button onClick={() => openModal('edit', supplier)} className="text-sm px-3 py-1 rounded-md font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">Edit</button>
                        <button onClick={() => openDeleteConfirm(supplier)} className="text-sm px-3 py-1 rounded-md font-medium text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300">Delete</button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}

            {filteredSuppliers.length === 0 && (
              <div className="col-span-full text-center py-10">
                <p className="text-slate-500 dark:text-slate-400">No suppliers found matching your criteria.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
      <Modal isOpen={isModalOpen} onClose={closeModal} title={modalMode === 'add' ? 'Add New Supplier' : 'Edit Supplier'}>
        <div className="p-6 space-y-4">
            <div>
              <label htmlFor="name" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Supplier Name</label>
              <input type="text" id="name" value={currentSupplier.name || ''} onChange={e => setCurrentSupplier({...currentSupplier, name: e.target.value})} className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white" required />
            </div>
            <div>
              <label htmlFor="contactPerson" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Contact Person</label>
              <input type="text" id="contactPerson" value={currentSupplier.contactPerson || ''} onChange={e => setCurrentSupplier({...currentSupplier, contactPerson: e.target.value})} className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white" required />
            </div>
             <div>
              <label htmlFor="email" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Email</label>
              <input type="email" id="email" value={currentSupplier.email || ''} onChange={e => setCurrentSupplier({...currentSupplier, email: e.target.value})} className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white" required />
            </div>
            <div>
              <label htmlFor="phone" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Phone</label>
              <input type="tel" id="phone" value={currentSupplier.phone || ''} onChange={e => setCurrentSupplier({...currentSupplier, phone: e.target.value})} className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white" required />
            </div>
             <div>
              <label htmlFor="address" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Address</label>
              <input type="text" id="address" value={currentSupplier.address || ''} onChange={e => setCurrentSupplier({...currentSupplier, address: e.target.value})} className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white" required />
            </div>
        </div>
        <div className="flex items-center justify-end p-6 space-x-2 border-t border-slate-200 rounded-b dark:border-slate-600">
            <button onClick={closeModal} type="button" className="text-slate-500 bg-white hover:bg-slate-100 focus:ring-4 focus:outline-none focus:ring-blue-300 rounded-lg border border-slate-200 text-sm font-medium px-5 py-2.5 hover:text-slate-900 focus:z-10 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-500 dark:hover:text-white dark:hover:bg-slate-600">
                Cancel
            </button>
            <button onClick={handleSave} type="button" className="text-white bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700">
                {modalMode === 'add' ? 'Save Supplier' : 'Save Changes'}
            </button>
        </div>
      </Modal>

      <Modal isOpen={!!supplierToDelete} onClose={closeDeleteConfirm} title="Confirm Deletion">
            <div className="p-6">
                <p className="text-slate-600 dark:text-slate-300">Are you sure you want to delete the supplier "{supplierToDelete?.name}"?</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">This action cannot be undone.</p>
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