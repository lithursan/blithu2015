import React, { useState, useMemo } from 'react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { User, UserRole, UserStatus, Product, DriverAllocation, DriverSale } from '../../types';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../ui/Card';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { COMPANY_DETAILS } from '../../constants';
import { supabase } from '../../supabaseClient';
import { exportDriverAllocations, exportDriverSales } from '../../utils/exportUtils';

const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount).replace('$', `${currency} `);
};

const todayStr = new Date().toISOString().split('T')[0];

export const Drivers: React.FC = () => {
    const { users, products, setProducts, driverAllocations, setDriverAllocations, suppliers } = useData();
    const { currentUser } = useAuth();

    if (currentUser?.role !== UserRole.Admin && currentUser?.role !== UserRole.Manager && currentUser?.role !== UserRole.Sales) {
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
    const [modal, setModal] = useState<'closed' | 'allocate' | 'log'>('closed');
    const [allocationQuantities, setAllocationQuantities] = useState<Record<string, number>>({});
    const [isEditMode, setIsEditMode] = useState(false);
    const [allocationSupplier, setAllocationSupplier] = useState<string>('');
    
    const drivers = useMemo(() => users.filter(u => u.role === UserRole.Driver && u.status === UserStatus.Active), [users]);
    const todayAllocations = useMemo(() => driverAllocations.filter(alloc => alloc.date === todayStr), [driverAllocations]);

    // Move fallback UI after all hooks
    let fallbackUI: React.ReactNode = null;
    if (!drivers || drivers.length === 0) {
        fallbackUI = (
            <div className="p-8 text-center">
                <Card className="max-w-md mx-auto">
                    <CardHeader>
                        <CardTitle>No Active Drivers Found</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-slate-600 dark:text-slate-400">No drivers are currently active in the system. Please add drivers or check your database.</p>
                    </CardContent>
                </Card>
            </div>
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
        setAllocationQuantities({});
        setIsEditMode(false);
        setAllocationSupplier(availableSuppliers.length > 0 ? availableSuppliers[0].name : '');
        setModal('allocate');
    };
    
    const handleOpenEditAllocateModal = (driver: User) => {
        const allocation = todayAllocations.find(a => a.driverId === driver.id);
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

        if (newAllocatedItems.length === 0 && !isEditMode) {
            alert("Please allocate at least one item.");
            return;
        }

        const saveAllocationToDB = async (allocation: DriverAllocation) => {
            const { error } = await supabase
                .from('driver_allocations')
                .upsert([
                    {
                        id: allocation.id,
                        driverid: allocation.driverId,
                        driver_id: allocation.driverId,
                        drivername: allocation.driverName,
                        driver_name: allocation.driverName,
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
                const originalAllocation = driverAllocations.find(a => a.driverId === selectedDriver.id && a.date === todayStr);
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
                    date: todayStr,
                    allocatedItems: newAllocatedItems,
                    returnedItems: null,
                    salesTotal: 0,
                    status: 'Allocated',
                };
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
        const allocation = todayAllocations.find(a => a.driverId === driverId);
        if (!allocation) {
            return { status: 'Not Allocated', badge: 'default' };
        }
        if (allocation.status === 'Reconciled') {
            return { status: 'Reconciled', badge: 'success' };
        }
        return { status: 'Allocated', badge: 'info' };
    };
    
    const productsToShowInModal = useMemo(() => {
        // In edit mode, find the IDs of products that are already part of the allocation.
        const originallyAllocatedProductIds = isEditMode
            ? todayAllocations.find(a => a.driverId === selectedDriver?.id)?.allocatedItems.map(i => i.productId) ?? []
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


    return fallbackUI ? fallbackUI : (
        <div className="p-4 sm:p-6 lg:p-8 space-y-8">
             <style>{`
                @media print {
                  .no-print { display: none !important; }
                  body * { visibility: hidden; }
                  #printable-invoice-content, #printable-invoice-content * { visibility: visible; }
                  #printable-invoice-content { position: absolute; left: 0; top: 0; width: 100%; }
                }
            `}</style>
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Driver Management</h1>
                <div className="flex gap-2 items-center">
                    {/* Export Buttons */}
                    <button
                        onClick={() => exportDriverAllocations(driverAllocations, 'csv')}
                        className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                        title="Export Allocations as CSV"
                    >
                        📊 Allocations CSV
                    </button>
                    <button
                        onClick={() => exportDriverAllocations(driverAllocations, 'xlsx')}
                        className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                        title="Export Allocations as Excel"
                    >
                        📋 Allocations Excel
                    </button>
                    <p className="text-lg text-slate-500 dark:text-slate-400">Date: {todayStr}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {drivers.map(driver => {
                    const { status, badge } = getDriverStatus(driver.id);
                    const allocation = todayAllocations.find(a => a.driverId === driver.id);
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
                                    disabled={!allocation}
                                    className="w-full px-4 py-2 text-sm font-medium text-slate-700 bg-slate-200 rounded-lg hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600 transition-colors disabled:bg-slate-400 dark:disabled:bg-slate-600 disabled:cursor-not-allowed"
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
                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div>
                        <label htmlFor="supplier-filter" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Filter by Supplier</label>
                        <select 
                            id="supplier-filter"
                            value={allocationSupplier}
                            onChange={e => setAllocationSupplier(e.target.value)}
                            className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                        >
                            <option value="">{isEditMode ? "All Assigned Suppliers" : "Select a Supplier"}</option>
                            {availableSuppliers.map(supplier => (
                                <option key={supplier.id} value={supplier.name}>{supplier.name}</option>
                            ))}
                        </select>
                    </div>

                    <p className="text-sm text-slate-600 dark:text-slate-400">Select products from the main warehouse to allocate for today's sales route.</p>
                    <div className="space-y-3">
                         {productsToShowInModal.map(product => {
                            const originalAllocation = isEditMode ? todayAllocations.find(a => a.driverId === selectedDriver?.id) : null;
                            const originalQuantity = originalAllocation?.allocatedItems.find(i => i.productId === product.id)?.quantity || 0;
                            const maxAllocatable = product.stock + originalQuantity;

                            if (maxAllocatable === 0 && !originalQuantity) return null;

                            return (
                                <div key={product.id} className="grid grid-cols-12 gap-4 items-center p-2 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                                    <div className="col-span-6 flex items-center space-x-3">
                                        <img src={product.imageUrl} alt={product.name} className="w-10 h-10 rounded-md"/>
                                        <div>
                                            <p className="font-medium text-slate-900 dark:text-white">{product.name}</p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">Warehouse Stock: {product.stock}</p>
                                        </div>
                                    </div>
                                    <div className="col-span-6">
                                        <label htmlFor={`alloc-${product.id}`} className="sr-only">Allocation quantity for {product.name}</label>
                                        <input
                                            type="number"
                                            id={`alloc-${product.id}`}
                                            value={allocationQuantities[product.id] || ''}
                                            onChange={e => handleAllocationChange(product.id, parseInt(e.target.value, 10) || 0, maxAllocatable)}
                                            min="0"
                                            max={maxAllocatable}
                                            placeholder="0"
                                            className="w-full p-2 border border-slate-300 rounded-md dark:bg-slate-600 dark:border-slate-500 dark:text-white text-center"
                                        />
                                    </div>
                                </div>
                            );
                         })}
                    </div>
                </div>
                <div className="flex items-center justify-end p-6 space-x-2 border-t border-slate-200 rounded-b dark:border-slate-600">
                    <button onClick={handleCloseModal} type="button" className="text-slate-500 bg-white hover:bg-slate-100 focus:ring-4 focus:outline-none focus:ring-blue-300 rounded-lg border border-slate-200 text-sm font-medium px-5 py-2.5 hover:text-slate-900 focus:z-10 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-500 dark:hover:text-white dark:hover:bg-slate-600">
                        Cancel
                    </button>
                    <button onClick={handleSaveAllocation} type="button" className="text-white bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700">
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
    const { products, setProducts, customers, setCustomers, driverAllocations, setDriverAllocations, driverSales, setDriverSales } = useData();
    const [activeTab, setActiveTab] = useState<'log' | 'reconcile'>('log');
    const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);
    const [viewingSaleInvoice, setViewingSaleInvoice] = useState<DriverSale | null>(null);
    
    // State for new sale form
    const [saleQuantities, setSaleQuantities] = useState<Record<string, number>>({});
    const [saleCustomer, setSaleCustomer] = useState<{id?: string, name: string}>({name: ''});
    const [amountPaid, setAmountPaid] = useState<string>('');
    const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Bank' | 'Cheque' | 'Credit'>('Cash');
    const [paymentReference, setPaymentReference] = useState('');
    const [saleNotes, setSaleNotes] = useState('');
    
    // State for reconciliation
    const [returnedQuantities, setReturnedQuantities] = useState<Record<string, number>>({});
    
    const allocation = useMemo(() => 
        driverAllocations.find(a => a.driverId === driver.id && a.date === todayStr), 
        [driverAllocations, driver.id]
    );

    const salesForAllocation = useMemo(() => 
        driverSales.filter(s => s.allocationId === allocation?.id).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        [driverSales, allocation]
    );

    // Show only undelivered products in driver product page
    const stockSummary = useMemo(() => {
        if (!allocation) return {};
        const summary: Record<string, { allocated: number; sold: number; remaining: number }> = {};
        
        // First, get sold quantities from allocation.allocatedItems.sold field
        allocation.allocatedItems.forEach(({ productId, quantity, sold }) => {
            const soldQty = sold || 0; // Use sold field from allocation
            summary[productId] = { 
                allocated: quantity, 
                sold: soldQty, 
                remaining: quantity - soldQty 
            };
        });
        
        // Also add sold quantities from salesForAllocation as backup
        salesForAllocation.forEach(sale => {
            sale.soldItems.forEach(({ productId, quantity }) => {
                if (summary[productId]) {
                    // Only add if allocation doesn't have sold field (backward compatibility)
                    if (!allocation.allocatedItems.find(item => item.productId === productId && item.sold)) {
                        summary[productId].sold += quantity;
                        summary[productId].remaining = summary[productId].allocated - summary[productId].sold;
                    }
                }
            });
        });
        
        console.log('Debug - Stock summary calculated:', summary);
        
        // Only show products not fully delivered
        Object.keys(summary).forEach(productId => {
            if (summary[productId].remaining <= 0) {
                delete summary[productId];
            }
        });
        return summary;
    }, [allocation, salesForAllocation]);
    
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
    alert('handleAddSale called!');
    console.log('handleAddSale called!');
        if (!allocation) return;
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
            allocationId: allocation.id,
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

                // Update driver allocation with sales data
                const updatedAllocatedItems = allocation.allocatedItems.map(item => {
                    const delivered = itemsToSell.find(sold => sold.productId === item.productId);
                    if (delivered) {
                        return {
                            productId: item.productId,
                            quantity: Math.max(0, item.quantity - delivered.quantity),
                            sold: (item.sold || 0) + delivered.quantity
                        };
                    }
                    return item;
                });

                console.log('Debug - Before update:', allocation.allocatedItems);
                console.log('Debug - Updated items:', updatedAllocatedItems);

                let totalSales = 0;
                updatedAllocatedItems.forEach(item => {
                    const product = products.find(p => p.id === item.productId);
                    if (product) {
                        totalSales += (item.sold || 0) * product.price;
                    }
                });

                const updatePayload = {
                    allocated_items: JSON.stringify(updatedAllocatedItems),
                    allocateditems: JSON.stringify(updatedAllocatedItems), // Update both columns for compatibility
                    sales_total: totalSales,
                    salestotal: totalSales, // Update both columns for compatibility  
                    status: 'Delivered'
                };
                
                console.log('Debug - Update payload:', updatePayload);

                const { error: updateError } = await supabase.from('driver_allocations').update(updatePayload).eq('id', allocation.id);

                if (updateError) {
                    console.error('Error updating driver allocation:', updateError);
                    return;
                } else {
                    console.log('Debug - Allocation updated successfully');
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
    
    const handleReturnedQtyChange = (productId: string, quantity: number) => {
        const expected = stockSummary[productId]?.remaining || 0;
        const newQuantity = Math.max(0, Math.min(quantity, expected));
        setReturnedQuantities(prev => ({ ...prev, [productId]: newQuantity }));
    };
    
    const handleReconcile = () => {
        if (!allocation) return;

        const itemsToReturn = allocation.allocatedItems.map(({productId}) => ({
            productId,
            quantity: returnedQuantities[productId] ?? 0,
        }));

        const salesTotal = salesForAllocation.reduce((sum, sale) => sum + sale.total, 0);

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

            // Update product stock in Supabase and UI (add returned quantity)
            for (const { productId, quantity } of itemsToReturn) {
                const product = products.find(p => p.id === productId);
                if (product) {
                    const newStock = product.stock + quantity;
                    await supabase.from('products').update({ stock: newStock }).eq('id', productId);
                }
            }
            setProducts(prevProducts => {
                const updatedProducts = [...prevProducts];
                itemsToReturn.forEach(({ productId, quantity }) => {
                    const productIndex = updatedProducts.findIndex(p => p.id === productId);
                    if (productIndex !== -1) {
                        updatedProducts[productIndex].stock += quantity;
                    }
                });
                return updatedProducts;
            });

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
                setProducts(freshProducts);
                // Force reload of product page if possible
                if (window.location.pathname.includes('products')) {
                    window.location.reload();
                }
            }
            onClose();
        })();
    };


    if (!allocation) {
        return <Modal isOpen={true} onClose={onClose} title="Error"><div className="p-6">No allocation found for this driver today.</div></Modal>;
    }
    
    const collections = salesForAllocation.reduce((acc, sale) => {
        acc.total += sale.total;
        acc.paid += sale.amountPaid;
        acc.credit += sale.creditAmount;
        return acc;
    }, { total: 0, paid: 0, credit: 0 });

    return (
      <Modal isOpen={true} onClose={onClose} title={`Daily Log: ${driver.name} (${todayStr})`}>
          <div className="border-b border-slate-200 dark:border-slate-700 no-print">
                <nav className="flex space-x-2 px-6" aria-label="Tabs">
                    <button onClick={() => setActiveTab('log')} className={`px-3 py-3 text-sm font-medium border-b-2 ${activeTab === 'log' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>Sales Log</button>
                    <button onClick={() => setActiveTab('reconcile')} disabled={allocation.status === 'Reconciled'} className={`px-3 py-3 text-sm font-medium border-b-2 ${activeTab === 'reconcile' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'} disabled:text-slate-400 dark:disabled:text-slate-600 disabled:cursor-not-allowed`}>Reconciliation</button>
                </nav>
          </div>
          
          <div className="p-6 max-h-[60vh] overflow-y-auto">
            {activeTab === 'log' && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h4 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Sales Summary</h4>
                         <button onClick={handleOpenSaleModal} disabled={allocation.status === 'Reconciled'} className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-slate-400 dark:disabled:bg-slate-600">
                            Add Sale
                         </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                        <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/40"><p className="text-xs text-blue-600 dark:text-blue-300">Total Sales</p><p className="text-xl font-bold text-blue-800 dark:text-blue-200">{formatCurrency(collections.total, currency)}</p></div>
                        <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/40"><p className="text-xs text-green-600 dark:text-green-300">Total Collected</p><p className="text-xl font-bold text-green-800 dark:text-green-200">{formatCurrency(collections.paid, currency)}</p></div>
                        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/40"><p className="text-xs text-red-600 dark:text-red-300">Outstanding Credit</p><p className="text-xl font-bold text-red-800 dark:text-red-200">{formatCurrency(collections.credit, currency)}</p></div>
                    </div>
                     <div className="space-y-3">
                        {salesForAllocation.map(sale => (
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
                                                // Only show undelivered products
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
                                    <th className="py-2 px-4 text-center">Actual Returned</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                {Object.entries(stockSummary).map(([productId, summary]) => {
                                    const product = products.find(p => p.id === productId)!;
                                    const s = summary as { allocated: number; sold: number; remaining: number };
                                    const discrepancy = (returnedQuantities[productId] ?? 0) !== s.remaining;
                                    return (
                                        <tr key={productId}>
                                            <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">{product.name}</td>
                                            <td className="py-3 px-4 text-center">{s.allocated}</td>
                                            <td className={`py-1 px-4 text-center ${discrepancy ? 'bg-red-100 dark:bg-red-900/50' : ''}`}>
                                                <input
                                                    type="number"
                                                    value={returnedQuantities[productId] || ''}
                                                    onChange={e => handleReturnedQtyChange(productId, parseInt(e.target.value, 10) || 0)}
                                                    placeholder="0"
                                                    className="w-20 p-2 text-center bg-transparent border rounded-md dark:border-slate-600"
                                                />
                                            </td>
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
                        {allocation?.allocatedItems.map(({ productId }) => {
                             const product = products.find(p => p.id === productId)!;
                             const remaining = stockSummary[productId]?.remaining || 0;
                             if (remaining === 0 && !saleQuantities[productId]) return null;
                             return (
                                 <div key={productId} className="flex justify-between items-center bg-slate-50 dark:bg-slate-700/50 p-2 rounded-lg">
                                    <p>{product.name} <span className="text-xs text-slate-500">(In van: {remaining})</span></p>
                                     <input
                                        type="number" min="0" max={remaining}
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