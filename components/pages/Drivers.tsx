import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { User, UserRole, UserStatus, Product, DriverAllocation, DriverSale } from '../../types';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../ui/Card';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { COMPANY_DETAILS } from '../../constants';
import { supabase } from '../../supabaseClient';
import html2pdf from 'html2pdf.js';
import { exportDriverAllocations, exportDriverSales } from '../../utils/exportUtils';
import { exportToPDF } from '../../utils/pdfExport';
import { LoadingSpinner } from '@/hooks/useLoading';

const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount).replace('$', `${currency} `);
};

const todayStr = new Date().toISOString().split('T')[0];

export const Drivers: React.FC = () => {
    const { users, products, setProducts, driverAllocations, setDriverAllocations, suppliers, deliveryAggregatedProducts, setDeliveryAggregatedProducts } = useData();
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

    const currency = currentUser?.settings.currency || 'LKR';

    const [selectedDriver, setSelectedDriver] = useState<User | null>(null);
    const [selectedDate, setSelectedDate] = useState<string>(todayStr);
    const [modal, setModal] = useState<'closed' | 'allocate' | 'log'>('closed');
    const [allocationQuantities, setAllocationQuantities] = useState<Record<string, number>>({});
    const [isEditMode, setIsEditMode] = useState(false);
    const [allocationSupplier, setAllocationSupplier] = useState<string>('');
    
    const drivers = useMemo(() => users.filter(u => u.role === UserRole.Driver && u.status === UserStatus.Active), [users]);
    const todayAllocations = useMemo(() => {
        if (!driverAllocations || !selectedDate) return [];
        return driverAllocations.filter(alloc => {
            if (!alloc || !alloc.date) return false;
            const d = typeof alloc.date === 'string' ? alloc.date.slice(0,10) : new Date(alloc.date).toISOString().slice(0,10);
            return d === selectedDate;
        });
    }, [driverAllocations, selectedDate]);

    // Helper: return the single "latest" allocation for a driver from a list (prefer created_at, fallback to id)
    const getLatestAllocationForDriverFromList = (list: any[], drv: User | { id?: string; name?: string }) => {
        if (!Array.isArray(list) || !drv) return undefined;
        const matches = list.filter(a => matchAllocationToDriver(a, drv));
        if (!matches || matches.length === 0) return undefined;
        // Prefer created_at/createdAt when available; fall back to id string ordering
        const pickKey = (x: any) => (x?.created_at ?? x?.createdAt ?? x?.id ?? '').toString();
        return matches.reduce((best, cur) => {
            const bestKey = pickKey(best);
            const curKey = pickKey(cur);
            // simple lexicographic compare is OK as a fallback for UUIDs; created_at if present will be a sortable ISO string
            return curKey > bestKey ? cur : best;
        }, matches[0]);
    };

    // Helper: robust driver-allocation matcher (compare trimmed ids and fallback to name)
    const matchAllocationToDriver = (alloc: any, driver: User | { id?: string; name?: string }) => {
        if (!alloc) return false;
        const aid = (alloc.driverId || alloc.driver_id || '').toString().trim();
        const aname = (alloc.driverName || alloc.driver_name || '').toString().trim().toLowerCase();
        const did = (driver.id || '').toString().trim();
        const dname = (driver.name || '').toString().trim().toLowerCase();
        if (aid && did && aid === did) return true;
        if (aid && did && (aid.includes(did) || did.includes(aid))) return true;
        if (aname && dname && aname === dname) return true;
        if (aname && dname && (aname.includes(dname) || dname.includes(aname))) return true;
        return false;
    };

    // Move fallback UI after all hooks
    let fallbackUI: React.ReactNode = null;
    if (!drivers || drivers.length === 0) {
        fallbackUI = (
            <LoadingSpinner size="lg"/>
        );
    }

    const accessibleSuppliers = useMemo(() => {
        if (currentUser?.role === UserRole.Sales && currentUser.assignedSupplierNames) {
            return new Set(currentUser.assignedSupplierNames);
        }
        return null; // null means all access for Admin/Manager
    }, [currentUser]);

    const availableProducts = useMemo(() => {
        if (!accessibleSuppliers) return products;
        return products.filter(p => accessibleSuppliers.has(p.supplier));
    }, [products, accessibleSuppliers]);

     const availableSuppliers = useMemo(() => {
        if (!accessibleSuppliers) return suppliers;
        return suppliers.filter(s => accessibleSuppliers.has(s.name));
    }, [suppliers, accessibleSuppliers]);

    const handleOpenAllocateModal = (driver: User) => {
        setSelectedDriver(driver);
        // Don't use deliveryAggregatedProducts - let user manually enter quantities
        // This avoids the multiplication issue completely
        setAllocationQuantities({});
        setIsEditMode(false);
        setAllocationSupplier(availableSuppliers.length > 0 ? availableSuppliers[0].name : '');
        setModal('allocate');
    };
    
    const handleOpenEditAllocateModal = (driver: User) => {
        const allocation = getLatestAllocationForDriverFromList(todayAllocations, driver);
        if (!allocation) {
            console.warn('No allocation found for driver:', driver.id, driver.name, todayAllocations);
            alert('No allocation found for this driver today. Please allocate first.');
            return;
        }

        setSelectedDriver(driver);
        const initialQuantities = allocation.allocatedItems.reduce((acc, item) => {
            acc[item.productId] = item.quantity;
            return acc;
        }, {} as Record<string, number>);

        setAllocationQuantities(initialQuantities);
        setIsEditMode(true);
        setAllocationSupplier('');
        setModal('allocate');
    };

    const handleOpenLogModal = (driver: User) => {
        setSelectedDriver(driver);
        setModal('log');
    };

    const handleCloseModal = () => {
        setSelectedDriver(null);
        setModal('closed');
        setIsEditMode(false);
    };

    const handleAllocationChange = (productId: string, quantity: number, max: number) => {
        const newQuantity = Math.max(0, Math.min(quantity, max));
        setAllocationQuantities(prev => ({ ...prev, [productId]: newQuantity }));
    };

    const handleSaveAllocation = () => {
        if (!selectedDriver) return;

        const newAllocatedItems = Object.entries(allocationQuantities)
            .filter(([, qty]) => typeof qty === 'number' && qty > 0)
            .map(([productId, quantity]) => ({ productId, quantity: Number(quantity) }));
            
        console.log('🔍 ALLOCATION QUANTITIES from form:', allocationQuantities);
        console.log('🔍 NEW ALLOCATED ITEMS processed:', newAllocatedItems);

        if (newAllocatedItems.length === 0 && !isEditMode) {
            alert("Please allocate at least one item.");
            return;
        }

        const saveAllocationToDB = async (allocation: DriverAllocation) => {
            console.log('💾 Saving allocation to database:', allocation);
            console.log('💾 Allocated items being saved:', allocation.allocatedItems);
            
            // First, check if there are existing allocations for this driver and date
            const { data: existingAllocations } = await supabase
                .from('driver_allocations')
                .select('*')
                .or(`driver_id.eq.${allocation.driverId},driverid.eq.${allocation.driverId}`)
                .eq('date', allocation.date);
                
            if (existingAllocations && existingAllocations.length > 0) {
                console.warn('⚠️ EXISTING ALLOCATIONS found for this driver and date:', existingAllocations.length);
                console.warn('⚠️ Existing allocations:', existingAllocations);
            }
            
            const { error } = await supabase
                .from('driver_allocations')
                .upsert([
                    {
                        id: allocation.id,
                        driver_id: allocation.driverId, // Only use driver_id, not both
                        driver_name: allocation.driverName, // Only use driver_name, not both
                        date: allocation.date,
                        allocated_items: JSON.stringify(allocation.allocatedItems),
                        returneditems: allocation.returnedItems ? JSON.stringify(allocation.returnedItems) : null,
                        salestotal: allocation.salesTotal,
                        status: 'Allocated', // Always set status to Allocated on save
                    }
                ]);
            if (error) {
                console.error('Supabase allocation save error:', error);
                alert(
                  `Allocation save failed!\n` +
                  `Message: ${error.message || ''}\n` +
                  `Details: ${error.details || ''}\n` +
                  `Hint: ${error.hint || ''}`
                );
            }
        };

        const fetchAllocationsFromDB = async () => {
            const { data, error } = await supabase.from('driver_allocations').select('*');
            if (error) {
                console.error('Supabase allocation fetch error:', error);
                return;
            }
            if (data) {
                console.log('📥 RAW DATABASE ALLOCATIONS:', data);
                console.log('📥 Total allocations in database:', data.length);
                
                // Check for duplicates in database
                const driverDateCombos = data.map(row => `${row.driver_id || row.driverid}-${row.date}`);
                const uniqueCombos = [...new Set(driverDateCombos)];
                if (driverDateCombos.length !== uniqueCombos.length) {
                    console.warn('⚠️ DUPLICATE DRIVER-DATE COMBINATIONS in database!');
                    console.warn('Total combinations:', driverDateCombos.length, 'Unique:', uniqueCombos.length);
                }
                const mapped = data.map((row: any) => ({
                    id: row.id,
                    driverId: row.driver_id ?? row.driverid,
                    driverName: row.driver_name ?? row.drivername,
                    date: row.date,
                    allocatedItems: (() => {
                        if (row.allocated_items) {
                            if (typeof row.allocated_items === 'string') {
                                try { 
                                    return JSON.parse(row.allocated_items);
                                } catch { return []; }
                            }
                            return row.allocated_items;
                        }
                        if (row.allocateditems) {
                            if (typeof row.allocateditems === 'string') {
                                try { 
                                    return JSON.parse(row.allocateditems);
                                } catch { return []; }
                            }
                            return row.allocateditems;
                        }
                        return [];
                    })(),
                    returnedItems: (() => {
                        if (row.returned_items) {
                            if (typeof row.returned_items === 'string') {
                                try { return JSON.parse(row.returned_items); } catch { return null; }
                            }
                            return row.returned_items;
                        }
                        if (row.returneditems) {
                            if (typeof row.returneditems === 'string') {
                                try { return JSON.parse(row.returneditems); } catch { return null; }
                            }
                            return row.returneditems;
                        }
                        return null;
                    })(),
                    salesTotal: row.sales_total ?? row.salestotal ?? 0,
                    status: row.status ?? 'Allocated',
                }));
                setDriverAllocations(mapped);
            }
        };

        const doSave = async () => {
            if (isEditMode) {
                // Find the correct allocation from DB (by id)
                const originalAllocation = driverAllocations.find(a => selectedDriver ? ( ( (a.driverId || a.driver_id || '').toString().trim() === (selectedDriver.id || '').toString().trim() || (a.driverId || '').toString().trim().includes((selectedDriver.id || '').toString().trim()) ) && a.date === selectedDate ) : false);
                if (!originalAllocation) {
                    alert('No allocation found to edit.');
                    return;
                }
                const stockChanges: Record<string, number> = {};

                originalAllocation.allocatedItems.forEach(({ productId, quantity }) => {
                    stockChanges[productId] = (stockChanges[productId] || 0) + quantity;
                });

                newAllocatedItems.forEach(({ productId, quantity }) => {
                    stockChanges[productId] = (stockChanges[productId] || 0) - quantity;
                });

                // Always use the correct DB id for upsert
                await saveAllocationToDB({
                    ...originalAllocation,
                    allocatedItems: newAllocatedItems
                });
            } else {
                const newAllocation: DriverAllocation = {
                    id: crypto.randomUUID(),
                    driverId: selectedDriver.id,
                    driverName: selectedDriver.name,
                    date: selectedDate,
                    allocatedItems: newAllocatedItems,
                    returnedItems: null,
                    salesTotal: 0,
                    status: 'Allocated',
                };
                
                console.log('🆕 Creating new allocation:', newAllocation);
                console.log('🆕 New allocated items:', newAllocatedItems);
                console.log('🆕 Allocation quantities from UI:', allocationQuantities);
                
                await saveAllocationToDB(newAllocation);
            }
            // Always fetch fresh allocations after save
            await fetchAllocationsFromDB();
            
            // Force main products page to fetch fresh products from Supabase
            try {
                const { data: freshProducts, error: prodError } = await supabase.from('products').select('*');
                if (prodError) {
                    console.error('Error refreshing products:', prodError);
                } else if (freshProducts) {
                    setProducts(freshProducts.map((row: any) => ({
                        id: row.id,
                        name: row.name,
                        category: row.category,
                        price: row.price,
                        stock: row.stock,
                        sku: row.sku,
                        supplier: row.supplier,
                        imageUrl: row.imageurl || row.imageUrl || '',
                    })));
                }
            } catch (error) {
                console.error('Unexpected error refreshing products:', error);
            }
            
            handleCloseModal();
        };
        doSave();
    };

    const getDriverStatus = (driverId: string): { status: 'Allocated' | 'Reconciled' | 'Not Allocated', badge: 'info' | 'success' | 'default' } => {
        // Status should reflect allocations up to the selected date (inclusive). If any active (non-reconciled)
        // allocation exists on or before the selected date, consider the driver Allocated.
        const did = (driverId || '').toString().trim();
        // First, check allocations that are exactly for the selected date. If a today's allocation exists
        // and it's reconciled, we should show Not Allocated for immediate UX clarity after reconciliation.
        const allocsForSelectedDate = (driverAllocations || []).filter(a => {
            if (!a || !a.date) return false;
            const aid = (a.driverId || a.driver_id || '').toString().trim();
            if (!aid || !did) return false;
            const idMatch = aid === did || aid.includes(did) || did.includes(aid);
            const allocDateStr = a.date && a.date.slice ? a.date.slice(0,10) : String(a.date);
            return idMatch && allocDateStr === selectedDate;
        });
        if (allocsForSelectedDate && allocsForSelectedDate.length > 0) {
            // If any of today's allocations are still active (not reconciled), show Allocated
            if (allocsForSelectedDate.some(a => (a.status ?? 'Allocated') !== 'Reconciled')) {
                return { status: 'Allocated', badge: 'info' };
            }
            // All today's allocations are reconciled — treat as Not Allocated for today's view
            return { status: 'Not Allocated', badge: 'default' };
        }

        // Fallback: consider allocations up to the selected date (inclusive) for historical allocations
        const allocsUpToDate = (driverAllocations || []).filter(a => {
            if (!a || !a.date) return false;
            const aid = (a.driverId || a.driver_id || '').toString().trim();
            const dateOk = new Date(a.date) <= new Date(selectedDate);
            if (!aid || !did) return false;
            const idMatch = aid === did || aid.includes(did) || did.includes(aid);
            return idMatch && dateOk;
        });
        if (!allocsUpToDate || allocsUpToDate.length === 0) return { status: 'Not Allocated', badge: 'default' };
        // If any allocation up to date is not reconciled, show Allocated
        if (allocsUpToDate.some(a => (a.status ?? 'Allocated') !== 'Reconciled')) {
            return { status: 'Allocated', badge: 'info' };
        }
        // Otherwise, all reconciled
        return { status: 'Reconciled', badge: 'success' };
    };
    
    const productsToShowInModal = useMemo(() => {
        // In edit mode, find the IDs of products that are already part of the allocation.
        const originallyAllocatedProductIds = isEditMode
            ? getLatestAllocationForDriverFromList(todayAllocations, selectedDriver)?.allocatedItems.map((i: any) => i.productId) ?? []
            : [];

        // Filter the main product list.
        return availableProducts.filter(product => {
            // Condition 1: Always show a product if it's part of the original allocation being edited.
            if (originallyAllocatedProductIds.includes(product.id)) {
                return true;
            }
            
            // Condition 2: If a supplier filter is active, only show products from that supplier.
            if (allocationSupplier) {
                return product.supplier === allocationSupplier;
            }
            
            // Condition 3: If no supplier filter is active (i.e. editing), show all available products.
            if(isEditMode) return true;

            // Condition 4: Default to false if no conditions are met
            return false;
        });
    }, [availableProducts, allocationSupplier, isEditMode, selectedDriver, todayAllocations]);

    // PDF Export function for driver allocations
    const exportDriverAllocationsPDF = () => {
        const columns = [
            { key: 'driverName', title: 'Driver' },
            { key: 'date', title: 'Date' },
            { key: 'products', title: 'Products Allocated' },
            { key: 'totalValue', title: 'Total Value' },
            { key: 'salesTotal', title: 'Sales Total' },
            { key: 'status', title: 'Status' }
        ];

        const data = driverAllocations.map(allocation => {
            const driver = users?.find(u => u.id === allocation.driverId);
            const allocatedItems = allocation.allocatedItems || [];
            
            const productsList = allocatedItems.map(item => {
                const product = products.find(p => p.id === item.productId);
                return `${product?.name || 'Unknown'} (${item.quantity})`;
            }).join(', ');

            const totalValue = allocatedItems.reduce((sum, item) => {
                const product = products.find(p => p.id === item.productId);
                return sum + (item.quantity * (product?.price || 0));
            }, 0);

            return {
                driverName: driver?.name || 'Unknown Driver',
                date: new Date(allocation.date).toLocaleDateString(),
                products: productsList || 'No products',
                totalValue: formatCurrency(totalValue, currentUser?.settings.currency || 'LKR'),
                salesTotal: formatCurrency(allocation.salesTotal || 0, currentUser?.settings.currency || 'LKR'),
                status: allocation.salesTotal ? 'Completed' : 'Pending'
            };
        });

        exportToPDF('Driver Allocations Report', columns, data);
    };

    return fallbackUI ? fallbackUI : (
        <div className="p-3 sm:p-4 lg:p-6 space-y-6 sm:space-y-8">
             <style>{`
                @media print {
                  .no-print { display: none !important; }
                  body * { visibility: hidden; }
                  #printable-invoice-content, #printable-invoice-content * { visibility: visible; }
                  #printable-invoice-content { position: absolute; left: 0; top: 0; width: 100%; }
                }
            `}</style>
            <div className="flex flex-col sm:flex-row gap-4 sm:justify-between sm:items-center">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-800 dark:text-slate-100">Driver Management</h1>
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    {/* Export Buttons */}
                    <div className="flex gap-2 order-2 sm:order-1">
                        <button
                            onClick={exportDriverAllocationsPDF}
                            className="px-2 sm:px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-xs sm:text-sm flex-1 sm:flex-none"
                            title="Export Allocations as PDF"
                        >
                            <span className="hidden sm:inline">📄 PDF</span>
                            <span className="sm:hidden">PDF</span>
                        </button>
                        <button
                            onClick={() => exportDriverAllocations(driverAllocations, 'csv')}
                            className="px-2 sm:px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-xs sm:text-sm flex-1 sm:flex-none"
                            title="Export Allocations as CSV"
                        >
                            <span className="hidden sm:inline">📊 Allocations CSV</span>
                            <span className="sm:hidden">CSV</span>
                        </button>
                        <button
                            onClick={() => exportDriverAllocations(driverAllocations, 'xlsx')}
                            className="px-2 sm:px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-xs sm:text-sm flex-1 sm:flex-none"
                            title="Export Allocations as Excel"
                        >
                            <span className="hidden sm:inline">📋 Allocations Excel</span>
                            <span className="sm:hidden">XLS</span>
                        </button>
                    </div>
                    {/* Date selector removed as per requirement - allocations default to today */}
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                {drivers.map(driver => {
                    const { status, badge } = getDriverStatus(driver.id);
                    const allocation = getLatestAllocationForDriverFromList(todayAllocations, driver);
                    const isAllocated = !!allocation;

                    return (
                        <Card key={driver.id} className="flex flex-col">
                            <CardHeader className="flex-row items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <img src={driver.avatarUrl} alt={driver.name} className="w-12 h-12 rounded-full" />
                                    <div>
                                        <CardTitle className="text-lg">{driver.name}</CardTitle>
                                        <CardDescription>{driver.email}</CardDescription>
                                    </div>
                                </div>
                                <Badge variant={badge}>{status}</Badge>
                            </CardHeader>
                            <CardContent className="flex-grow flex flex-col justify-end space-y-2">
                                <button
                                    onClick={() => isAllocated ? handleOpenEditAllocateModal(driver) : handleOpenAllocateModal(driver)}
                                    className={`w-full px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
                                        isAllocated
                                            ? 'bg-yellow-500 hover:bg-yellow-600'
                                            : 'bg-blue-600 hover:bg-blue-700'
                                    }`}
                                >
                                    {isAllocated ? 'Edit Allocation' : 'Allocate Stock'}
                                </button>
                                <button
                                    onClick={() => handleOpenLogModal(driver)}
                                    className="w-full px-4 py-2 text-sm font-medium text-slate-700 bg-slate-200 rounded-lg hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600 transition-colors"
                                >
                                    View Daily Log
                                </button>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Allocate Stock Modal */}
            <Modal isOpen={modal === 'allocate'} onClose={handleCloseModal} title={isEditMode ? `Edit Allocation for ${selectedDriver?.name}` : `Allocate Stock to ${selectedDriver?.name}`}>
                <div className="p-4 sm:p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div>
                        <label htmlFor="supplier-filter" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Filter by Supplier</label>
                        <select 
                            id="supplier-filter"
                            value={allocationSupplier}
                            onChange={e => setAllocationSupplier(e.target.value)}
                            className="bg-slate-50 border border-slate-300 text-slate-900 text-sm sm:text-base rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-3 sm:p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white min-h-[44px]"
                        >
                            <option value="">{isEditMode ? "All Assigned Suppliers" : "Select a Supplier"}</option>
                            {availableSuppliers.map(supplier => (
                                <option key={supplier.id} value={supplier.name}>{supplier.name}</option>
                            ))}
                        </select>
                    </div>

                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">Select products from the main warehouse to allocate for today's sales route.</p>
                    <div className="space-y-3">
                         {productsToShowInModal.map(product => {
                            const originalAllocation = isEditMode ? todayAllocations.find(a => selectedDriver ? matchAllocationToDriver(a, selectedDriver) : false) : null;
                            const originalQuantity = originalAllocation?.allocatedItems.find(i => i.productId === product.id)?.quantity || 0;
                            const maxAllocatable = product.stock + originalQuantity;

                            if (maxAllocatable === 0 && !originalQuantity) return null;

                            return (
                                <div key={product.id} className="flex flex-col sm:grid sm:grid-cols-12 gap-3 sm:gap-4 sm:items-center p-3 sm:p-2 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                                    <div className="sm:col-span-7 flex items-center space-x-3">
                                        <img src={product.imageUrl} alt={product.name} className="w-12 h-12 sm:w-10 sm:h-10 rounded-md flex-shrink-0"/>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-medium text-slate-900 dark:text-white text-sm sm:text-base truncate">{product.name}</p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">Warehouse Stock: {product.stock}</p>
                                        </div>
                                    </div>
                                    <div className="sm:col-span-5">
                                        <label htmlFor={`alloc-${product.id}`} className="block text-xs text-slate-500 dark:text-slate-400 mb-1 sm:hidden">Allocate Quantity:</label>
                                        <input
                                            type="number"
                                            id={`alloc-${product.id}`}
                                            name={`alloc-${product.id}`}
                                            value={allocationQuantities[product.id] || ''}
                                            onChange={e => handleAllocationChange(product.id, parseInt(e.target.value, 10) || 0, maxAllocatable)}
                                            min="0"
                                            max={maxAllocatable}
                                            placeholder="0"
                                            className="w-full p-3 sm:p-2 border border-slate-300 rounded-md dark:bg-slate-600 dark:border-slate-500 dark:text-white text-center min-h-[44px] sm:min-h-0"
                                        />
                                    </div>
                                </div>
                            );
                         })}
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end p-4 sm:p-6 space-y-2 sm:space-y-0 sm:space-x-2 border-t border-slate-200 rounded-b dark:border-slate-600">
                    <button onClick={handleCloseModal} type="button" className="text-slate-500 bg-white hover:bg-slate-100 focus:ring-4 focus:outline-none focus:ring-blue-300 rounded-lg border border-slate-200 text-sm font-medium px-5 py-3 sm:py-2.5 hover:text-slate-900 focus:z-10 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-500 dark:hover:text-white dark:hover:bg-slate-600 min-h-[44px] order-2 sm:order-1">
                        Cancel
                    </button>
                    <button onClick={handleSaveAllocation} type="button" className="text-white bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-3 sm:py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 min-h-[44px] order-1 sm:order-2">
                        {isEditMode ? 'Save Changes' : 'Confirm Allocation'}
                    </button>
                </div>
            </Modal>

            {/* Daily Log Modal */}
            {selectedDriver && modal === 'log' && (
                <DailyLog
                    driver={selectedDriver}
                    onClose={handleCloseModal}
                    currency={currency}
                />
            )}
            
            {/* Debug buttons removed for production UI. If you need to re-enable, see previous commits. */}
        </div>
    );
};


// Sub-component for Daily Log to manage its complex state
interface DailyLogProps {
    driver: User;
    onClose: () => void;
    currency: string;
}

const DailyLog: React.FC<DailyLogProps> = ({ driver, onClose, currency }) => {
    const { products, setProducts, customers, setCustomers, driverAllocations, setDriverAllocations, driverSales, setDriverSales, orders, refetchData } = useData();
    const [activeTab, setActiveTab] = useState<'log' | 'reconcile'>('log');
    const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);
    const [viewingSaleInvoice, setViewingSaleInvoice] = useState<DriverSale | null>(null);
    
    // Get today's date string
    const todayStr = new Date().toISOString().slice(0, 10);
    
    // State for new sale form
    const [saleQuantities, setSaleQuantities] = useState<Record<string, number>>({});
    const [saleCustomer, setSaleCustomer] = useState<{id?: string, name: string}>({name: ''});
    const [amountPaid, setAmountPaid] = useState<string>('');
    const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Bank' | 'Cheque' | 'Credit'>('Cash');
    const [paymentReference, setPaymentReference] = useState('');
    const [saleNotes, setSaleNotes] = useState('');
    
    // No manual returned input: reconciliation will use calculated remaining (allocated - sold)
    
    // Refresh data when Daily Log opens to ensure we have latest orders
    useEffect(() => {
        refetchData();
    }, [driver.id, refetchData]);
    
            // Use only TODAY'S allocation for this driver (not cumulative)
            const activeAllocations = useMemo(() => {
                console.log('🔍 All driver allocations from database:', driverAllocations);

                // Find all today's allocations that match this driver
                const matches = (driverAllocations || []).filter(a => {
                    if (!a || !a.date) return false;
                    const aid = (a.driverId || a.driver_id || '').toString().trim();
                    const did = (driver.id || '').toString().trim();

                    // Only TODAY'S date - not <= today
                    const allocationDate = a.date && a.date.slice ? a.date.slice(0, 10) : a.date;
                    const isToday = allocationDate === todayStr;

                    if (!aid || !did) return false;
                    const idMatch = aid === did || aid.includes(did) || did.includes(aid);
                    const statusOk = ((a.status ?? 'Allocated') !== 'Reconciled');

                    console.log(`🔍 Checking allocation ${a.id}: date=${allocationDate}, isToday=${isToday}, idMatch=${idMatch}, statusOk=${statusOk}`);

                    return idMatch && isToday && statusOk;
                });

                if (!matches || matches.length === 0) {
                    console.log('✅ No allocations for today for driver', driver.name);
                    return [];
                }

                // If there are multiple matches, pick the single "latest" one by created_at (if present) or by id as fallback
                const pickKey = (x: any) => (x?.created_at ?? x?.createdAt ?? x?.id ?? '').toString();
                const latest = matches.reduce((best, cur) => {
                    const bestKey = pickKey(best);
                    const curKey = pickKey(cur);
                    return curKey > bestKey ? cur : best;
                }, matches[0]);

                console.log('✅ Today\'s (latest) allocation for driver', driver.name, ':', latest);
                return [latest];
            }, [driverAllocations, driver.id, todayStr]);
    const latestActiveAllocation = useMemo(() => activeAllocations[activeAllocations.length - 1], [activeAllocations]);

    const salesForDriver = useMemo(() => 
        driverSales.filter(s => s.driverId === driver.id).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        [driverSales, driver.id]
    );

    // Show only undelivered products in driver product page
    const stockSummary = useMemo(() => {
        // Use only the latest active allocation for this driver to avoid multiplication
        if (!activeAllocations || activeAllocations.length === 0) {
            console.log('📋 No active allocations found for driver', driver.name);
            return {};
        }
        
        // Use only the most recent allocation to avoid summing multiple allocations
        const latestAllocation = activeAllocations[activeAllocations.length - 1];
        console.log('📋 Using latest allocation for driver', driver.name, ':', latestAllocation);
        
        const summary: Record<string, { allocated: number; sold: number; remaining: number }> = {};
        
        // Group products by ID to handle duplicates within the same allocation
        const productTotals: Record<string, { allocated: number; sold: number }> = {};
        
        console.log('🔍 RAW allocated items from database:', latestAllocation.allocatedItems);
        
        (latestAllocation.allocatedItems || []).forEach(({ productId, quantity, sold }) => {
            const soldQty = sold || 0;
            const qty = quantity || 0;
            
            console.log(`🔍 Processing item: productId=${productId}, quantity=${qty}, sold=${soldQty}`);
            
            // If product already exists, add to existing totals (handle duplicates)
            if (productTotals[productId]) {
                productTotals[productId].allocated += qty;
                productTotals[productId].sold += soldQty;
                console.warn(`⚠️ DUPLICATE PRODUCT ${productId} in allocation - combining quantities`);
            } else {
                productTotals[productId] = { allocated: qty, sold: soldQty };
            }
        });
        
        // Convert to final summary format
        Object.entries(productTotals).forEach(([productId, totals]) => {
            console.log(`📦 Product ${productId}: allocated=${totals.allocated}, sold=${totals.sold}, remaining=${totals.allocated - totals.sold}`);
            summary[productId] = { 
                allocated: totals.allocated, 
                sold: totals.sold, 
                remaining: totals.allocated - totals.sold 
            };
        });
        // Fallback: add sold from driver sales if allocations lack sold fields
        // Only consider sales from the latest allocation to prevent duplication
        if (latestAllocation) {
            salesForDriver
                .filter(sale => sale.allocationId === latestAllocation.id)
                .forEach(sale => {
                    sale.soldItems.forEach(({ productId, quantity }) => {
                        const rec = summary[productId];
                        if (!rec) return;
                        const hasSoldField = latestAllocation.allocatedItems.some(i => i.productId === productId && typeof i.sold === 'number');
                        if (!hasSoldField) {
                            rec.sold += quantity;
                            rec.remaining = rec.allocated - rec.sold;
                        }
                    });
                });
        }
        // Keep products with remaining === 0 so reconciliation shows Allocated / Sold / Balance (0)
        // Previously zero-remaining products were removed which hid fully-sold allocations.
        return summary;
    }, [activeAllocations, salesForDriver]);
    
    const saleTotal = useMemo(() => {
        return Object.entries(saleQuantities).reduce((sum, [productId, quantity]) => {
            const product = products.find(p => p.id === productId);
            return sum + (product ? Number(product.price) * Number(quantity) : 0);
        }, 0);
    }, [saleQuantities, products]);

    const handleOpenSaleModal = () => {
        setSaleQuantities({});
        setSaleCustomer({name: ''});
        setAmountPaid('');
        setPaymentMethod('Cash');
        setPaymentReference('');
        setSaleNotes('');
        setIsSaleModalOpen(true);
    };
    
    const handleCloseSaleModal = () => setIsSaleModalOpen(false);

    const handleSaleQuantityChange = (productId: string, quantity: number) => {
        const remainingStock = stockSummary[productId]?.remaining || 0;
        const newQuantity = Math.max(0, Math.min(quantity, remainingStock));
        setSaleQuantities(prev => ({...prev, [productId]: newQuantity}));
    };
    
    const handleAddSale = () => {
        if (!latestActiveAllocation) return;
        const itemsToSell = Object.entries(saleQuantities)
            .filter(([, qty]) => typeof qty === 'number' && qty > 0)
            .map(([productId, quantity]) => {
                const product = products.find(p => p.id === productId)!;
                return { productId, quantity: Number(quantity), price: Number(product.price) };
            });

        if (itemsToSell.length === 0) {
            alert("Please add items to the sale.");
            return;
        }

        const paid = parseFloat(amountPaid) || 0;
        const creditAmount = saleTotal - paid;

        const newSale: DriverSale = {
            id: `DSALE${Date.now()}`,
            driverId: driver.id,
            allocationId: latestActiveAllocation.id,
            date: new Date().toISOString(),
            soldItems: itemsToSell,
            total: saleTotal,
            customerName: saleCustomer.name,
            customerId: saleCustomer.id,
            amountPaid: paid,
            creditAmount: creditAmount,
            paymentMethod: creditAmount > 0 && paid > 0 ? 'Mixed' : creditAmount > 0 && paid === 0 ? 'Credit' : paymentMethod,
            paymentReference,
            notes: saleNotes,
        };

        setDriverSales(prev => [newSale, ...prev]);

        // Insert the sale into the database
        (async () => {
            try {
                // Insert into driver_sales table
                const { error: salesError } = await supabase.from('driver_sales').insert([{
                    id: newSale.id,
                    driver_id: newSale.driverId,
                    allocation_id: newSale.allocationId,
                    date: newSale.date,
                    sold_items: JSON.stringify(newSale.soldItems),
                    total: newSale.total,
                    customer_name: newSale.customerName,
                    customer_id: newSale.customerId,
                    amount_paid: newSale.amountPaid,
                    credit_amount: newSale.creditAmount,
                    payment_method: newSale.paymentMethod,
                    payment_reference: newSale.paymentReference,
                    notes: newSale.notes,
                }]);

                if (salesError) {
                    console.error('Error inserting driver sale:', salesError);
                    return;
                }

                // Insert into driver_deliveries table for each sold item
                for (const item of itemsToSell) {
                    const { error: deliveryError } = await supabase.from('driver_deliveries').insert([{
                        id: crypto.randomUUID(),
                        driver_id: driver.id,
                        product_id: item.productId,
                        quantity: item.quantity,
                        delivered_at: todayStr
                    }]);

                    if (deliveryError) {
                        console.error('Error inserting driver delivery:', deliveryError);
                    }
                }

                // Distribute sold quantities across all active allocations (oldest-first) by increasing 'sold' field
                const allocationsToUpdate = activeAllocations.map(a => ({ ...a, allocatedItems: a.allocatedItems.map(i => ({...i})) }));
                const remainingToSell: Record<string, number> = {};
                for (const item of itemsToSell) { remainingToSell[item.productId] = (remainingToSell[item.productId] || 0) + item.quantity; }
                for (const alloc of allocationsToUpdate) {
                    for (const item of alloc.allocatedItems) {
                        const need = remainingToSell[item.productId] || 0;
                        if (need <= 0) continue;
                        const soldPrev = typeof item.sold === 'number' ? item.sold : 0;
                        const available = Math.max(0, (item.quantity || 0) - soldPrev);
                        if (available <= 0) continue;
                        const take = Math.min(available, need);
                        item.sold = soldPrev + take;
                        remainingToSell[item.productId] = need - take;
                    }
                }

                // Persist each changed allocation and recompute sales_total
                for (const alloc of allocationsToUpdate) {
                    let totalSales = 0;
                    alloc.allocatedItems.forEach(item => {
                        const product = products.find(p => p.id === item.productId);
                        if (product) totalSales += (item.sold || 0) * product.price;
                    });
                    const updatePayload = {
                        allocated_items: JSON.stringify(alloc.allocatedItems),
                        allocateditems: JSON.stringify(alloc.allocatedItems),
                        sales_total: totalSales,
                        salestotal: totalSales,
                        status: alloc.status ?? 'Allocated'
                    };
                    const { error: updateError } = await supabase
                        .from('driver_allocations')
                        .update(updatePayload)
                        .eq('id', alloc.id);
                    if (updateError) {
                        console.error('Error updating driver allocation:', updateError);
                    }
                }

                // Refresh allocations from database
                const { data: freshAllocations } = await supabase.from('driver_allocations').select('*');
                if (freshAllocations) {
                    setDriverAllocations(freshAllocations.map((row: any) => ({
                        id: row.id,
                        driverId: row.driver_id ?? row.driverid,
                        driverName: row.driver_name ?? row.drivername,
                        date: row.date,
                        allocatedItems: (() => {
                            if (row.allocated_items) {
                                if (typeof row.allocated_items === 'string') {
                                    try { return JSON.parse(row.allocated_items); } catch { return []; }
                                }
                                return row.allocated_items;
                            }
                            if (row.allocateditems) {
                                if (typeof row.allocateditems === 'string') {
                                    try { return JSON.parse(row.allocateditems); } catch { return []; }
                                }
                                return row.allocateditems;
                            }
                            return [];
                        })(),
                        returnedItems: (() => {
                            if (row.returned_items) {
                                if (typeof row.returned_items === 'string') {
                                    try { return JSON.parse(row.returned_items); } catch { return null; }
                                }
                                return row.returned_items;
                            }
                            if (row.returneditems) {
                                if (typeof row.returneditems === 'string') {
                                    try { return JSON.parse(row.returneditems); } catch { return null; }
                                }
                                return row.returneditems;
                            }
                            return null;
                        })(),
                        salesTotal: row.sales_total ?? row.salestotal ?? 0,
                        status: row.status ?? 'Allocated',
                    })));
                }

                // Update inventory (products table) - reduce stock for sold items
                for (const item of itemsToSell) {
                    const currentProduct = products.find(p => p.id === item.productId);
                    if (currentProduct) {
                        const newStock = Math.max(0, currentProduct.stock - item.quantity);
                        const { error: inventoryError } = await supabase.from('products').update({
                            stock: newStock
                        }).eq('id', item.productId);

                        if (inventoryError) {
                            console.error('Error updating product inventory:', inventoryError);
                        } else {
                            console.log(`Debug - Updated inventory for ${item.productId}: ${currentProduct.stock} → ${newStock}`);
                        }
                    }
                }

                // Refresh products from database to get updated stock levels
                const { data: freshProducts } = await supabase.from('products').select('*');
                if (freshProducts) {
                    const mappedProducts = freshProducts.map((row: any) => ({
                        id: row.id,
                        name: row.name,
                        category: row.category,
                        price: row.price,
                        // Read marginPrice from DB only (do NOT fall back to costprice)
                        marginPrice: row.marginprice == null || isNaN(Number(row.marginprice))
                            ? undefined
                            : Number(row.marginprice),
                        costPrice: row.costprice !== undefined ? Number(row.costprice) : undefined,
                        stock: row.stock,
                        sku: row.sku,
                        supplier: row.supplier,
                        imageUrl: row.imageurl || row.imageUrl || '',
                    }));
                    setProducts(mappedProducts);
                    console.log('Debug - Product inventory refreshed');
                }

            } catch (error) {
                console.error('Error processing sale:', error);
            }
        })();

        // Update credit balance for customer if applicable
        if (saleCustomer.id && creditAmount > 0) {
            setCustomers(prev => prev.map(c => 
                c.id === saleCustomer.id
                ? { ...c, outstandingBalance: c.outstandingBalance + creditAmount }
                : c
            ));
        }
        handleCloseSaleModal();
    };

        // Print the latest allocation (allocated items) for this driver/date
        const handlePrintAllocation = () => {
                if (!latestActiveAllocation) {
                        alert('No allocation to print for today.');
                        return;
                }

        // Group allocated items by productId to sum quantities and sold counts
        const grouped: Record<string, { allocated: number; sold: number }> = {};
        (latestActiveAllocation.allocatedItems || []).forEach((item: any) => {
            const pid = item.productId;
            const qty = Number(item.quantity || 0);
            const sold = Number(item.sold || 0);
            if (!grouped[pid]) grouped[pid] = { allocated: 0, sold: 0 };
            grouped[pid].allocated += qty;
            grouped[pid].sold += sold;
        });

        const rowsHtml = Object.entries(grouped).map(([productId, vals]) => {
            const prod = products.find(p => p.id === productId);
            const name = prod?.name || productId;
            const allocated = vals.allocated;
            const sold = vals.sold;
            const balance = Math.max(0, allocated - sold);
            return `<tr>
                    <td style="padding:4px 0;">${name}</td>
                    <td style="padding:4px 0; text-align:center;">${allocated}</td>
                    <td style="padding:4px 0; text-align:center;">${sold}</td>
                    <td style="padding:4px 0; text-align:right;">${balance}</td>
                </tr>`;
        }).join('');

                const billHTML = `
            <!doctype html>
            <html>
                <head>
                    <meta charset="utf-8" />
                    <title>Allocation - ${driver.name} - ${todayStr}</title>
                    <style>
                        body { font-family: Arial, Helvetica, sans-serif; color: #000; width: 80mm; margin: 0; padding: 6px; }
                        .center { text-align: center; }
                        table { width: 100%; border-collapse: collapse; font-size: 12px; }
                        th, td { vertical-align: top; padding: 6px 8px; }
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
                        <div class="date">Driver: ${driver.name} — Date: ${todayStr}</div>
                    </div>
                    <div class="divider"></div>
                    <table>
                        <thead>
                            <tr>
                                <td style="font-weight:bold; text-align:left;">Product</td>
                                <td style="font-weight:bold;text-align:center;">Allocated</td>
                                <td style="font-weight:bold;text-align:center;">Sold</td>
                                <td style="font-weight:bold;text-align:right;">Balance</td>
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

                const height = Math.max(200, 20 + (latestActiveAllocation.allocatedItems || []).length * 12);
                const options = {
                        margin: 1,
                        filename: `Allocation-${driver.name}-${todayStr}.pdf`,
                        image: { type: 'jpeg', quality: 1 },
                        html2canvas: { scale: 2 },
                        jsPDF: { unit: 'mm', format: [80, height], orientation: 'portrait' }
                } as any;

                html2pdf().set(options).from(billHTML).save();
        };
    
    // removed manual returned qty handler - reconciliation uses the computed remaining values
    
    const handleReconcile = () => {
        const allocation = latestActiveAllocation;
        if (!allocation) return;

        // Build returned items from computed remaining (allocated - sold) to avoid manual input
        const itemsToReturn = allocation.allocatedItems.map(({productId}) => ({
            productId,
            quantity: stockSummary[productId]?.remaining || 0,
        }));

        const salesTotal = driverSales
            .filter(s => s.allocationId === allocation.id)
            .reduce((sum, sale) => sum + (sale.total || 0), 0);

        // Update driver_allocations in Supabase
        (async () => {
            const { error: allocError } = await supabase
                .from('driver_allocations')
                .update({
                    status: 'Reconciled',
                    returneditems: JSON.stringify(itemsToReturn),
                    salestotal: salesTotal
                })
                .eq('id', allocation.id);
            if (allocError) {
                console.error('Supabase allocation reconcile error:', allocError);
            }

            // NOTE: Per user request, do NOT add the allocation balance back into the main warehouse
            // product stock here. We still mark the allocation as 'Reconciled' and record returneditems
            // on the allocation record, but we intentionally avoid updating the `products.stock` value
            // in the products table or in the UI state.

            // Fetch fresh allocations and products for UI sync
            const { data: freshAllocations } = await supabase.from('driver_allocations').select('*');
            if (freshAllocations) {
                setDriverAllocations(freshAllocations.map((row: any) => ({
                    id: row.id,
                    driverId: row.driver_id ?? row.driverid,
                    driverName: row.driver_name ?? row.drivername,
                    date: row.date,
                    allocatedItems: (() => {
                        if (row.allocated_items) {
                            if (typeof row.allocated_items === 'string') {
                                try { 
                                    return JSON.parse(row.allocated_items);
                                } catch { return []; }
                            }
                            return row.allocated_items;
                        }
                        if (row.allocateditems) {
                            if (typeof row.allocateditems === 'string') {
                                try { 
                                    return JSON.parse(row.allocateditems);
                                } catch { return []; }
                            }
                            return row.allocateditems;
                        }
                        return [];
                    })(),
                    returnedItems: (() => {
                        if (row.returned_items) {
                            if (typeof row.returned_items === 'string') {
                                try { return JSON.parse(row.returned_items); } catch { return null; }
                            }
                            return row.returned_items;
                        }
                        if (row.returneditems) {
                            if (typeof row.returneditems === 'string') {
                                try { return JSON.parse(row.returneditems); } catch { return null; }
                            }
                            return row.returneditems;
                        }
                        return null;
                    })(),
                    salesTotal: row.sales_total ?? row.salestotal ?? 0,
                    status: row.status ?? 'Allocated',
                })));
            }
            const { data: freshProducts } = await supabase.from('products').select('*');
            if (freshProducts) {
                const mappedProducts = freshProducts.map((row: any) => ({
                    id: row.id,
                    name: row.name,
                    category: row.category,
                    price: row.price,
                    // Read marginPrice from DB only (do NOT fall back to costprice)
                    marginPrice: row.marginprice == null || isNaN(Number(row.marginprice))
                        ? undefined
                        : Number(row.marginprice),
                    costPrice: row.costprice !== undefined ? Number(row.costprice) : undefined,
                    stock: row.stock,
                    sku: row.sku,
                    supplier: row.supplier,
                    imageUrl: row.imageurl || row.imageUrl || '',
                }));
                setProducts(mappedProducts);
                // Force reload of product page if possible
                if (window.location.pathname.includes('products')) {
                    window.location.reload();
                }
            }
            onClose();
        })();
    };
    
    // Calculate collections from today's driver sales and today's delivered orders only
    const collections = useMemo(() => {
        // Helper to test date equality YYYY-MM-DD
        const isSameDay = (isoOrDateStr: string | undefined, dayStr: string) => {
            if (!isoOrDateStr) return false;
            const ds = (isoOrDateStr.slice ? isoOrDateStr.slice(0, 10) : new Date(isoOrDateStr).toISOString().slice(0,10));
            return ds === dayStr;
        };

        // Only include driver sales that happened today (by sale.date)
        const salesToday = salesForDriver.filter(sale => isSameDay(sale.date, todayStr));

        // Only include orders assigned to this driver that were delivered today
        const deliveredOrdersForDriverToday = orders.filter(order => {
            const isAssignedToDriver = order.assignedUserId === driver.id;
            const isDelivered = order.status === 'Delivered';
            const deliveredToday = isSameDay(order.date, todayStr) || isSameDay(order.created_at as any, todayStr);
            return isAssignedToDriver && isDelivered && deliveredToday;
        });

        // Start aggregating from zero — today's totals only
        const result = { total: 0, paid: 0, credit: 0, cheque: 0, cash: 0, bank: 0, mixed: 0 } as any;

        // Aggregate today's driver sales
        for (const sale of salesToday) {
            result.total += sale.total || 0;
            result.paid += sale.amountPaid || 0;
            result.credit += sale.creditAmount || 0;
            const method = sale.paymentMethod || '';
            if (method === 'Cheque') result.cheque += sale.amountPaid || 0;
            else if (method === 'Cash') result.cash += sale.amountPaid || 0;
            else if (method === 'Bank') result.bank += sale.amountPaid || 0;
            else if (method === 'Mixed') result.mixed += sale.amountPaid || 0;
        }

        // Add today's delivered orders assigned to this driver
        for (const order of deliveredOrdersForDriverToday) {
            const orderTotal = order.total || 0;
            const orderPaid = (order.amountPaid ?? (orderTotal - (order.chequeBalance || 0) - (order.creditBalance || 0))) || 0;
            const orderCredit = order.creditBalance || 0;
            const orderCheque = order.chequeBalance || 0;

            result.total += orderTotal;
            result.paid += orderPaid;
            result.credit += orderCredit;
            result.cheque += orderCheque;
        }

        return result;
    }, [salesForDriver, orders, driver.id, todayStr]);

    return (
      <Modal isOpen={true} onClose={onClose} title={`Daily Log: ${driver.name} (${todayStr})`}>
          <div className="border-b border-slate-200 dark:border-slate-700 no-print">
                <nav className="flex space-x-1 sm:space-x-2 px-4 sm:px-6" aria-label="Tabs">
                    <button onClick={() => setActiveTab('log')} className={`px-2 sm:px-3 py-3 text-xs sm:text-sm font-medium border-b-2 ${activeTab === 'log' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>Sales Log</button>
                    <button onClick={() => setActiveTab('reconcile')} disabled={activeAllocations.length === 0 || (latestActiveAllocation && latestActiveAllocation.status === 'Reconciled')} className={`px-2 sm:px-3 py-3 text-xs sm:text-sm font-medium border-b-2 ${activeTab === 'reconcile' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'} disabled:text-slate-400 dark:disabled:text-slate-600 disabled:cursor-not-allowed`}>Reconciliation</button>
                </nav>
          </div>
          
          <div className="p-4 sm:p-6 max-h-[60vh] overflow-y-auto">
            {activeTab === 'log' && (
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center">
                        <h4 className="text-base sm:text-lg font-semibold text-slate-800 dark:text-slate-200">Sales Summary</h4>
                        <div className="flex gap-2">
                         <button onClick={handleOpenSaleModal} disabled={activeAllocations.length === 0} className="px-4 py-2.5 text-xs sm:text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-slate-400 dark:disabled:bg-slate-600 min-h-[40px] self-start sm:self-auto">
                            Add Sale
                         </button>
                         {latestActiveAllocation && (
                            <button onClick={handlePrintAllocation} className="px-4 py-2.5 text-xs sm:text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 min-h-[40px] self-start sm:self-auto">
                                Print Allocation
                            </button>
                         )}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 text-center">
                        <div className="p-3 sm:p-4 rounded-lg bg-blue-50 dark:bg-blue-900/40"><p className="text-xs text-blue-600 dark:text-blue-300">Total Sales</p><p className="text-lg sm:text-xl font-bold text-blue-800 dark:text-blue-200 break-words">{formatCurrency(collections.total, currency)}</p></div>
                        <div className="p-3 sm:p-4 rounded-lg bg-green-50 dark:bg-green-900/40"><p className="text-xs text-green-600 dark:text-green-300">Total Collected</p><p className="text-lg sm:text-xl font-bold text-green-800 dark:text-green-200 break-words">{formatCurrency(collections.paid, currency)}</p></div>
                        <div className="p-3 sm:p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/40"><p className="text-xs text-yellow-600 dark:text-yellow-300">Collected (Cheque)</p><p className="text-lg sm:text-xl font-bold text-yellow-800 dark:text-yellow-200 break-words">{formatCurrency(collections.cheque, currency)}</p></div>
                        <div className="p-3 sm:p-4 rounded-lg bg-red-50 dark:bg-red-900/40"><p className="text-xs text-red-600 dark:text-red-300">Outstanding Credit</p><p className="text-lg sm:text-xl font-bold text-red-800 dark:text-red-200 break-words">{formatCurrency(collections.credit, currency)}</p></div>
                    </div>
                     <div className="space-y-3">
                        {salesForDriver.map(sale => (
                           <div key={sale.id} className="p-3 border rounded-lg dark:border-slate-700">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="font-semibold">{formatCurrency(sale.total, currency)}
                                            <Badge variant={sale.creditAmount > 0 ? 'warning' : 'success'} >{sale.creditAmount > 0 ? 'Partial' : 'Paid'}</Badge>
                                        </p>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">To: {sale.customerName} at {new Date(sale.date).toLocaleTimeString()}</p>
                                        <p className="text-xs text-slate-400">Ref: {sale.paymentReference || sale.paymentMethod}</p>
                                    </div>
                                    <div className="text-right">
                                        <ul className="text-xs">
                                            {sale.soldItems.map(item => {
                                                const prod = products.find(p=>p.id===item.productId);
                                                // Only show items that are still remaining in combined allocations
                                                if (!stockSummary[item.productId]) return null;
                                                return <li key={item.productId}>{prod?.name} x {item.quantity}</li>;
                                            })}
                                        </ul>
                                        <button onClick={() => setViewingSaleInvoice(sale)} className="mt-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">Print Invoice</button>
                                    </div>
                                </div>
                            </div>
                        ))}
                     </div>
                </div>
            )}

            {activeTab === 'reconcile' && (
                <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-slate-800 dark:text-slate-200">End-of-Day Reconciliation</h4>
                    <div className="overflow-x-auto border rounded-lg dark:border-slate-700">
                        <table className="min-w-full text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-700 text-xs uppercase">
                                <tr>
                                        <th className="py-2 px-4 text-left">Product</th>
                                        <th className="py-2 px-4 text-center">Allocated</th>
                                        <th className="py-2 px-4 text-center">Sold</th>
                                        <th className="py-2 px-4 text-center">Balance</th>
                                    </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                {Object.entries(stockSummary).map(([productId, summary]) => {
                                    const product = products.find(p => p.id === productId)!;
                                    const s = summary as { allocated: number; sold: number; remaining: number };
                                    
                                    console.log(`📋 Reconciliation table - Product ${product?.name || productId}: allocated=${s.allocated}, sold=${s.sold}, remaining=${s.remaining}`);
                                    console.log(`🔍 RAW ALLOCATION DATA for ${product?.name}:`, latestActiveAllocation?.allocatedItems?.filter(item => item.productId === productId));
                                    
                                        return (
                                        <tr key={productId}>
                                            <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">{product.name}</td>
                                            <td className="py-3 px-4 text-center">{s.allocated}</td>
                                            <td className="py-3 px-4 text-center">{s.sold}</td>
                                            <td className="py-3 px-4 text-center font-semibold text-slate-800 dark:text-slate-100">{s.remaining}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
          </div>
          <div className="flex items-center justify-end p-6 space-x-2 border-t border-slate-200 rounded-b dark:border-slate-600 no-print">
              {activeTab === 'reconcile' ? (
                 <button onClick={handleReconcile} type="button" className="text-white bg-green-600 hover:bg-green-700 focus:ring-4 focus:outline-none focus:ring-green-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center">
                    Confirm Reconciliation
                </button>
              ) : (
                <button onClick={onClose} type="button" className="text-slate-500 bg-white hover:bg-slate-100 focus:ring-4 focus:outline-none focus:ring-blue-300 rounded-lg border border-slate-200 text-sm font-medium px-5 py-2.5 hover:text-slate-900 focus:z-10 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-500 dark:hover:text-white dark:hover:bg-slate-600">
                    Close
                </button>
              )}
          </div>

          {/* Add Sale Modal */}
           <Modal isOpen={isSaleModalOpen} onClose={handleCloseSaleModal} title="Add New Sale">
                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-900 dark:text-white">Items</label>
                        {Object.keys(stockSummary).map((productId) => {
                            const product = products.find(p => p.id === productId)!;
                            const remaining = stockSummary[productId]?.remaining || 0;
                            const allocated = stockSummary[productId]?.allocated || 0;
                            const sold = stockSummary[productId]?.sold || 0;
                            
                            console.log(`🛍️ Product ${product?.name || productId} in sale modal: allocated=${allocated}, sold=${sold}, remaining=${remaining}`);
                            
                            if (remaining === 0 && !saleQuantities[productId]) return null;
                            return (
                                <div key={productId} className="flex justify-between items-center bg-slate-50 dark:bg-slate-700/50 p-2 rounded-lg">
                                    <p>{product.name} <span className="text-xs text-slate-500">(In van: {remaining})</span></p>
                                    <input
                                        type="number" min="0" max={remaining}
                                        id={`saleqty-${productId}`}
                                        name={`saleqty-${productId}`}
                                        value={saleQuantities[productId] || ''}
                                        onChange={e => handleSaleQuantityChange(productId, parseInt(e.target.value) || 0)}
                                        className="w-20 p-1 border rounded-md text-center dark:bg-slate-600 dark:border-slate-500"
                                    />
                                </div>
                            )
                        })}
                     </div>
                     <div className="p-4 border-t dark:border-slate-700 space-y-4">
                        <div className="text-right">
                           <p className="text-sm text-slate-500">Total Bill Amount</p>
                           <p className="text-2xl font-bold">{formatCurrency(saleTotal, currency)}</p>
                        </div>
                        <div>
                            <label htmlFor="customerName" className="block mb-1 text-sm font-medium text-slate-900 dark:text-white">Customer</label>
                            <input type="text" id="customerName" list="customers-list" value={saleCustomer.name} 
                                onChange={e => {
                                    const selected = customers.find(c => c.name === e.target.value);
                                    setSaleCustomer({name: e.target.value, id: selected?.id});
                                }} 
                                placeholder="Select or type customer name" className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                            <datalist id="customers-list">
                                {customers.map(c => <option key={c.id} value={c.name} />)}
                            </datalist>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="amountPaid" className="block mb-1 text-sm font-medium text-slate-900 dark:text-white">Amount Paid Now</label>
                                <input type="number" id="amountPaid" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} min="0" max={saleTotal} className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                            </div>
                             <div>
                                <label className="block mb-1 text-sm font-medium text-slate-500 dark:text-slate-400">Remaining (Credit)</label>
                                <input type="text" value={formatCurrency(saleTotal - (parseFloat(amountPaid) || 0), currency)} readOnly className="bg-slate-100 border-slate-300 text-slate-500 text-sm rounded-lg block w-full p-2.5 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-400" />
                            </div>
                             <div>
                                <label htmlFor="paymentMethod" className="block mb-1 text-sm font-medium text-slate-900 dark:text-white">Payment Method</label>
                                <select id="paymentMethod" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as any)} className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                                    <option>Cash</option><option>Bank</option><option>Cheque</option>
                                </select>
                            </div>
                            <div>
                                <label htmlFor="paymentReference" className="block mb-1 text-sm font-medium text-slate-900 dark:text-white">Reference</label>
                                <input type="text" id="paymentReference" value={paymentReference} onChange={e => setPaymentReference(e.target.value)} placeholder="Cheque No / Txn ID" className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                            </div>
                             <div className="md:col-span-2">
                                <label htmlFor="saleNotes" className="block mb-1 text-sm font-medium text-slate-900 dark:text-white">Notes</label>
                                <textarea id="saleNotes" value={saleNotes} onChange={e => setSaleNotes(e.target.value)} rows={2} placeholder="Optional notes about the sale..." className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                            </div>
                        </div>
                     </div>
                </div>
                <div className="flex items-center justify-end p-6 space-x-2 border-t border-slate-200 rounded-b dark:border-slate-600">
                    <button onClick={handleCloseSaleModal} type="button" className="text-slate-500 bg-white hover:bg-slate-100 focus:ring-4 focus:outline-none focus:ring-blue-300 rounded-lg border border-slate-200 text-sm font-medium px-5 py-2.5 hover:text-slate-900 focus:z-10 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-500 dark:hover:text-white dark:hover:bg-slate-600">
                        Cancel
                    </button>
                    <button onClick={async () => { await handleAddSale(); }} disabled={saleTotal <= 0} type="button" className="text-white bg-green-600 hover:bg-green-700 focus:ring-4 focus:outline-none focus:ring-green-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center disabled:bg-slate-400">
                        Confirm Sale
                    </button>
                </div>
           </Modal>

            {/* Invoice Modal */}
            <Modal isOpen={!!viewingSaleInvoice} onClose={() => setViewingSaleInvoice(null)} title={`Invoice for Sale ${viewingSaleInvoice?.id.slice(-6)}`}>
                <div id="printable-invoice-content" className="bg-white text-black">
                   {viewingSaleInvoice && <Invoice sale={viewingSaleInvoice} products={products} currency={currency} />}
                </div>
                <div className="flex items-center justify-end p-6 space-x-2 border-t border-slate-200 rounded-b dark:border-slate-600 no-print">
                      <button onClick={() => setViewingSaleInvoice(null)} type="button" className="text-slate-500 bg-white hover:bg-slate-100 focus:ring-4 focus:outline-none focus:ring-blue-300 rounded-lg border border-slate-200 text-sm font-medium px-5 py-2.5 hover:text-slate-900 focus:z-10 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-500 dark:hover:text-white dark:hover:bg-slate-600">
                          Close
                      </button>
                      <button onClick={() => window.print()} type="button" className="text-white bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center">
                          Print Invoice
                      </button>
                  </div>
            </Modal>
      </Modal>
    );
};

// --- Printable Invoice Component ---
interface InvoiceProps {
  sale: DriverSale;
  products: Product[];
  currency: string;
}
const Invoice: React.FC<InvoiceProps> = ({ sale, products, currency }) => {
    return (
        <div className="p-8 font-sans">
            <header className="flex justify-between items-start pb-4 border-b">
                <div>
                    <h1 className="text-2xl font-bold">{COMPANY_DETAILS.name}</h1>
                    <p className="text-xs">{COMPANY_DETAILS.address}</p>
                    <p className="text-xs">{COMPANY_DETAILS.email} | {COMPANY_DETAILS.phone}</p>
                </div>
                <div className="text-right">
                    <h2 className="text-xl font-semibold uppercase">Invoice</h2>
                    <p className="text-xs"><strong>Sale ID:</strong> {sale.id}</p>
                    <p className="text-xs"><strong>Date:</strong> {new Date(sale.date).toLocaleString()}</p>
                </div>
            </header>
            <section className="my-6">
                <h3 className="text-sm font-semibold mb-1">Bill To:</h3>
                <p className="font-bold">{sale.customerName}</p>
            </section>
            <section>
                <table className="w-full text-xs">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="py-2 px-3 text-left font-semibold">Product</th>
                            <th className="py-2 px-3 text-right font-semibold">Qty</th>
                            <th className="py-2 px-3 text-right font-semibold">Price</th>
                            <th className="py-2 px-3 text-right font-semibold">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sale.soldItems.map(item => {
                            const product = products.find(p => p.id === item.productId);
                            const subtotal = item.price * item.quantity;
                            return (
                                <tr key={item.productId} className="border-b">
                                    <td className="py-2 px-3">{product?.name || 'Unknown'}</td>
                                    <td className="py-2 px-3 text-right">{item.quantity}</td>
                                    <td className="py-2 px-3 text-right">{formatCurrency(item.price, currency)}</td>
                                    <td className="py-2 px-3 text-right font-medium">{formatCurrency(subtotal, currency)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </section>
            <footer className="mt-6">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <div className="flex items-baseline mt-8">
                            <p className="text-xs w-32">Customer Signature:</p>
                            <div className="flex-1 border-b border-gray-400"></div>
                        </div>
                    </div>
                     <div className="text-right text-sm">
                        <div className="flex justify-between"><span className="text-gray-600">Total:</span> <span className="font-semibold">{formatCurrency(sale.total, currency)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-600">Paid:</span> <span className="font-semibold">{formatCurrency(sale.amountPaid, currency)}</span></div>
                        <div className="flex justify-between pt-1 border-t mt-1"><span className="font-bold">Credit Balance:</span> <span className="font-bold text-red-600">{formatCurrency(sale.creditAmount, currency)}</span></div>
                         <p className="text-xs mt-2 text-gray-500">Method: {sale.paymentMethod} {sale.paymentReference && `(${sale.paymentReference})`}</p>
                    </div>
                </div>
                <div className="text-center text-xs text-gray-500 mt-8">
                    <p>Thank you for your business!</p>
                </div>
            </footer>
        </div>
    );
};