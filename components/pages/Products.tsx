import React, { useState, useMemo } from 'react';
import { Product, UserRole } from '../../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { supabase, fetchProducts } from '../../supabaseClient';
import { exportProducts } from '../../utils/exportUtils';
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
  const { products, setProducts, suppliers, driverAllocations, refetchData } = useData();
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
    currentUser?.role === UserRole.Admin || currentUser?.role === UserRole.Manager,
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
      const today = new Date().toISOString().split('T')[0];
      const allocation = driverAllocations.find(
        (alloc) => alloc.driverId === currentUser.id && alloc.date === today
      );

      if (allocation) {
        const allocatedQuantities = new Map(
          allocation.allocatedItems.map((item) => [item.productId, item.quantity])
        );

        return allProducts
          .filter((product) => allocatedQuantities.has(product.id))
          .map((product) => ({
            ...product,
            stock: allocatedQuantities.get(product.id) || 0, // Override stock with allocated quantity
          }));
      }
      return []; // Driver with no allocation for today sees no products.
    }
    return allProducts;
  }, [isDriver, currentUser, driverAllocations, allProducts]);


  const openModal = (mode: 'add' | 'edit', product?: Product) => {
  setModalMode(mode);
  setCurrentProduct(product || { name: '', category: '', price: 0, costPrice: 0, stock: 0, sku: '', supplier: '', imageUrl: '' });
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
        const { error } = await supabase.from('products').update({
          name: currentProduct.name,
          category: currentProduct.category,
          price: currentProduct.price,
          costprice: currentProduct.costPrice,
          stock: currentProduct.stock,
          sku: currentProduct.sku,
          supplier: currentProduct.supplier,
          imageurl: currentProduct.imageUrl,
        }).eq('id', currentProduct.id);
        
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

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-6 sm:space-y-8">
      <div className="flex flex-col sm:flex-row gap-4 sm:justify-between sm:items-center">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-800 dark:text-slate-100">
            {isDriver ? 'My Allocated Stock' : 'Products'}
        </h1>
        <div className="flex flex-wrap gap-2">
          {/* Export Buttons */}
          <button
            onClick={() => exportProducts(filteredProducts, 'csv')}
            className="px-3 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-xs sm:text-sm min-h-[40px] flex items-center justify-center"
            title="Export as CSV"
          >
            <span className="hidden xs:inline">📊 CSV</span>
            <span className="xs:hidden">CSV</span>
          </button>
          <button
            onClick={() => exportProducts(filteredProducts, 'xlsx')}
            className="px-3 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-xs sm:text-sm min-h-[40px] flex items-center justify-center"
            title="Export as Excel"
          >
            <span className="hidden xs:inline">📋 Excel</span>
            <span className="xs:hidden">XLS</span>
          </button>
          {canEdit && (
              <button onClick={() => openModal('add')} className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm min-h-[40px] flex-1 sm:flex-none">
              <span className="hidden sm:inline">Add Product</span>
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
              {categories.map(category => (
                <button
                  key={category}
                  onClick={() => setCategoryFilter(category)}
                  className={`px-3 py-2 text-xs sm:text-sm font-medium rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-800 focus:ring-blue-500 min-h-[36px] ${
                    categoryFilter === category
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                  }`}
                >
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder={isDriver ? "Search your allocated products..." : "Search by name, category, SKU, or supplier..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 sm:px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm sm:text-base min-h-[44px]"
            />
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
                                      <Badge variant={getDriverStockBadgeVariant(product.stock)} className="text-xs">
                                          Stock: {product.stock}
                                      </Badge>
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
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-4">
                        <h2 className="text-lg sm:text-xl font-semibold text-slate-700 dark:text-slate-300">{supplierName}</h2>
                        <Badge variant="default" className="self-start sm:self-auto">{productsArr.length} {productsArr.length === 1 ? 'Product' : 'Products'}</Badge>
                      </div>

                      {/* Desktop Table View */}
                      <div className="hidden xl:block overflow-x-auto border dark:border-slate-700 rounded-lg">
                        <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                          <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-400">
                            <tr>
                              <th scope="col" className="px-6 py-3">Product</th>
                              <th scope="col" className="px-6 py-3">Category</th>
                              <th scope="col" className="px-6 py-3">Price</th>
                              {canEdit && <th scope="col" className="px-6 py-3">Cost Price</th>}
                              <th scope="col" className="px-6 py-3">Stock</th>
                              <th scope="col" className="px-6 py-3">SKU</th>
                              {canEdit && <th scope="col" className="px-6 py-3">Actions</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {productsArr.map((product) => (
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
                                {canEdit && <td className="px-6 py-4">{formatCurrency(product.costPrice || 0, currency)}</td>}
                                <td className="px-6 py-4">
                                  <Badge variant={getStockBadgeVariant(product.stock)}>{product.stock}</Badge>
                                </td>
                                <td className="px-6 py-4">{product.sku}</td>
                                {canEdit && (
                                  <td className="px-6 py-4 flex items-center space-x-2">
                                    <button onClick={() => openModal('edit', product)} className="font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">Edit</button>
                                    <button onClick={() => openDeleteConfirm(product)} className="font-medium text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300">Delete</button>
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
                              <Badge variant={getStockBadgeVariant(product.stock)} className="ml-2 flex-shrink-0 text-xs">
                                {product.stock}
                              </Badge>
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <div className="flex flex-col">
                                <div className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                                  {formatCurrency(product.price, currency)}
                                </div>
                                {canEdit && (
                                  <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                                    Cost: {formatCurrency(product.costPrice || 0, currency)}
                                  </div>
                                )}
                              </div>
                              
                              {canEdit && (
                                <div className="flex gap-2">
                                  <button onClick={() => openModal('edit', product)} className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium text-xs bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded min-h-[36px]">
                                    Edit
                                  </button>
                                  <button onClick={() => openDeleteConfirm(product)} className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-medium text-xs bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded min-h-[36px]">
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