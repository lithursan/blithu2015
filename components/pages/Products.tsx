import React, { useState, useMemo } from 'react';
import { Product, UserRole } from '../../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { supabase, fetchProducts } from '../../supabaseClient';
import { exportProducts } from '../../utils/exportUtils';
import { exportToPDF } from '../../utils/pdfExport';
import { useLoading, LoadingButton, LoadingSpinner } from '../../hooks/useLoading';
import { useValidation, validationRules } from '../../hooks/useValidation';
import { confirmSecureDelete } from '../../utils/passwordConfirmation';

const getStockBadgeVariant = (stock: number): 'success' | 'warning' | 'danger' | 'info' => {
    if (stock > 100) return 'success';
    if (stock > 50) return 'info';
    if (stock > 0) return 'warning';
    return 'danger';
};

const getDriverStockBadgeVariant = (stock: number): 'success' | 'warning' | 'danger' | 'info' => {
    if (stock > 20) return 'success';
    if (stock > 10) return 'info';
    if (stock > 0) return 'warning';
    return 'danger';
};

const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount).replace('$', `${currency} `);
};

export const Products: React.FC = () => {
  const { products, setProducts, suppliers, driverAllocations, refetchData, deliveryAggregatedProducts, orders } = useData();
  const todayStr = new Date().toISOString().slice(0,10);
  const deliveryQtyMap = useMemo(() => {
    const map = new Map<string, number>();
    try {
      const arr = deliveryAggregatedProducts?.[todayStr] || [];
      for (const item of arr) {
        if (!item || !item.productId) continue;
        map.set(item.productId, (map.get(item.productId) || 0) + (Number(item.qty) || 0));
      }
    } catch (err) {
      // defensive: if structure is unexpected, return empty map
      console.error('Error building deliveryQtyMap:', err);
    }
    return map;
  }, [deliveryAggregatedProducts, todayStr]);

  const pendingQtyMap = useMemo(() => {
    const map = new Map<string, number>();
    try {
      if (!orders || orders.length === 0) return map;
      const pendingOrders = orders.filter(o => (o.status || '').toString() === 'Pending');
      for (const ord of pendingOrders) {
        (ord.orderItems || []).forEach((it: any) => {
          if (!it || !it.productId) return;
          map.set(it.productId, (map.get(it.productId) || 0) + (Number(it.quantity) || 0));
        });
      }
    } catch (err) {
      console.error('Error building pendingQtyMap:', err);
    }
    return map;
  }, [orders]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [currentProduct, setCurrentProduct] = useState<Partial<Product>>({});
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const { setLoading, isLoading } = useLoading();
  const { errors, validateForm, clearErrors, getFieldError } = useValidation();

  const { currentUser } = useAuth();
  const currency = currentUser?.settings.currency || 'LKR';

  const canEdit = useMemo(() => 
    currentUser?.role === UserRole.Admin || currentUser?.role === UserRole.Secretary || currentUser?.role === UserRole.Manager,
    [currentUser]
  );

  const isDriver = currentUser?.role === UserRole.Driver;

  const accessibleSuppliers = useMemo(() => {
    if (currentUser?.role === UserRole.Sales && currentUser.assignedSupplierNames) {
        return new Set(currentUser.assignedSupplierNames);
    }
    return null; // null means all access for Admin/Manager
  }, [currentUser]);

  const allProducts = useMemo(() => {
    if (!accessibleSuppliers) return products;
    return products.filter(p => accessibleSuppliers.has(p.supplier));
  }, [products, accessibleSuppliers]);

  const displayedProducts = useMemo(() => {
    if (isDriver && currentUser) {
      // Show cumulative allocated quantities up to today (inclusive). This lets drivers see
      // the combined allocations from previous days that are still active (not reconciled).
      const today = new Date().toISOString().split('T')[0];
      const allocationsForDriver = (driverAllocations || []).filter(a => a.driverId === currentUser.id && new Date(a.date) <= new Date(today) && (a.status ?? 'Allocated') !== 'Reconciled');

      if (allocationsForDriver.length > 0) {
        const allocatedQuantities = new Map<string, number>();
        // Sum remaining allocated quantity = quantity - sold for each allocated item
        allocationsForDriver.forEach(alloc => {
          (alloc.allocatedItems || []).forEach((item: any) => {
            try {
              const qty = Number(item?.quantity || 0);
              const sold = Number(item?.sold || 0);
              const remaining = Math.max(0, qty - sold);
              if (remaining <= 0) return;
              const prev = allocatedQuantities.get(item.productId) || 0;
              allocatedQuantities.set(item.productId, prev + remaining);
            } catch (e) {
              // defensive: skip malformed items
            }
          });
        });

        return allProducts
          .filter((product) => allocatedQuantities.has(product.id))
          .map((product) => ({
            ...product,
            stock: allocatedQuantities.get(product.id) || 0, // Override stock with cumulative allocated quantity
          }));
      }
      return []; // Driver with no allocations up to today sees no products.
    }
    return allProducts;
  }, [isDriver, currentUser, driverAllocations, allProducts]);


  const openModal = (mode: 'add' | 'edit', product?: Product) => {
  setModalMode(mode);
  setCurrentProduct(product || { name: '', category: '', price: 0, costPrice: 0, marginPrice: 0, stock: 0, sku: '', supplier: '', imageUrl: '' });
    clearErrors();
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setCurrentProduct({});
  };

  const openDeleteConfirm = (product: Product) => {
    setProductToDelete(product);
  };

  const closeDeleteConfirm = () => {
    setProductToDelete(null);
  };

    const handleSave = () => {
    (async () => {
    try {
      // Validate form
      const productValidationRules = {
        name: validationRules.name,
        category: validationRules.required,
        price: validationRules.price,
        costPrice: validationRules.price, // reuse price validation
        marginPrice: validationRules.price,
        stock: validationRules.stock,
        sku: validationRules.sku,
        supplier: validationRules.required
      };

      const isValid = validateForm(currentProduct, productValidationRules);
      if (!isValid) {
        alert('Please fix the validation errors before saving.');
        return;
      }

      setLoading('save', true);
      
      if (modalMode === 'add') {
        // Generate unique ID using timestamp and random number
        const uniqueId = `PROD${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`;
        // Auto-generate SKU if left empty
        let sku = currentProduct.sku && currentProduct.sku.trim() !== ''
          ? currentProduct.sku.trim()
          : `SKU-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

        const newProduct: Product = {
          id: uniqueId,
          name: currentProduct.name || '',
          category: currentProduct.category || '',
          price: currentProduct.price || 0,
          costPrice: currentProduct.costPrice || 0,
          marginPrice: currentProduct.marginPrice || 0,
          stock: currentProduct.stock || 0,
          sku,
          supplier: currentProduct.supplier || '',
          imageUrl: currentProduct.imageUrl || `https://picsum.photos/seed/${currentProduct.name || 'new'}/400/400`,
        };

        const dbProduct = {
          id: newProduct.id,
          name: newProduct.name,
          category: newProduct.category,
          price: newProduct.price,
          // Persist marginPrice into new DB column `marginprice` and keep legacy `costprice` for compatibility
          marginprice: newProduct.marginPrice,
          // Keep `costprice` as the actual cost input; do not overwrite it with margin
          costprice: newProduct.costPrice,
          stock: newProduct.stock,
          sku: newProduct.sku,
          supplier: newProduct.supplier,
          imageurl: currentProduct.imageUrl || `https://picsum.photos/seed/${currentProduct.name || 'new'}/400/400`,
        };
        
        const { error } = await supabase.from('products').insert([dbProduct]);
        if (error) {
          alert(`Error adding product: ${error.message}`);
          return;
        }
        
        const freshProducts = await fetchProducts();
        if (freshProducts) setProducts(freshProducts);
        alert('Product added successfully!');
        await refetchData();
      } else {
        // Edit mode: update product in DB
        // Update only the fields that changed. Persist margin to `marginprice` but do NOT modify legacy `costprice` here.
        const updatePayload: any = {
          name: currentProduct.name,
          category: currentProduct.category,
          price: currentProduct.price,
          marginprice: currentProduct.marginPrice ?? currentProduct.costPrice,
          // Persist edited cost price when updating product
          costprice: currentProduct.costPrice,
          stock: currentProduct.stock,
          sku: currentProduct.sku,
          supplier: currentProduct.supplier,
          imageurl: currentProduct.imageUrl,
        };

        const { error } = await supabase.from('products').update(updatePayload).eq('id', currentProduct.id);
        
        if (error) {
          alert(`Error updating product: ${error.message}`);
          return;
        }
        
        const freshProducts = await fetchProducts();
        if (freshProducts) setProducts(freshProducts);
        alert('Product updated successfully!');
        await refetchData();
      }
      closeModal();
    } catch (error) {
      console.error('Unexpected error:', error);
      alert('An unexpected error occurred. Please try again.');
    } finally {
      setLoading('save', false);
    }
    })();
  };

  const handleDelete = async () => {
    if (!productToDelete || !currentUser?.email) return;
    
    // Require password confirmation for delete
    const confirmed = await confirmSecureDelete(
      productToDelete.name, 
      'Product', 
      currentUser.email
    );
    
    if (!confirmed) {
      closeDeleteConfirm();
      return;
    }
    
    if (productToDelete) {
      try {
        setLoading('delete', true);
        
        const { error } = await supabase.from('products').delete().eq('id', productToDelete.id);
        if (error) {
          alert(`Error deleting product: ${error.message}`);
          return;
        }
        
        const freshProducts = await fetchProducts();
        if (freshProducts) setProducts(freshProducts);
        alert('Product deleted successfully!');
        await refetchData();
        closeDeleteConfirm();
      } catch (error) {
        console.error('Unexpected error deleting product:', error);
        alert('An unexpected error occurred while deleting. Please try again.');
      } finally {
        setLoading('delete', false);
      }
    }
  };
  
  const handleInputChange = (field: keyof Product, value: string | number) => {
    setCurrentProduct(prev => ({
      ...prev,
      [field]: value,
      ...(field === 'imageUrl' ? { imageUrl: value } : {}),
    }));
  };

  const categories = useMemo(() => ['all', ...new Set(displayedProducts.map(p => p.category))], [displayedProducts]);

  const filteredProducts = displayedProducts.filter(product => {
    const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter;

    const matchesSearch = searchTerm === '' ||
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.supplier.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesCategory && matchesSearch;
  });

  const productsBySupplier = useMemo(() => {
    return filteredProducts.reduce((acc, product) => {
      const supplier = product.supplier || 'Unassigned';
      if (!acc[supplier]) {
        acc[supplier] = [];
      }
      acc[supplier].push(product);
      return acc;
    }, {} as Record<string, Product[]>);
  }, [filteredProducts]);

  // PDF Export function
  const exportProductsPDF = () => {
    const columns = [
      { key: 'sku', title: 'SKU' },
      { key: 'name', title: 'Product Name' },
      { key: 'category', title: 'Category' },
      { key: 'supplier', title: 'Supplier' },
      { key: 'price', title: 'Price' },
      { key: 'stock', title: 'Stock' },
      { key: 'status', title: 'Status' }
    ];

    const data = filteredProducts.map(product => ({
      sku: product.sku,
      name: product.name,
      category: product.category,
      supplier: product.supplier,
      price: formatCurrency(product.price, currency),
      stock: product.stock.toString(),
      status: product.stock <= (product.minStock || 0) ? 'Low Stock' : 'In Stock'
    }));

    exportToPDF('Products Report', columns, data);
  };

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-6 sm:space-y-8">
      <div className="flex flex-col sm:flex-row gap-4 sm:justify-between sm:items-center">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-800 dark:text-slate-100">
            {isDriver ? 'My Allocated Stock' : 'Products'}
        </h1>
        <div className="flex flex-wrap gap-2">
          {/* Export Buttons */}
          <button
            onClick={exportProductsPDF}
            className="px-4 py-2.5 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:from-red-600 hover:to-red-700 transition-all duration-300 text-xs sm:text-sm min-h-[42px] flex items-center justify-center shadow-md hover:shadow-lg transform hover:-translate-y-0.5 font-semibold"
            title="Export as PDF"
          >
            <span className="hidden xs:inline">📄 PDF</span>
            <span className="xs:hidden">PDF</span>
          </button>
          <button
            onClick={() => exportProducts(filteredProducts, 'csv')}
            className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl hover:from-emerald-600 hover:to-emerald-700 transition-all duration-300 text-xs sm:text-sm min-h-[42px] flex items-center justify-center shadow-md hover:shadow-lg transform hover:-translate-y-0.5 font-semibold"
            title="Export as CSV"
          >
            <span className="hidden xs:inline">📊 CSV</span>
            <span className="xs:hidden">CSV</span>
          </button>
          <button
            onClick={() => exportProducts(filteredProducts, 'xlsx')}
            className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl hover:from-emerald-600 hover:to-emerald-700 transition-all duration-300 text-xs sm:text-sm min-h-[42px] flex items-center justify-center shadow-md hover:shadow-lg transform hover:-translate-y-0.5 font-semibold"
            title="Export as Excel"
          >
            <span className="hidden xs:inline">📋 XLS</span>
            <span className="xs:hidden">XLS</span>
          </button>
          {canEdit && (
              <button 
                onClick={() => openModal('add')} 
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-300 text-sm min-h-[42px] flex-1 sm:flex-none shadow-md hover:shadow-lg transform hover:-translate-y-0.5 font-semibold"
              >
                <span className="hidden sm:inline">✨ Add Product</span>
                <span className="sm:hidden">+ Add</span>
              </button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
            <CardTitle className="text-lg sm:text-xl">{isDriver ? "Products for Today's Route" : 'Product Inventory'}</CardTitle>
            <CardDescription className="text-sm sm:text-base">
                {isDriver
                    ? "View the products allocated to you for today. The stock level reflects your allocated amount."
                    : "View and manage all products in your inventory, grouped by supplier."}
            </CardDescription>
          <div className="pt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {categories.map((category, index) => {
                const colors = [
                  'bg-gradient-to-r from-blue-500 to-blue-600 text-white', // All
                  'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white', // CAR WASH
                  'bg-gradient-to-r from-purple-500 to-purple-600 text-white', // TILE CLEANER - HD
                  'bg-gradient-to-r from-orange-500 to-orange-600 text-white', // CLOROMAX
                  'bg-gradient-to-r from-teal-500 to-teal-600 text-white', // FABRIC SOFTNER -MIX
                  'bg-gradient-to-r from-pink-500 to-pink-600 text-white', // GLASS CLEANER
                  'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white', // HAND WASH - ACT/LIME
                  'bg-gradient-to-r from-cyan-500 to-cyan-600 text-white', // LAUNDRY LIQUID
                  'bg-gradient-to-r from-red-500 to-red-600 text-white', // TOILET CLEANER
                  'bg-gradient-to-r from-yellow-500 to-yellow-600 text-white', // PREMEX
                  'bg-gradient-to-r from-green-500 to-green-600 text-white', // SHALIGHT
                  'bg-gradient-to-r from-amber-500 to-amber-600 text-white', // DISH WASH
                  'bg-gradient-to-r from-violet-500 to-violet-600 text-white', // CALCIUM REMOVER
                  'bg-gradient-to-r from-lime-500 to-lime-600 text-white', // PENOL
                  'bg-gradient-to-r from-rose-500 to-rose-600 text-white', // AF-MIX
                ];
                
                const activeColor = colors[index % colors.length];
                const inactiveColor = 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600';
                
                return (
                  <button
                    key={category}
                    onClick={() => setCategoryFilter(category)}
                    className={`px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-xl transition-all duration-300 focus:outline-none focus:ring-3 focus:ring-offset-2 dark:focus:ring-offset-slate-800 focus:ring-blue-300 min-h-[40px] shadow-sm hover:shadow-md transform hover:-translate-y-0.5 ${
                      categoryFilter === category ? activeColor : inactiveColor
                    }`}
                  >
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </button>
                );
              })}
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder={isDriver ? "Search your allocated products..." : "Search by name, category, SKU, or supplier..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-gradient-to-r from-white to-slate-50 dark:from-slate-700 dark:to-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-3 focus:ring-blue-300 focus:border-blue-500 text-sm sm:text-base min-h-[48px] shadow-sm transition-all duration-300"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
        {isDriver ? (
            // Driver View: Mobile-responsive layout
            <div className="space-y-6 sm:space-y-8">
                {filteredProducts.length > 0 ? (
                    <>
                      {/* Desktop Table View */}
                      <div className="hidden lg:block overflow-x-auto border dark:border-slate-700 rounded-lg">
                          <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                              <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-400">
                                  <tr>
                                      <th scope="col" className="px-6 py-3">Product</th>
                                      <th scope="col" className="px-6 py-3">Category</th>
                                      <th scope="col" className="px-6 py-3">Price</th>
              <th scope="col" className="px-6 py-3">Allocated Stock</th>
        <th scope="col" className="px-6 py-3">Pending</th>
          <th scope="col" className="px-6 py-3">SKU</th>
                                  </tr>
                              </thead>
                              <tbody>
                                  {filteredProducts.map((product) => (
                                      <tr key={product.id} className="bg-white border-b dark:bg-slate-800 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600">
                                          <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                                              <div className="flex items-center space-x-3">
                            {product.imageUrl ? (
                              <img src={product.imageUrl} alt={product.name} className="w-10 h-10 rounded-full" />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 text-xl">
                                <span>?</span>
                              </div>
                            )}
                                                  <span>{product.name}</span>
                                              </div>
                                          </td>
                                          <td className="px-6 py-4">{product.category}</td>
                                          <td className="px-6 py-4">{formatCurrency(product.price, currency)}</td>
                                          <td className="px-6 py-4">
                                              <Badge variant={getDriverStockBadgeVariant(product.stock)}>{product.stock}</Badge>
                                          </td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-mono text-sm text-rose-500 dark:text-rose-400">{pendingQtyMap.get(product.id) || 0}</span>
                      </td>
                                          <td className="px-6 py-4">{product.sku}</td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      </div>

                      {/* Mobile Card View */}
                      <div className="lg:hidden space-y-3">
                          {filteredProducts.map((product) => (
                              <div key={product.id} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                                  <div className="flex items-start justify-between mb-3">
                                      <div className="flex items-center space-x-3 flex-1">
                                          {product.imageUrl ? (
                                              <img src={product.imageUrl} alt={product.name} className="w-12 h-12 rounded-full flex-shrink-0" />
                                          ) : (
                                              <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 text-lg flex-shrink-0">
                                                  <span>?</span>
                                              </div>
                                          )}
                                          <div className="min-w-0 flex-1">
                                              <div className="font-semibold text-slate-900 dark:text-white text-sm sm:text-base truncate">{product.name}</div>
                                              <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">{product.category}</div>
                                              <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-500">SKU: {product.sku}</div>
                                          </div>
                                      </div>
                                  </div>
                                  
                                  <div className="flex items-center justify-between">
                                      <div className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                                          {formatCurrency(product.price, currency)}
                                      </div>
                                  <div className="flex items-center gap-3">
                                  <Badge variant={getDriverStockBadgeVariant(product.stock)} className="text-xs">Stock: {product.stock}</Badge>
                                              <div className="flex flex-col text-xs text-slate-400 dark:text-slate-300 font-mono">
                                                <span className="text-rose-500">Pending: {pendingQtyMap.get(product.id) || 0}</span>
                                              </div>
                                  </div>
                                  </div>
                              </div>
                          ))}
                      </div>
                    </>
                ) : (
                    <div className="text-center py-8 sm:py-10">
                         <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base px-4">
                            {displayedProducts.length === 0 
                                ? "You have no products allocated for today."
                                : "No products found matching your criteria."
                            }
                        </p>
                    </div>
                )}
            </div>
        ) : (
            // Admin/Manager/Sales View: Mobile-responsive grouped by supplier
            <div className="space-y-6 sm:space-y-8">
                {Object.entries(productsBySupplier).map(([supplierName, supplierProducts]) => {
                  const productsArr = supplierProducts as Product[];
                  return (
                    <div key={supplierName}>
                      <div className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-700 rounded-xl p-4 mb-6 border-l-4 border-blue-500 shadow-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-md">
                              {supplierName.charAt(0)}
                            </div>
                            <div>
                              <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
                                {supplierName}
                              </h2>
                              <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                                Product Collection
                              </p>
                            </div>
                          </div>
                          <Badge variant="success" className="self-start sm:self-auto bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-3 py-1 rounded-full font-semibold shadow-md">
                            {productsArr.length} {productsArr.length === 1 ? 'Product' : 'Products'}
                          </Badge>
                        </div>
                      </div>

                      {/* Desktop Table View */}
                      <div className="hidden xl:block overflow-x-auto border border-slate-200 dark:border-slate-600 rounded-xl shadow-lg">
                        <table className="w-full text-sm text-left text-slate-600 dark:text-slate-300">
                          <thead className="text-xs text-slate-800 uppercase bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 dark:text-slate-200 font-bold">
                            <tr>
                              <th scope="col" className="px-6 py-3">Product</th>
                              <th scope="col" className="px-6 py-3">Category</th>
                              <th scope="col" className="px-6 py-3">Price</th>
                                {canEdit && <th scope="col" className="px-6 py-3">Cost Price</th>}
                                {canEdit && <th scope="col" className="px-6 py-3">Margin Price</th>}
                              <th scope="col" className="px-6 py-3">Pending</th>
                              <th scope="col" className="px-6 py-3">Stock</th>
                              <th scope="col" className="px-6 py-3">SKU</th>
                              {canEdit && <th scope="col" className="px-6 py-3">Actions</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {productsArr.map((product) => (
                              <tr key={product.id} className="bg-white border-b border-slate-100 dark:bg-slate-800 dark:border-slate-600 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 dark:hover:from-slate-700 dark:hover:to-slate-600 transition-all duration-300">
                                <td className="px-6 py-4 font-semibold text-slate-800 dark:text-white">
                                  <div className="flex items-center space-x-3">
                                    {product.imageUrl ? (
                                      <img src={product.imageUrl} alt={product.name} className="w-10 h-10 rounded-full" />
                                    ) : (
                                      <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 text-xl">
                                        <span>?</span>
                                      </div>
                                    )}
                                    <span>{product.name}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4">{product.category}</td>
                                <td className="px-6 py-4">{formatCurrency(product.price, currency)}</td>
                                {canEdit && <td className="px-6 py-4">{formatCurrency(product.costPrice || 0, currency)}</td>}
                                {canEdit && <td className="px-6 py-4">{formatCurrency(product.marginPrice || 0, currency)}</td>}
                                <td className="px-6 py-4 text-right">
                                  <span className="font-mono text-sm text-rose-600 dark:text-rose-400">{pendingQtyMap.get(product.id) || 0}</span>
                                </td>
                                
                                <td className="px-6 py-4">
                                  <Badge variant={getStockBadgeVariant(product.stock)}>{product.stock}</Badge>
                                </td>
                                <td className="px-6 py-4">{product.sku}</td>
                                {canEdit && (
                                  <td className="px-6 py-4">
                                    <div className="flex items-center space-x-3">
                                      <button 
                                        onClick={() => openModal('edit', product)} 
                                        className="px-3 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-xs font-semibold rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                                      >
                                        Edit
                                      </button>
                                      <button 
                                        onClick={() => openDeleteConfirm(product)} 
                                        className="px-3 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white text-xs font-semibold rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile Card View */}
                      <div className="xl:hidden space-y-3">
                        {productsArr.map((product) => (
                          <div key={product.id} className="bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-600 shadow-md hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
                              <div className="flex items-start justify-between mb-4">
                              <div className="flex items-center space-x-3 flex-1">
                                {product.imageUrl ? (
                                  <img src={product.imageUrl} alt={product.name} className="w-12 h-12 rounded-full flex-shrink-0" />
                                ) : (
                                  <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 text-lg flex-shrink-0">
                                    <span>?</span>
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="font-semibold text-slate-900 dark:text-white text-sm sm:text-base truncate">{product.name}</div>
                                  <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">{product.category}</div>
                                  <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-500">SKU: {product.sku}</div>
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <Badge variant={getStockBadgeVariant(product.stock)} className="ml-2 flex-shrink-0 text-xs">
                                  {product.stock}
                                </Badge>
                                
                                <div className="text-xs text-rose-500 font-mono">Pending: {pendingQtyMap.get(product.id) || 0}</div>
                              </div>
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <div className="flex flex-col">
                                <div className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                                  {formatCurrency(product.price, currency)}
                                </div>
                                {canEdit && (
                                  <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                                    <div>Cost: {formatCurrency(product.costPrice || 0, currency)}</div>
                                    <div>Margin: {formatCurrency(product.marginPrice || 0, currency)}</div>
                                  </div>
                                )}
                              </div>
                              
                              {canEdit && (
                                <div className="flex gap-3">
                                  <button 
                                    onClick={() => openModal('edit', product)} 
                                    className="bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold text-xs px-4 py-2 rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-300 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 min-h-[36px]"
                                  >
                                    Edit
                                  </button>
                                  <button 
                                    onClick={() => openDeleteConfirm(product)} 
                                    className="bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold text-xs px-4 py-2 rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-300 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 min-h-[36px]"
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {Object.keys(productsBySupplier).length === 0 && (
                <div className="text-center py-8 sm:py-10">
                    <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base px-4">No products found matching your criteria.</p>
                </div>
                )}
            </div>
        )}
        </CardContent>
      </Card>
      
      <Modal isOpen={isModalOpen} onClose={closeModal} title={modalMode === 'add' ? 'Add New Product' : 'Edit Product'}>
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="name" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Product Name</label>
              <input type="text" id="name" value={currentProduct.name || ''} onChange={e => handleInputChange('name', e.target.value)} className="bg-slate-50 border border-slate-300 text-slate-900 text-sm sm:text-base rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-3 sm:p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white min-h-[44px]" required />
            </div>
            <div>
              <label htmlFor="category" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Category</label>
              <input type="text" id="category" value={currentProduct.category || ''} onChange={e => handleInputChange('category', e.target.value)} className="bg-slate-50 border border-slate-300 text-slate-900 text-sm sm:text-base rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-3 sm:p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white min-h-[44px]" required />
            </div>
            <div>
              <label htmlFor="price" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Price ({currency})</label>
              <input type="number" id="price" value={currentProduct.price || ''} onChange={e => handleInputChange('price', parseFloat(e.target.value) || 0)} className="bg-slate-50 border border-slate-300 text-slate-900 text-sm sm:text-base rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-3 sm:p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white min-h-[44px]" required />
            </div>
            <div>
              <label htmlFor="costPrice" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Cost Price ({currency})</label>
              <input type="number" id="costPrice" value={currentProduct.costPrice || ''} onChange={e => handleInputChange('costPrice', parseFloat(e.target.value) || 0)} className="bg-slate-50 border border-slate-300 text-slate-900 text-sm sm:text-base rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-3 sm:p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white min-h-[44px]" required />
            </div>
            <div>
              <label htmlFor="marginPrice" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Margin Price ({currency})</label>
              <input type="number" id="marginPrice" value={currentProduct.marginPrice || ''} onChange={e => handleInputChange('marginPrice', parseFloat(e.target.value) || 0)} className="bg-slate-50 border border-slate-300 text-slate-900 text-sm sm:text-base rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-3 sm:p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white min-h-[44px]" />
            </div>
            <div>
              <label htmlFor="stock" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Stock</label>
              <input type="number" id="stock" value={currentProduct.stock || ''} onChange={e => handleInputChange('stock', parseInt(e.target.value, 10) || 0)} className="bg-slate-50 border border-slate-300 text-slate-900 text-sm sm:text-base rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-3 sm:p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white min-h-[44px]" required />
            </div>
            <div>
              <label htmlFor="sku" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">SKU</label>
              <input type="text" id="sku" value={currentProduct.sku || ''} onChange={e => handleInputChange('sku', e.target.value)} placeholder="Auto-generated if left empty" className="bg-slate-50 border border-slate-300 text-slate-900 text-sm sm:text-base rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-3 sm:p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white min-h-[44px]" />
            </div>
            <div>
              <label htmlFor="supplier" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Supplier</label>
               <select 
                id="supplier" 
                value={currentProduct.supplier || ''} 
                onChange={e => handleInputChange('supplier', e.target.value)} 
                className="bg-slate-50 border border-slate-300 text-slate-900 text-sm sm:text-base rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-3 sm:p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white min-h-[44px]" 
                required
              >
                  <option value="" disabled>Select a supplier</option>
                  {suppliers.map(supplier => (
                      <option key={supplier.id} value={supplier.name}>{supplier.name}</option>
                  ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="imageUrl" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Image URL</label>
              <input type="text" id="imageUrl" value={currentProduct.imageUrl || ''} onChange={e => handleInputChange('imageUrl', e.target.value)} className="bg-slate-50 border border-slate-300 text-slate-900 text-sm sm:text-base rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-3 sm:p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white min-h-[44px]" />
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end p-4 sm:p-6 space-y-2 sm:space-y-0 sm:space-x-2 border-t border-slate-200 rounded-b dark:border-slate-600">
            <button onClick={closeModal} type="button" className="text-slate-500 bg-white hover:bg-slate-100 focus:ring-4 focus:outline-none focus:ring-blue-300 rounded-lg border border-slate-200 text-sm font-medium px-5 py-3 sm:py-2.5 hover:text-slate-900 focus:z-10 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-500 dark:hover:text-white dark:hover:bg-slate-600 min-h-[44px] order-2 sm:order-1">
                Cancel
            </button>
            <LoadingButton 
                isLoading={isLoading('save')}
                onClick={handleSave}
                className="text-white bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-3 sm:py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 min-h-[44px] order-1 sm:order-2"
            >
                {modalMode === 'add' ? 'Save Product' : 'Save Changes'}
            </LoadingButton>
        </div>
      </Modal>

      <Modal isOpen={!!productToDelete} onClose={closeDeleteConfirm} title="Confirm Deletion">
            <div className="p-4 sm:p-6">
                <p className="text-slate-600 dark:text-slate-300 text-sm sm:text-base">Are you sure you want to delete the product "{productToDelete?.name}"?</p>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">This action cannot be undone.</p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end p-4 sm:p-6 space-y-2 sm:space-y-0 sm:space-x-2 border-t border-slate-200 rounded-b dark:border-slate-600">
                <button onClick={closeDeleteConfirm} type="button" className="text-slate-500 bg-white hover:bg-slate-100 focus:ring-4 focus:outline-none focus:ring-blue-300 rounded-lg border border-slate-200 text-sm font-medium px-5 py-3 sm:py-2.5 hover:text-slate-900 focus:z-10 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-500 dark:hover:text-white dark:hover:bg-slate-600 min-h-[44px] order-2 sm:order-1">
                    Cancel
                </button>
                <LoadingButton 
                    isLoading={isLoading('delete')}
                    onClick={handleDelete}
                    className="text-white bg-red-600 hover:bg-red-700 focus:ring-4 focus:outline-none focus:ring-red-300 font-medium rounded-lg text-sm px-5 py-3 sm:py-2.5 text-center dark:bg-red-600 dark:hover:bg-red-700 min-h-[44px] order-1 sm:order-2"
                >
                    Delete
                </LoadingButton>
            </div>
        </Modal>
    </div>
  );
};