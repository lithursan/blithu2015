// ...existing code...
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Order, OrderStatus, OrderItem, Customer, Product, UserRole, User } from '../../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/Card';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { COMPANY_DETAILS } from '../../constants';
import { useData } from '../../contexts/DataContext';
import { supabase, fetchOrders } from '../../supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { exportOrders } from '../../utils/exportUtils';
import { emailService } from '../../utils/emailService';
import html2pdf from "html2pdf.js";

const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount).replace('$', `${currency} `);
};


// --- Printable Bill Component ---
interface OrderBillProps {
  order: Order | null;
  customer: Customer | undefined;
  products: Product[];
  currency: string;
  chequeBalance?: number;
  creditBalance?: number;
}

const OrderBill: React.FC<OrderBillProps> = ({ order, customer, products, currency, chequeBalance, creditBalance }) => {
  if (!order || !customer) return null;
  const findProduct = (id: string) => products.find(p => p.id === id);
  // Use props if provided, else fallback to order object
  const billChequeBalance = typeof chequeBalance === 'number' ? chequeBalance : (order?.chequeBalance ?? 0);
  const billCreditBalance = typeof creditBalance === 'number' ? creditBalance : (order?.creditBalance ?? 0);
  const billReturnAmount = typeof order.returnAmount === 'number' ? order.returnAmount : 0;
  const totalOutstanding = billChequeBalance + billCreditBalance;
  const amountPaid = order?.total ? order.total - totalOutstanding : 0;

  return (
    <div className="p-8 font-sans text-gray-800">
      <header className="flex justify-between items-start pb-6 border-b">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{COMPANY_DETAILS.name}</h1>
          <p className="text-sm">{COMPANY_DETAILS.address}</p>
          <p className="text-sm">{COMPANY_DETAILS.email} | {COMPANY_DETAILS.phone}</p>
        </div>
        <div className="text-right">
          <h2 className="text-2xl font-semibold uppercase text-gray-600">INVOICE</h2>
          <p className="text-sm"><strong>Order ID:</strong> {order.id}</p>
          <p className="text-sm"><strong>Date:</strong> {order.date}</p>
        </div>
      </header>
      <section className="grid grid-cols-2 gap-8 my-6">
        <div>
          <h3 className="text-md font-semibold text-gray-700 mb-1">Bill To:</h3>
          <p className="font-bold text-gray-900">{customer.name}</p>
          <p>{customer.location}</p>
          <p>{customer.email}</p>
        </div>
        <div className="text-right">
          <p className="text-sm"><strong>Status:</strong> <span className="font-medium">{order.status}</span></p>
          <p className="text-sm"><strong>Expected Delivery:</strong> <span className="font-medium">{order.expectedDeliveryDate || 'N/A'}</span></p>
        </div>
      </section>
      <section>
        <h3 className="text-md font-semibold text-gray-800 mb-2">Items Ordered</h3>
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="py-2 px-4 text-left font-semibold">Product</th>
              <th className="py-2 px-4 text-right font-semibold">Qty</th>
              <th className="py-2 px-4 text-right font-semibold">Price</th>
              <th className="py-2 px-4 text-right font-semibold">Discount</th>
              <th className="py-2 px-4 text-right font-semibold">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {(order.orderItems ?? []).map(item => {
              const product = findProduct(item.productId);
              if (!product) return null;
              const subtotal = item.price * item.quantity * (1 - (item.discount || 0) / 100);
              return (
                <tr key={item.productId} className="border-b">
                  <td className="py-3 px-4">{product.name}</td>
                  <td className="py-3 px-4 text-right">{item.quantity}</td>
                  <td className="py-3 px-4 text-right">{formatCurrency(item.price, currency)}</td>
                  <td className="py-3 px-4 text-right">{item.discount || 0}%</td>
                  <td className="py-3 px-4 text-right font-semibold">{formatCurrency(subtotal, currency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      {order.backorderedItems && order.backorderedItems.length > 0 && (
        <section className="mt-6">
          <h3 className="text-md font-semibold text-yellow-700 mb-2">Backordered Items</h3>
          <table className="w-full text-sm">
            <thead className="bg-yellow-50">
              <tr>
                <th className="py-2 px-4 text-left font-semibold">Product</th>
                <th className="py-2 px-4 text-right font-semibold">Quantity Held</th>
              </tr>
            </thead>
            <tbody>
              {order.backorderedItems.map(item => (
                <tr key={item.productId} className="border-b">
                  <td className="py-3 px-4">{item.productName}</td>
                  <td className="py-3 px-4 text-right">{item.quantityHeld}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <section className="mt-8">
        <div className="flex justify-between items-center">
          <span className="text-sm">Total Items:</span>
          <span className="font-semibold">{order.totalItems}</span>
        </div>
        <div className="flex justify-between items-center mt-2">
          <span className="text-lg font-bold">Grand Total:</span>
          <span className="text-xl font-bold text-gray-900">{formatCurrency(order.total, currency)}</span>
        </div>
        <div className="flex justify-between items-center mt-2">
          <span className="text-sm">Return Amount:</span>
          <span className="text-lg font-bold text-blue-600">{formatCurrency(billReturnAmount, currency)}</span>
        </div>
        <div className="flex justify-between items-center mt-2">
          <span className="text-sm">Amount Paid:</span>
          <span className="text-lg font-bold text-green-600">{formatCurrency(amountPaid, currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Pending Cheque:</span>
          <span className="font-medium text-yellow-600">{formatCurrency(billChequeBalance, currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Credit Balance:</span>
          <span className="font-medium text-red-600">{formatCurrency(billCreditBalance, currency)}</span>
        </div>
        <div className="flex justify-between text-lg font-bold pt-2 mt-2 border-t">
          <span className="text-gray-800">Balance Due:</span>
          <span className="text-red-700">{formatCurrency(totalOutstanding, currency)}</span>
        </div>
        <div className="mt-6 text-center text-sm text-gray-500">Thank you for your business!</div>
      </section>
    </div>
  );
}

// --- Main Orders Page ---

const getStatusBadgeVariant = (status: OrderStatus): 'success' | 'warning' | 'danger' | 'info' | 'default' => {
    switch (status) {
        case OrderStatus.Delivered: return 'success';
        case OrderStatus.Pending: return 'warning';
        case OrderStatus.Shipped: return 'info';
        case OrderStatus.Cancelled: return 'danger';
        default: return 'default';
    }
}

export const Orders: React.FC = () => {
  // ...existing code...

// printWindow.print() and printWindow.close() should only be inside generateAndDownloadBill, not at the top level
  const [orderNotes, setOrderNotes] = useState('');
  const [orderMethod, setOrderMethod] = useState('');
  // ...existing code...
  const { orders, setOrders, customers, products, setProducts, users, driverAllocations, setDriverAllocations, refetchData } = useData();
  const { currentUser } = useAuth();
  const currency = currentUser?.settings.currency || 'LKR';

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [deliveryDateFilter, setDeliveryDateFilter] = useState('');
  const [dateRangeFilter, setDateRangeFilter] = useState<'today' | 'this_week' | 'this_month' | 'all'>('all');
  
  const [modalState, setModalState] = useState<'closed' | 'create' | 'edit'>('closed');
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [customerSearch, setCustomerSearch] = useState<string>('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState<boolean>(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const [orderItems, setOrderItems] = useState<Record<string, number>>({});
  const [orderDiscounts, setOrderDiscounts] = useState<Record<string, number>>({});
  const [orderItemPrices, setOrderItemPrices] = useState<Record<string, number>>({});
  const [heldItems, setHeldItems] = useState<Set<string>>(new Set());
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState<string>('');
  const [orderToFinalize, setOrderToFinalize] = useState<Order | null>(null);

  const [editableChequeBalance, setEditableChequeBalance] = useState<number | ''>('');
  const [editableCreditBalance, setEditableCreditBalance] = useState<number | ''>('');
  const [editableAmountPaid, setEditableAmountPaid] = useState<number | ''>('');
  // Return amount for returned products (calculated)
  const [returnAmount, setReturnAmount] = useState<number>(0);
  // Editable return amount for input
  const [editableReturnAmount, setEditableReturnAmount] = useState<number | ''>('');

  // Load amountPaid into editableAmountPaid when viewing/editing an order
  useEffect(() => {
    if (viewingOrder) {
      setEditableAmountPaid(typeof viewingOrder.amountPaid === 'number' ? viewingOrder.amountPaid : '');
    }
  }, [viewingOrder]);

  const canEdit = useMemo(() => 
    currentUser?.role === UserRole.Admin || 
    currentUser?.role === UserRole.Manager ||
    currentUser?.role === UserRole.Sales ||
    currentUser?.role === UserRole.Driver,
    [currentUser]
  );
  
  const canDelete = useMemo(() => currentUser?.role === UserRole.Admin || currentUser?.role === UserRole.Manager, [currentUser]);

  // Sales rep cannot print bills or mark orders as delivered
  const canPrintBill = useMemo(() => 
    currentUser?.role === UserRole.Admin || 
    currentUser?.role === UserRole.Manager ||
    currentUser?.role === UserRole.Driver,
    [currentUser]
  );

  const canMarkDelivered = useMemo(() => 
    currentUser?.role === UserRole.Admin || 
    currentUser?.role === UserRole.Manager ||
    currentUser?.role === UserRole.Driver,
    [currentUser]
  );

  const isManagerView = useMemo(() => 
    currentUser?.role === UserRole.Admin || currentUser?.role === UserRole.Manager,
    [currentUser]
  );

  const accessibleSuppliers = useMemo(() => {
    if (currentUser?.role === UserRole.Sales && currentUser.assignedSupplierNames) {
        return new Set(currentUser.assignedSupplierNames);
    }
    return null; // null means all access for Admin/Manager
  }, [currentUser]);

  // Helper function to get driver allocated stock for a product
  const getDriverAllocatedStock = (productId: string): number => {
    if (currentUser?.role !== UserRole.Driver) {
      return 0; // Non-drivers don't have allocated stock
    }
    
    const todayStr = new Date().toISOString().split('T')[0];
    const driverAllocation = driverAllocations.find(
      allocation => allocation.driverId === currentUser.id && allocation.date === todayStr
    );
    
    if (!driverAllocation) {
      return 0; // No allocation for today
    }
    
    const allocatedItem = driverAllocation.allocatedItems.find(
      item => item.productId === productId
    );
    
    return allocatedItem ? allocatedItem.quantity : 0;
  };

  // Helper function to get effective stock (driver allocation or warehouse stock)
  const getEffectiveStock = (product: Product): number => {
    if (currentUser?.role === UserRole.Driver) {
      return getDriverAllocatedStock(product.id);
    }
    return product.stock; // For non-drivers, show warehouse stock
  };

  useEffect(() => {
    if (modalState === 'create') {
        const customer = customers.find(c => c.id === selectedCustomer);
        const defaultDiscounts = customer?.discounts || {};
        const newDiscounts: Record<string, number> = {};
        products.forEach(p => {
            if (defaultDiscounts[p.id]) {
                newDiscounts[p.id] = defaultDiscounts[p.id];
            }
        });
        setOrderDiscounts(newDiscounts);
    }
  }, [selectedCustomer, modalState, customers, products]);

  // Handle click outside to close customer dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
        setIsCustomerDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const availableProductsForOrder = useMemo(() => {
    let filteredProducts = products;
    
    // Role-based filtering
    if (accessibleSuppliers) {
      filteredProducts = filteredProducts.filter(p => accessibleSuppliers.has(p.supplier));
    }
    
    // Search filtering for product modal
    if (productSearchTerm.trim()) {
      const searchLower = productSearchTerm.toLowerCase();
      filteredProducts = filteredProducts.filter(product =>
        product.name.toLowerCase().includes(searchLower) ||
        product.category.toLowerCase().includes(searchLower) ||
        product.sku.toLowerCase().includes(searchLower)
      );
    }
    
    return filteredProducts;
  }, [products, accessibleSuppliers, productSearchTerm]);

  const filteredOrders = useMemo(() => {
    let displayOrders = [...orders];

    // Role-based filtering
    if (currentUser?.role === UserRole.Sales && currentUser.assignedSupplierNames) {
        const accessibleSuppliers = new Set(currentUser.assignedSupplierNames);
        const productSupplierMap = new Map(products.map(p => [p.id, p.supplier]));
        displayOrders = displayOrders.filter(order => 
            order.orderItems.some(item => {
                const supplier = productSupplierMap.get(item.productId);
                return supplier && accessibleSuppliers.has(supplier);
            })
        );
    } 
    
    // Remove driver filter: show all orders for driver login
    // else if (currentUser?.role === UserRole.Driver) {
    //   displayOrders = displayOrders.filter(order => order.assignedUserId === currentUser.id);
    // }
    
    // Status filter
    if (statusFilter !== 'all') {
      displayOrders = displayOrders.filter(order => order.status === statusFilter);
    }

    // Search filter
    if (searchTerm) {
        const lowercasedTerm = searchTerm.toLowerCase();
        displayOrders = displayOrders.filter(order =>
            order.id.toLowerCase().includes(lowercasedTerm) ||
            order.customerName.toLowerCase().includes(lowercasedTerm)
        );
    }

    // Delivery date filter
    if (deliveryDateFilter) {
        displayOrders = displayOrders.filter(order => {
            const deliveryDate = order.expectedDeliveryDate || order.date;
            if (!deliveryDate) return false;
            
            const orderDateStr = typeof deliveryDate === 'string' ? deliveryDate.slice(0, 10) : deliveryDate;
            return orderDateStr === deliveryDateFilter;
        });
    }

    // Date range filter
    if (dateRangeFilter !== 'all') {
        const today = new Date();
        const todayStr = today.toISOString().slice(0, 10); // YYYY-MM-DD format
        
        displayOrders = displayOrders.filter(order => {
            const deliveryDate = order.expectedDeliveryDate || order.date;
            if (!deliveryDate) return false;
            
            const orderDateStr = typeof deliveryDate === 'string' ? deliveryDate.slice(0, 10) : deliveryDate;
            const orderDate = new Date(orderDateStr);
            
            switch (dateRangeFilter) {
                case 'today':
                    return orderDateStr === todayStr;
                case 'this_week':
                    const startOfWeek = new Date(today);
                    startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
                    startOfWeek.setHours(0, 0, 0, 0);
                    const endOfWeek = new Date(startOfWeek);
                    endOfWeek.setDate(startOfWeek.getDate() + 6); // Saturday
                    endOfWeek.setHours(23, 59, 59, 999);
                    return orderDate >= startOfWeek && orderDate <= endOfWeek;
                case 'this_month':
                    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                    return orderDate >= startOfMonth && orderDate <= endOfMonth;
                default:
                    return true;
            }
        });
    }

    return displayOrders.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [orders, products, statusFilter, searchTerm, currentUser, deliveryDateFilter, dateRangeFilter]);
    
  const ordersBySupplier = useMemo(() => {
    return filteredOrders.reduce((acc, order) => {
      let supplierName = 'Unassigned';
      if ((order.orderItems ?? []).length > 0) {
        // Determine primary supplier based on highest value item in order
        let primaryProductInfo = { supplier: 'Unassigned', value: 0 };
        (order.orderItems ?? []).forEach(item => {
            const product = products.find(p => p.id === item.productId);
            if(product) {
                const itemValue = item.price * item.quantity;
                if(itemValue > primaryProductInfo.value){
                    primaryProductInfo = { supplier: product.supplier, value: itemValue };
                }
            }
        });
        supplierName = primaryProductInfo.supplier;
      }
      if (!acc[supplierName]) {
        acc[supplierName] = [];
      }
      acc[supplierName].push(order);
      return acc;
    }, {} as Record<string, Order[]>);
  }, [filteredOrders, products]);

  const openCreateModal = () => {
    setCurrentOrder(null);
    setSelectedCustomer(customers[0]?.id || '');
    setCustomerSearch(customers[0]?.name || '');
    setOrderItems({});
    setOrderDiscounts({});
    const initialPrices = products.reduce((acc, p) => {
        acc[p.id] = p.price;
        return acc;
    }, {} as Record<string, number>);
    setOrderItemPrices(initialPrices);
    setHeldItems(new Set());
    setExpectedDeliveryDate('');
    setModalState('create');
  };

  const openEditModal = (order: Order) => {
    setCurrentOrder(order);
    setSelectedCustomer(order.customerId);
    const customer = customers.find(c => c.id === order.customerId);
    setCustomerSearch(customer?.name || '');
    // Fix: Use (order.orderItems ?? []) and (order.backorderedItems ?? [])
    const allItems = [...(order.orderItems ?? []), ...((order.backorderedItems ?? []))];
    const items = allItems.reduce((acc, item) => {
      acc[item.productId] = item.quantity;
      return acc;
    }, {} as Record<string, number>);
    const discounts = (order.orderItems ?? []).reduce((acc, item) => {
      acc[item.productId] = item.discount || 0;
      return acc;
    }, {} as Record<string, number>);
    const prices = allItems.reduce((acc, item) => {
        acc[item.productId] = item.price;
        return acc;
    }, {} as Record<string, number>);
    products.forEach(p => {
        if (!prices[p.id]) {
            prices[p.id] = p.price;
        }
    });

    const backorderedIds = new Set((order.backorderedItems ?? []).map(item => item.productId));
    setOrderItems(items);
    setOrderDiscounts(discounts);
    setOrderItemPrices(prices);
    setHeldItems(backorderedIds);
    setExpectedDeliveryDate(order.expectedDeliveryDate || '');
    setModalState('edit');
  };
  
  const closeModal = () => {
    setModalState('closed');
    setCurrentOrder(null);
    setProductSearchTerm(''); // Clear product search when modal closes
  };

  const openDeleteModal = (order: Order) => {
    setOrderToDelete(order);
  };
  
  const closeDeleteModal = () => {
    setOrderToDelete(null);
  };

  const openViewModal = (order: Order) => {
    // Patch: Ensure customerId is always set in viewingOrder
    const patchedOrder = {
      ...order,
      customerId: order.customerId || '', // use only camelCase for type safety
    };
    setViewingOrder(patchedOrder);
    // Always use DB values if present, fallback to calculated only if missing
    setEditableChequeBalance(
      typeof patchedOrder.chequeBalance === 'number' ? patchedOrder.chequeBalance : 0
    );
    setEditableCreditBalance(
      typeof patchedOrder.creditBalance === 'number' ? patchedOrder.creditBalance : 0
    );
    setReturnAmount(
      typeof patchedOrder.returnAmount === 'number' ? patchedOrder.returnAmount : 0
    );
    setEditableReturnAmount(
      typeof patchedOrder.returnAmount === 'number' ? patchedOrder.returnAmount : 0
    );
    setEditableAmountPaid(
      typeof patchedOrder.amountPaid === 'number'
        ? patchedOrder.amountPaid
        : (patchedOrder.total - (patchedOrder.chequeBalance || 0) - (patchedOrder.creditBalance || 0))
    );
  };

  const closeViewModal = () => {
    setViewingOrder(null);
  };

  const handleQuantityChange = (productId: string, quantity: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const isHeld = heldItems.has(productId);
    const maxQuantity = getEffectiveStock(product) > 0 && !isHeld ? getEffectiveStock(product) : Infinity;
    const newQuantity = Math.max(0, Math.min(quantity, maxQuantity));
    setOrderItems(prev => ({ ...prev, [productId]: newQuantity }));
  };

  const handleDiscountChange = (productId: string, discount: number) => {
    const newDiscount = Math.max(0, Math.min(discount, 100));
    setOrderDiscounts(prev => ({ ...prev, [productId]: newDiscount}));
  };
  
  const handlePriceChange = (productId: string, price: number) => {
    const newPrice = Math.max(0, price);
    setOrderItemPrices(prev => ({ ...prev, [productId]: newPrice }));
};

  const toggleHoldItem = (productId: string) => {
    setHeldItems(prev => {
        const newSet = new Set(prev);
        if (newSet.has(productId)) {
            newSet.delete(productId);
        } else {
            newSet.add(productId);
        }
        return newSet;
    });
};

  const { total, inStockItems, heldItemsCount } = useMemo(() => {
    return Object.entries(orderItems).reduce(
      (acc, [productId, quantity]: [string, number]) => {
        const product = products.find(p => p.id === productId);
        if (product && quantity > 0) {
          const isHeld = heldItems.has(productId);
          const isOutOfStock = getEffectiveStock(product) === 0;

          if (isHeld || isOutOfStock) {
            acc.heldItemsCount += quantity;
          } else {
            const price = orderItemPrices[productId] ?? product.price;
            const discount = orderDiscounts[productId] || 0;
            const discountedPrice = price * (1 - discount / 100);
            acc.total += discountedPrice * quantity;
            acc.inStockItems += quantity;
          }
        }
        return acc;
      },
      { total: 0, inStockItems: 0, heldItemsCount: 0 }
    );
  }, [orderItems, orderDiscounts, orderItemPrices, heldItems, products]);

  const handleSaveOrder = async () => {
  if (!selectedCustomer || (inStockItems === 0 && heldItemsCount === 0)) {
    alert("Please select a customer and add at least one item.");
    return;
  }

  const customer = customers.find(c => c.id === selectedCustomer);
  if (!customer) return;

  const newOrderItems: OrderItem[] = [];
  const newBackorderedItems: OrderItem[] = [];

  Object.entries(orderItems)
    .filter(([, quantity]: [string, number]) => quantity > 0)
    .forEach(([productId, quantity]: [string, number]) => {
      const product = products.find(p => p.id === productId);
      if (!product) return;
      const isHeld = heldItems.has(productId);
      const isOutOfStock = getEffectiveStock(product) === 0;
      const price = orderItemPrices[productId] ?? product?.price ?? 0;

      if (isHeld || isOutOfStock) {
        newBackorderedItems.push({ productId, quantity, price });
      } else {
         newOrderItems.push({ 
          productId, 
          quantity, 
          price: price,
          discount: orderDiscounts[productId] || 0,
        });
      }
    });

  // Patch: Always assign customerId (snake_case for DB)
  if (modalState === 'create') {
    try {
      if (!customer.id) {
        alert('Please select a customer');
        return;
      }

      if (newOrderItems.length === 0) {
        alert('Please add at least one item to the order');
        return;
      }

      const maxIdNum = orders.reduce((max, order) => {
        const num = parseInt(order.id.replace('ORD', ''), 10);
        return num > max ? num : max;
      }, 0);

      const newOrder = {
        id: `ORD${(maxIdNum + 1).toString().padStart(3, '0')}`,
        customerid: customer.id,
        customername: customer.name,
        assigneduserid: currentUser?.id ?? '',
        orderitems: JSON.stringify(newOrderItems),
        backordereditems: JSON.stringify(newBackorderedItems),
        method: orderMethod || '',
        expecteddeliverydate: expectedDeliveryDate || null,
        orderdate: expectedDeliveryDate || new Date().toISOString().slice(0, 10),
        totalamount: total,
        status: OrderStatus.Pending,
        notes: orderNotes || '',
        chequebalance: 0,
        creditbalance: 0,
      };
      
      const { error } = await supabase.from('orders').insert([newOrder]);
      if (error) {
        alert('Error adding order: ' + error.message);
        return;
      }
      
      const freshOrders = await fetchOrders();
      if (freshOrders) setOrders(freshOrders);
      
      // Send email notification to assigned user if enabled
      const createdOrder = freshOrders?.find(o => o.id === newOrder.id);
      if (createdOrder && currentUser) {
        await emailService.sendNewOrderNotification(currentUser, createdOrder, customer.name);
      }
      
      alert('Order created successfully!');
    } catch (error) {
      console.error('Unexpected error creating order:', error);
      alert('An unexpected error occurred. Please try again.');
      return;
    }
  } else if (modalState === 'edit' && currentOrder) {
    try {
      const updatedOrder = {
        customerid: customer.id,
        customername: customer.name,
        assigneduserid: currentOrder.assigneduserid ?? '',
        orderitems: JSON.stringify(newOrderItems),
        backordereditems: JSON.stringify(newBackorderedItems),
        method: orderMethod || '',
        expecteddeliverydate: expectedDeliveryDate || null,
        orderdate: expectedDeliveryDate || currentOrder.orderdate || new Date().toISOString().slice(0, 10),
        totalamount: total,
        status: currentOrder.status ?? OrderStatus.Pending,
        notes: orderNotes || '',
        chequebalance: currentOrder.chequeBalance || 0,
        creditbalance: currentOrder.creditBalance || 0,
      };
      
      const { error } = await supabase.from('orders').update(updatedOrder).eq('id', currentOrder.id);
      if (error) {
        alert('Error updating order: ' + error.message);
        return;
      }
      
      const freshOrders = await fetchOrders();
      if (freshOrders) setOrders(freshOrders);
      alert('Order updated successfully!');
    } catch (error) {
      console.error('Unexpected error updating order:', error);
      alert('An unexpected error occurred. Please try again.');
      return;
    }
  }
  closeModal();
};
  
  const handleDeleteOrder = async () => {
    if (!orderToDelete) return;
    
    try {
      const { error } = await supabase.from('orders').delete().eq('id', orderToDelete.id);
      if (error) {
        alert('Error deleting order: ' + error.message);
        return;
      }
      
      const freshOrders = await fetchOrders();
      if (freshOrders) setOrders(freshOrders);
      alert('Order deleted successfully!');
      closeDeleteModal();
    } catch (error) {
      console.error('Unexpected error deleting order:', error);
      alert('An unexpected error occurred while deleting. Please try again.');
    }
  };
  
  const handleStatusChange = (orderId: string, newStatus: OrderStatus) => {
    setOrders(prevOrders =>
      prevOrders.map(o =>
        o.id === orderId ? { ...o, status: newStatus } : o
      )
    );
  };

  const handleToggleHoldInView = (productId: string, action: 'hold' | 'unhold') => {
    if (!viewingOrder) return;

    const updatedOrder = JSON.parse(JSON.stringify(viewingOrder));
    let itemToMove: OrderItem | undefined;

    if (action === 'hold') {
      const itemIndex = updatedOrder.orderItems.findIndex((item: OrderItem) => item.productId === productId);
      if (itemIndex === -1) return;
      
      itemToMove = updatedOrder.orderItems[itemIndex];
      updatedOrder.orderItems.splice(itemIndex, 1);
      
      if (!updatedOrder.backorderedItems) {
        updatedOrder.backorderedItems = [];
      }
      updatedOrder.backorderedItems.push(itemToMove);

    } else { // unhold
      const product = products.find(p => p.id === productId);
      if (!product || getEffectiveStock(product) === 0) return;

      const itemIndex = (updatedOrder.backorderedItems || []).findIndex((item: OrderItem) => item.productId === productId);
      if (itemIndex === -1) return;

      itemToMove = updatedOrder.backorderedItems![itemIndex];
      updatedOrder.backorderedItems!.splice(itemIndex, 1);
      updatedOrder.orderItems.push(itemToMove);
    }
    
    const newTotal = updatedOrder.orderItems.reduce((sum: number, item: OrderItem) => {
        const discount = item.discount || 0;
        const subtotal = item.price * item.quantity * (1 - discount / 100);
        return sum + subtotal;
    }, 0);
    updatedOrder.total = newTotal;

    setViewingOrder(updatedOrder);
    setOrders(prevOrders => prevOrders.map(o => o.id === updatedOrder.id ? updatedOrder : o));
  };

  const handleSaveBalances = () => {

    if (!viewingOrder) return;
    const totalOutstanding = editableChequeBalance + editableCreditBalance;
    if (totalOutstanding > viewingOrder.total) {
        if (!window.confirm('The outstanding balance is greater than the order total. Do you want to proceed?')) {
            return;
        }
    }
    const updatedOrder: Order = {
        ...viewingOrder,
        chequeBalance: editableChequeBalance,
        creditBalance: editableCreditBalance,
        returnAmount: editableReturnAmount === '' ? 0 : editableReturnAmount,
        amountPaid: editableAmountPaid === '' ? 0 : editableAmountPaid,
    };
    // Save to Supabase (amountPaid is now stored)
    supabase.from('orders').update({
      chequebalance: editableChequeBalance,
      creditbalance: editableCreditBalance,
      returnamount: editableReturnAmount === '' ? 0 : editableReturnAmount,
      amountpaid: editableAmountPaid === '' ? 0 : editableAmountPaid
    }).eq('id', viewingOrder.id).then(async ({ error }) => {
      if (!error) {
        // Upsert collection records for cheque/credit balances
        const collectionRecords = [];
        // Find assigned user name for this order
        let assignedUserName = '';
        if (viewingOrder.assignedUserId && users && users.length > 0) {
          const assignedUser = users.find(u => u.id === viewingOrder.assignedUserId);
          if (assignedUser) assignedUserName = assignedUser.name;
        }
        if (editableChequeBalance > 0) {
          collectionRecords.push({
            order_id: viewingOrder.id,
            customer_id: viewingOrder.customerId,
            collection_type: 'cheque',
            amount: editableChequeBalance,
            status: 'pending',
            collected_by: assignedUserName,
            created_at: new Date().toISOString(),
          });
        }
        if (editableCreditBalance > 0) {
          collectionRecords.push({
            order_id: viewingOrder.id,
            customer_id: viewingOrder.customerId,
            collection_type: 'credit',
            amount: editableCreditBalance,
            status: 'pending',
            collected_by: assignedUserName,
            created_at: new Date().toISOString(),
          });
        }
        if (collectionRecords.length > 0) {
          // Only use 'order_id,collection_type' in onConflict
          await supabase.from('collections').upsert(collectionRecords, { onConflict: 'order_id,collection_type' });
        }
        // Refetch orders to persist changes after refresh
        const { data: freshOrders, error: fetchError } = await supabase.from('orders').select('*');
        if (!fetchError && freshOrders) {
          // Map the fresh orders data properly
          const mappedOrders = freshOrders.map((row: any) => ({
            id: row.id,
            customerId: row.customerid,
            customerName: row.customername,
            date: row.orderdate,
            total: row.totalamount,
            status: row.status,
            paymentMethod: row.paymentmethod,
            notes: row.notes,
            assignedUserId: row.assigneduserid,
            orderItems: typeof row.orderitems === 'string' ? JSON.parse(row.orderitems) : (row.orderitems || []),
            backorderedItems: [],
            chequeBalance: row.chequebalance == null || isNaN(Number(row.chequebalance)) ? 0 : Number(row.chequebalance),
            creditBalance: row.creditbalance == null || isNaN(Number(row.creditbalance)) ? 0 : Number(row.creditbalance),
            returnAmount: row.returnamount == null || isNaN(Number(row.returnamount)) ? 0 : Number(row.returnamount),
            amountPaid: row.amountpaid == null || isNaN(Number(row.amountpaid)) ? 0 : Number(row.amountpaid),
          }));
          setOrders(mappedOrders);
          setViewingOrder(updatedOrder);
          alert('Balances updated and saved!');
        } else {
          alert('Balances saved, but failed to refresh orders.');
        }
      } else {
        alert('Failed to save balances: ' + error.message);
      }
    });
  };



  const handleConfirmFinalize = async (orderToProcess?: Order) => {
  const targetOrder = orderToProcess || orderToFinalize;
  if (!targetOrder) return;
  // Prevent double delivery logic
  if (targetOrder.status === OrderStatus.Delivered) {
    // Already delivered, skip all allocation/stock logic
    return;
  }
  // Integrity check
  if (!targetOrder || !targetOrder.orderItems || targetOrder.orderItems.length === 0) {
    alert("Cannot finalize an order with no items.");
    if (!orderToProcess) setOrderToFinalize(null);
    return;
  }
  // Check stock levels before proceeding
  let stockSufficient = true;
  for (const item of targetOrder.orderItems) {
    const product = products.find(p => p.id === item.productId);
    if (!product || getEffectiveStock(product) < item.quantity) {
      alert(`Insufficient stock for ${product?.name || 'an item'}. Cannot finalize order.`);
      stockSufficient = false;
      break;
    }
  }
  if (!stockSufficient) {
    if (!orderToProcess) setOrderToFinalize(null);
    return; // Abort the finalization
  }
  // --- Update sold column in orders table ---
  const soldQty = targetOrder.orderItems.reduce((sum, i) => sum + i.quantity, 0);
  await supabase.from('orders').update({ status: OrderStatus.Delivered, sold: soldQty }).eq('id', targetOrder.id);
  // Refetch all data to sync UI everywhere
  await refetchData();
    // --- Sync allocation salesTotal and update allocatedItems after delivery ---
    if (currentUser?.role === UserRole.Driver && driverAllocations.length > 0) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const allocation = driverAllocations.find((a: any) => a.driverId === currentUser.id && a.date === todayStr);
      if (allocation) {
        // Update salesTotal
        const newSalesTotal = (allocation.salesTotal || 0) + soldQty;
        // Reduce delivered product quantities from allocatedItems
        const deliveredItems = targetOrder.orderItems;
        let updatedAllocatedItems = allocation.allocatedItems.map((item: any) => {
          const delivered = deliveredItems.find((di: any) => di.productId === item.productId);
          if (delivered) {
            const newQty = item.quantity - delivered.quantity;
            return { ...item, quantity: newQty > 0 ? newQty : 0 };
          }
          return item;
        }).filter((item: any) => item.quantity > 0); // Remove items with 0 qty
        
        // Update allocation in Supabase
        await supabase.from('driver_allocations').update({ 
          sales_total: newSalesTotal, 
          allocated_items: JSON.stringify(updatedAllocatedItems) 
        }).eq('id', allocation.id);
        
        // Immediately update local driver allocations state for real-time sync
        setDriverAllocations(prevAllocations => 
          prevAllocations.map(alloc => 
            alloc.id === allocation.id 
              ? { ...alloc, salesTotal: newSalesTotal, allocatedItems: updatedAllocatedItems }
              : alloc
          )
        );
        
        console.log('Driver allocation updated in real-time:', {
          allocationId: allocation.id,
          newSalesTotal,
          updatedItems: updatedAllocatedItems.length
        });
      }
    }
  // --- Deduct inventory in UI and Supabase ---
    // Deduct stock ONLY when delivering (not at allocation)
    if (targetOrder.status !== OrderStatus.Delivered) {
      for (const item of targetOrder.orderItems) {
        // For drivers, reduce from allocated stock (driver_allocations), not from warehouse
        // For non-drivers, reduce from warehouse stock
        // Here, always reduce from warehouse stock only on delivery
        const currentProduct = products.find(p => p.id === item.productId);
        if (currentProduct && currentProduct.stock >= item.quantity) {
          await supabase.from('products').update({ 
            stock: currentProduct.stock - item.quantity 
          }).eq('id', item.productId);
        } else {
          console.warn(`Insufficient stock for product ${item.productId}: available ${currentProduct?.stock}, required ${item.quantity}`);
        }
      }
    }

    // 2. Update order status
    const updatedOrder: Order = { ...targetOrder, status: OrderStatus.Delivered };
    // End of handleConfirmFinalize function
  }
  
  const [billLoading, setBillLoading] = useState(false);

  const handleDownloadBill = async () => {
    if (billLoading) return; // Prevent double click
    setBillLoading(true);
    if (!viewingOrder) {
      setBillLoading(false);
      return;
    }
    const customer = customers.find(c => c.id === viewingOrder.customerId);
    if (!customer) {
      alert('Customer data missing. Cannot download bill.');
      setBillLoading(false);
      return;
    }

    // Only on first delivery (not already delivered)
    if (viewingOrder.status !== OrderStatus.Delivered && canMarkDelivered) {
      if (!confirm('This will mark the order as delivered and reduce stock. Continue?')) {
        setBillLoading(false);
        return;
      }
      try {
        await handleConfirmFinalize(viewingOrder); // This will update status to Delivered and reduce stock/allocation
        // Update viewingOrder status in UI immediately for live sync
        if (setViewingOrder) setViewingOrder({ ...viewingOrder, status: OrderStatus.Delivered });
        // Also update the order in the orders list if present
        setOrders(prev => prev.map(o => o.id === viewingOrder.id ? { ...o, status: OrderStatus.Delivered } : o));
        await refetchData();
        setTimeout(() => {
          generateAndDownloadBill(viewingOrder.status);
          setBillLoading(false);
        }, 1000);
        return;
      } catch (error) {
        alert('Failed to mark order as delivered. Please try again.');
        setBillLoading(false);
        return;
      }
    } else {
      // Already delivered: just print, do not touch allocation/stock
      generateAndDownloadBill(viewingOrder.status);
      setBillLoading(false);
    }
  };

  const printBill = (html) => {
    if (window.AndroidBridge) {
      // 'AndroidBridge' is the name you gave the native interface
      window.AndroidBridge.printBill(html);
    } else {
      console.error("Android bridge not available for printing.");
    }
  };  

  const generateAndDownloadBill = (status) => {
    if (!viewingOrder) return;
    const customer = customers.find(c => c.id === viewingOrder.customerId);
    if (!customer) return;

    // Generate the bill HTML as before
    const billHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice - Order ${viewingOrder.id}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
            .company-info h1 { margin: 0; font-size: 24px; }
            .invoice-info { text-align: right; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background-color: #f5f5f5; font-weight: bold; }
            .total-section { text-align: right; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company-info">
              <h1>${COMPANY_DETAILS.name}</h1>
              <p>${COMPANY_DETAILS.address}</p>
            </div>
            <div class="invoice-info">
              <h2>INVOICE</h2>
              <p><strong>Order ID:</strong> ${viewingOrder.id}</p>
              <p><strong>Date:</strong> ${viewingOrder.date}</p>
            </div>
          </div>
          <p><strong>Customer:</strong> ${customer.name}</p>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${(viewingOrder.orderItems ?? []).map(item => {
                const product = products.find(p => p.id === item.productId);
                const subtotal = item.price * item.quantity;
                return `
                  <tr>
                    <td>${product?.name || 'Unknown'}</td>
                    <td>${item.quantity}</td>
                    <td>${formatCurrency(item.price, currency)}</td>
                    <td>${formatCurrency(subtotal, currency)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          <div class="total-section">
            <p><strong>Grand Total:</strong> ${formatCurrency(viewingOrder.total, currency)}</p>
          </div>
          <p style="text-align:center; margin-top:30px;">Thank you for your business!</p>
        </body>
      </html>
    `;

    if(status !== OrderStatus.Delivered){
      // Create a downloadable HTML file
      const blob = new Blob([billHTML], { type: 'text/html' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Invoice-${viewingOrder.id}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      printBill(billHTML)
    }
  };


  // ...existing code...
  // Place the return statement here, after all hooks and functions
  return (
    <>
      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body * {
            visibility: hidden;
          }
          #printable-bill-content, #printable-bill-content * {
            visibility: visible;
          }
          #printable-bill-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>

      <div className="p-4 sm:p-6 lg:p-8 space-y-8 no-print">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Orders</h1>
          <div className="flex gap-2">
            {/* Export Buttons */}
            <button
              onClick={() => exportOrders(filteredOrders, 'csv')}
              className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
              title="Export as CSV"
            >
              📊 CSV
            </button>
            <button
              onClick={() => exportOrders(filteredOrders, 'xlsx')}
              className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
              title="Export as Excel"
            >
              📋 Excel
            </button>
            {canEdit && (
              <button
                onClick={openCreateModal}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                New Order
              </button>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{isManagerView ? 'Order History' : 'My Orders'}</CardTitle>
            <CardDescription>
                {isManagerView ? 'View and manage all customer orders.' : 'View and manage orders assigned to you.'}
            </CardDescription>
            <div className="pt-4 flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
              <input
                type="text"
                placeholder="Search by Order ID or Customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full max-w-sm px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as OrderStatus | 'all')}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                  <option value="all">All Statuses</option>
                  <option value={OrderStatus.Pending}>Pending</option>
                  <option value={OrderStatus.Delivered}>Delivered</option>
              </select>
              <select
                  value={dateRangeFilter}
                  onChange={(e) => {
                      setDateRangeFilter(e.target.value as 'today' | 'this_week' | 'this_month' | 'all');
                      setDeliveryDateFilter(''); // Clear specific date when range is selected
                  }}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                  <option value="all">All Delivery Dates</option>
                  <option value="today">Today's Deliveries</option>
                  <option value="this_week">This Week</option>
                  <option value="this_month">This Month</option>
              </select>
              <input
                  type="date"
                  value={deliveryDateFilter}
                  onChange={(e) => {
                      setDeliveryDateFilter(e.target.value);
                      setDateRangeFilter('all'); // Clear range when specific date is selected
                  }}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  title="Filter by specific delivery date"
              />
              {(deliveryDateFilter || dateRangeFilter !== 'all') && (
                  <button
                      onClick={() => {
                          setDeliveryDateFilter('');
                          setDateRangeFilter('all');
                      }}
                      className="px-3 py-2 text-sm bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 rounded-lg transition-colors"
                      title="Clear date filters"
                  >
                      Clear Date
                  </button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {Object.entries(ordersBySupplier).map(([supplierName, supplierOrders]) => {
                const ordersList = (supplierOrders ?? []) as Order[];
                return (
                  <div key={supplierName}>
                    <div className="flex items-center space-x-3 mb-4">
                      <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-300">{supplierName}</h2>
                      <Badge variant="default">{ordersList.length} {ordersList.length === 1 ? 'Order' : 'Orders'}</Badge>
                    </div>
                    <div className="overflow-x-auto border dark:border-slate-700 rounded-lg">
                      <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                        <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-400">
                          <tr>
                            <th scope="col" className="px-6 py-3 z-20 sticky left-0">Order ID</th>
                            <th scope="col" className="px-6 py-3 z-20 sticky left-[112px]">Customer Name</th>
                            {isManagerView && <th scope="col" className="px-6 py-3">Assigned To</th>}
                            <th scope="col" className="px-6 py-3">Date</th>
                            <th scope="col" className="px-6 py-3">Total</th>
                            {isManagerView && <th scope="col" className="px-6 py-3">Cost Price</th>}
                            <th scope="col" className="px-6 py-3">Items</th>
                            <th scope="col" className="px-6 py-3">Status</th>
                            {currentUser?.role !== UserRole.Driver && <th scope="col" className="px-6 py-3">Outstanding</th>}
                            <th scope="col" className="px-6 py-3 z-20 sticky right-0">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ordersList.map((order) => {
                // Use DB columns: assigneduserid, totalamount, orderdate
                              const assignedUser = users.find(u => u.id === order.assignedUserId);
                let allocatedProductIds: string[] = [];
                if (currentUser?.role === UserRole.Driver && driverAllocations.length > 0) {
                  const todayStr = new Date().toISOString().slice(0, 10);
                  console.log('DriverAllocations:', driverAllocations);
                  console.log('CurrentUser:', currentUser);
                  const allocation = driverAllocations.find((a: any) => {
                    console.log('Checking allocation:', a);
                    return a.driverId === currentUser.id && a.date === todayStr;
                  });
                  console.log('Matched allocation:', allocation);
                  if (allocation) {
                    allocatedProductIds = allocation.allocatedItems.map((i: any) => i.productId);
                  }
                }
                return (
                  <tr key={order.id} className="border-b dark:bg-slate-800 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600">
                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-white z-10 sticky left-0">{order.id}</td>
                    <td className="px-6 py-4 z-10 sticky left-[112px]">{order.customerName}</td>
                    {isManagerView && (
                      <td className="px-6 py-4">
                        {assignedUser ? (
                          <div className="flex items-center space-x-2">
                            {assignedUser.avatarUrl && <img src={assignedUser.avatarUrl} alt={assignedUser.name} className="w-6 h-6 rounded-full" />}
                            <span className="text-xs">{assignedUser.name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">N/A</span>
                        )}
                      </td>
                    )}
                    <td className="px-6 py-4">{
                                        order.date
                                          ? (() => {
                                              const d = new Date(order.date);
                                              return isNaN(d.getTime())
                                                ? <span className="text-xs text-red-500">{order.date}</span>
                                                : d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
                                            })()
                                          : 'N/A'
                                      }</td>
                    <td className="px-6 py-4">{typeof order.total === 'number' ? `LKR${order.total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : 'LKR0'}</td>
                    {isManagerView && (
                      <td className="px-6 py-4">{
                        (() => {
                          if (!order.orderItems || !Array.isArray(order.orderItems)) return 'LKR0';
                          const totalCost = order.orderItems.reduce((sum, item) => {
                            const product = products.find(p => p.id === item.productId);
                            return sum + ((product?.costPrice || 0) * (item.quantity || 0));
                          }, 0);
                          return `LKR${totalCost.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
                        })()
                      }</td>
                    )}
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        <span className="inline-block bg-blue-100 dark:bg-blue-700 px-2 py-1 rounded text-xs text-blue-800 dark:text-blue-200">
                          {(order.orderItems ?? []).reduce((total, item) => total + item.quantity, 0)} items
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          (View details to see items)
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={getStatusBadgeVariant(order.status)}>{order.status}</Badge>
                    </td>
                    {currentUser?.role !== UserRole.Driver && (
                      <td className="px-6 py-4">
                        <div>
                          <span className="block text-xs text-slate-600">Cheque: <span className="font-bold">{typeof order.chequeBalance === 'number' && !isNaN(order.chequeBalance) ? `LKR${order.chequeBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : 'LKR0.00'}</span></span>
                          <span className="block text-xs text-slate-600">Credit: <span className="font-bold">{typeof order.creditBalance === 'number' && !isNaN(order.creditBalance) ? `LKR${order.creditBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : 'LKR0.00'}</span></span>
                          <span className="block text-xs text-blue-600">Return Amount: <span className="font-bold">{typeof order.returnAmount === 'number' && !isNaN(order.returnAmount) ? `LKR${order.returnAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : 'LKR0.00'}</span></span>
                          <span className="block text-xs text-red-600">Outstanding: <span className="font-bold">{'LKR' + ((typeof order.chequeBalance === 'number' && !isNaN(order.chequeBalance) ? order.chequeBalance : 0) + (typeof order.creditBalance === 'number' && !isNaN(order.creditBalance) ? order.creditBalance : 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></span>
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4 flex items-center space-x-3 z-10 sticky right-0">
                    <button onClick={() => openViewModal(order)} className="font-medium text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-300">View</button>
                    {canEdit && (
                      <>
                        <button onClick={() => openEditModal(order)} className="font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">Edit</button>
                        {canDelete && <button onClick={() => openDeleteModal(order)} className="font-medium text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300">Delete</button>}
                      </>
                    )}
                    </td>
                  </tr>
                              );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
               {Object.keys(ordersBySupplier).length === 0 && (
                <div className="text-center py-10">
                  <p className="text-slate-500 dark:text-slate-400">No orders found matching your criteria.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Modal isOpen={modalState === 'create' || modalState === 'edit'} onClose={closeModal} title={modalState === 'create' ? 'Create New Order' : `Edit Order ${currentOrder?.id}`}>
          <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
            {/* Customer and Delivery Date Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative" ref={customerDropdownRef}>
                <label htmlFor="customer" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Customer</label>
                <div className="relative">
                  <input
                    type="text"
                    id="customer"
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setIsCustomerDropdownOpen(true);
                    }}
                    onFocus={() => setIsCustomerDropdownOpen(true)}
                    placeholder="Search and select customer..."
                    className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 pr-10 dark:bg-slate-700 dark:border-slate-600 dark:placeholder-slate-400 dark:text-white"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  
                  {isCustomerDropdownOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto dark:bg-slate-700 dark:border-slate-600">
                      {customers
                        .filter(customer => 
                          customer.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
                          customer.email?.toLowerCase().includes(customerSearch.toLowerCase()) ||
                          customer.phone?.toLowerCase().includes(customerSearch.toLowerCase())
                        )
                        .map(customer => (
                          <div
                            key={customer.id}
                            onClick={() => {
                              setSelectedCustomer(customer.id);
                              setCustomerSearch(customer.name);
                              setIsCustomerDropdownOpen(false);
                            }}
                            className={`p-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600 border-b border-slate-200 dark:border-slate-600 last:border-b-0 ${
                              selectedCustomer === customer.id ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                            }`}
                          >
                            <div className="font-medium text-slate-900 dark:text-white">{customer.name}</div>
                            {customer.email && (
                              <div className="text-sm text-slate-500 dark:text-slate-400">{customer.email}</div>
                            )}
                            {customer.phone && (
                              <div className="text-sm text-slate-500 dark:text-slate-400">{customer.phone}</div>
                            )}
                          </div>
                        ))
                      }
                      {customers.filter(customer => 
                        customer.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
                        customer.email?.toLowerCase().includes(customerSearch.toLowerCase()) ||
                        customer.phone?.toLowerCase().includes(customerSearch.toLowerCase())
                      ).length === 0 && (
                        <div className="p-3 text-sm text-slate-500 dark:text-slate-400 text-center">
                          No customers found
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div>
                  <label htmlFor="deliveryDate" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Expected Delivery Date</label>
                  <input
                      type="date"
                      id="deliveryDate"
                      value={expectedDeliveryDate}
                      onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                      className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:placeholder-slate-400 dark:text-white"
                  />
              </div>
            </div>
            
            {/* Products Section */}
            <div>
              <label className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Products</label>
              
              {/* Product Search Input */}
              <div className="mb-4 relative">
                <input
                  type="text"
                  placeholder="Search products by name, category, or SKU..."
                  value={productSearchTerm}
                  onChange={(e) => setProductSearchTerm(e.target.value)}
                  className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 pr-10 dark:bg-slate-700 dark:border-slate-600 dark:placeholder-slate-400 dark:text-white"
                />
                {productSearchTerm && (
                  <button
                    onClick={() => setProductSearchTerm('')}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
              
              {/* Products List */}
              <div className="space-y-3 border border-slate-200 dark:border-slate-600 rounded-lg p-3 bg-slate-50 dark:bg-slate-800">
                {availableProductsForOrder.length === 0 ? (
                  <div className="text-center py-4 text-slate-500 dark:text-slate-400">
                    {productSearchTerm.trim() ? 'No products found matching your search.' : 'No products available.'}
                  </div>
                ) : (
                  availableProductsForOrder.map(product => {
                  const isOutOfStock = getEffectiveStock(product) === 0;
                  const isHeld = heldItems.has(product.id);
                  const isUnavailable = isHeld || isOutOfStock;
                  
                  return (
                    <div key={product.id} className={`grid grid-cols-12 gap-2 items-center p-2 rounded-lg transition-colors ${isHeld ? 'bg-yellow-50 dark:bg-yellow-900/40' : 'bg-slate-50 dark:bg-slate-700'} ${isOutOfStock && !isHeld ? 'opacity-70' : ''}`}>
                      <div className="flex items-center space-x-3 col-span-12 sm:col-span-4">
                        <img src={product.imageUrl} alt={product.name} className="w-10 h-10 rounded-md" />
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">{product.name}</p>
                           <p className="text-xs text-slate-500 dark:text-slate-400">
                            {isOutOfStock ? <span className="text-red-500 font-semibold ml-1">Out of Stock</span> : (
                              currentUser?.role === UserRole.Driver 
                                ? ` Allocated: ${getEffectiveStock(product)}`
                                : ` Stock: ${getEffectiveStock(product)}`
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <label htmlFor={`price-${product.id}`} className="sr-only">Unit Price for {product.name}</label>
                        <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">{currency}</span>
                            <input
                                type="number"
                                id={`price-${product.id}`}
                                min="0"
                                step="0.01"
                                value={orderItemPrices[product.id] ?? ''}
                                placeholder={product.price.toFixed(2)}
                                onChange={(e) => handlePriceChange(product.id, parseFloat(e.target.value) || 0)}
                                className="w-full p-1.5 border border-slate-300 rounded-md dark:bg-slate-600 dark:border-slate-500 dark:text-white text-center pl-10"
                                disabled={isUnavailable}
                            />
                        </div>
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <label htmlFor={`discount-${product.id}`} className="sr-only">Discount for {product.name}</label>
                         <div className="relative">
                            <input
                                type="number"
                                id={`discount-${product.id}`}
                                min="0"
                                max="100"
                                value={orderDiscounts[product.id] || ''}
                                placeholder="0"
                                onChange={(e) => handleDiscountChange(product.id, parseInt(e.target.value, 10) || 0)}
                                className="w-full p-1.5 border border-slate-300 rounded-md dark:bg-slate-600 dark:border-slate-500 dark:text-white text-center disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:cursor-not-allowed"
                                disabled={isUnavailable}
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                         </div>
                      </div>
                       <div className="col-span-4 sm:col-span-2">
                        <label htmlFor={`quantity-${product.id}`} className="sr-only">Quantity for {product.name}</label>
                        <input
                            type="number"
                            id={`quantity-${product.id}`}
                            min="0"
                            max={isUnavailable ? undefined : getEffectiveStock(product)}
                            value={orderItems[product.id] || ''}
                            placeholder="0"
                            onChange={(e) => handleQuantityChange(product.id, parseInt(e.target.value, 10) || 0)}
                            className="w-full p-1.5 border border-slate-300 rounded-md dark:bg-slate-600 dark:border-slate-500 dark:text-white text-center"
                        />
                      </div>
                       <div className="col-span-12 sm:col-span-2">
                          <button
                            onClick={() => toggleHoldItem(product.id)}
                            className={`w-full py-1.5 text-xs font-medium rounded-md transition-colors ${isHeld ? 'bg-yellow-400 text-yellow-900 hover:bg-yellow-500' : 'bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500'}`}
                            >
                            {isHeld ? 'Unhold' : 'Hold'}
                          </button>
                      </div>
                    </div>
                  )
                }))}
              </div>
              
              {/* Order Summary */}
              <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-3">Order Summary</h4>
                <div className="text-sm space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Items (In Stock):</span>
                    <span className="font-bold text-slate-900 dark:text-white">{inStockItems}</span>
                  </div>
                  {heldItemsCount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-yellow-600 dark:text-yellow-400">Items (Held/OOS):</span>
                      <span className="font-bold text-yellow-600 dark:text-yellow-400">{heldItemsCount}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base border-t pt-2 mt-2">
                    <span className="text-slate-700 dark:text-slate-300">Total Price:</span>
                    <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(total, currency)}</span>
                  </div>
                </div>
              </div>
              
              {/* Order Notes and Payment Method */}
              <div className="space-y-4">
                <div>
                  <label htmlFor="orderNotes" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Order Notes</label>
                  <input type="text" id="orderNotes" value={orderNotes} onChange={e => setOrderNotes(e.target.value)} className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                </div>
                <div>
                  <label htmlFor="orderMethod" className="block mb-2 text-sm font-medium text-slate-900 dark:text-white">Payment Method</label>
                  <input type="text" id="orderMethod" value={orderMethod} onChange={e => setOrderMethod(e.target.value)} className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                </div>
              </div>
              
              {/* Footer Buttons */}
              <div className="flex items-center justify-between pt-6 border-t border-slate-200 dark:border-slate-600">
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  Total Items: <span className="font-medium">{inStockItems + heldItemsCount}</span>
                </div>
                <div className="flex space-x-3">
                  <button onClick={closeModal} type="button" className="text-slate-500 bg-white hover:bg-slate-100 focus:ring-4 focus:outline-none focus:ring-blue-300 rounded-lg border border-slate-200 text-sm font-medium px-5 py-2.5 hover:text-slate-900 focus:z-10 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-500 dark:hover:text-white dark:hover:bg-slate-600">
                    Cancel
                  </button>
                  <button onClick={handleSaveOrder} type="button" className="text-white bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 disabled:bg-blue-400 dark:disabled:bg-blue-800 disabled:cursor-not-allowed" disabled={(inStockItems + heldItemsCount) === 0 || !selectedCustomer}>
                    {modalState === 'create' ? 'Create Order' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Modal>

        <Modal isOpen={!!orderToDelete} onClose={closeDeleteModal} title="Confirm Deletion">
              <div className="p-6">
                  <p className="text-slate-600 dark:text-slate-300">Are you sure you want to delete order "{orderToDelete?.id}"?</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">This action cannot be undone.</p>
              </div>
              <div className="flex items-center justify-end p-6 space-x-2 border-t border-slate-200 rounded-b dark:border-slate-600">
                  <button onClick={closeDeleteModal} type="button" className="text-slate-500 bg-white hover:bg-slate-100 focus:ring-4 focus:outline-none focus:ring-blue-300 rounded-lg border border-slate-200 text-sm font-medium px-5 py-2.5 hover:text-slate-900 focus:z-10 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-500 dark:hover:text-white dark:hover:bg-slate-600">
                      Cancel
                  </button>
                  <button onClick={handleDeleteOrder} type="button" className="text-white bg-red-600 hover:bg-red-700 focus:ring-4 focus:outline-none focus:ring-red-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-red-600 dark:hover:bg-red-700">
                      Delete
                  </button>
              </div>
          </Modal>

          {viewingOrder && (() => {
              const customer = customers.find(c => c.id === viewingOrder.customerId);
              return (
                  <Modal isOpen={!!viewingOrder} onClose={closeViewModal} title={`Order Details: ${viewingOrder.id}`}>
                      <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                              <div>
                                  <p className="font-semibold text-slate-700 dark:text-slate-300">Customer:</p>
                                  <p className="text-slate-900 dark:text-white">{viewingOrder.customerName}</p>
                              </div>
                              <div>
                                  <p className="font-semibold text-slate-700 dark:text-slate-300">Location:</p>
                                  <p className="text-slate-900 dark:text-white">{customer?.location || 'N/A'}</p>
                              </div>
                <div>
                  <p className="font-semibold text-slate-700 dark:text-slate-300">Order Date:</p>
                  <p className="text-slate-900 dark:text-white">{viewingOrder.orderdate}</p>
                </div>
                              <div>
                                  <p className="font-semibold text-slate-700 dark:text-slate-300">Status:</p>
                                  <p><Badge variant={getStatusBadgeVariant(viewingOrder.status)}>{viewingOrder.status}</Badge></p>
                <div>
                  <p className="font-semibold text-slate-700 dark:text-slate-300">Assigned To:</p>
                  <p className="text-slate-900 dark:text-white">{viewingOrder.assigneduserid}</p>
                </div>
                              </div>
                          </div>
                          
                          <div className="pt-4 border-t dark:border-slate-700">
                              <h4 className="text-md font-semibold text-slate-800 dark:text-slate-200 mb-2">Financial Summary</h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <label htmlFor="chequeBalance" className="block mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">Pending Cheque</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{currency}</span>
                      <input 
                        type="number"
                        id="chequeBalance"
                        step="1"
                        min="0"
                        value={editableChequeBalance === '' ? '' : editableChequeBalance}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '') {
                            setEditableChequeBalance('');
                            setEditableCreditBalance(editableAmountPaid === '' ? '' : viewingOrder.total - (editableAmountPaid as number));
                            return;
                          }
                          const cheque = parseFloat(val) || 0;
                          setEditableChequeBalance(cheque);
                          // Auto-calculate credit balance
                          const newCredit = viewingOrder.total - (editableAmountPaid === '' ? 0 : editableAmountPaid) - cheque - (editableReturnAmount === '' ? 0 : editableReturnAmount);
                          setEditableCreditBalance(newCredit > 0 ? newCredit : 0);
                        }}
                        className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 pl-10 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                        disabled={!canEdit}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="amountPaid" className="block mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">Amount Paid</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{currency}</span>
                      <input 
                        type="number"
                        id="amountPaid"
                        step="1"
                        min="0"
                        value={editableAmountPaid === '' ? '' : editableAmountPaid}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '') {
                            setEditableAmountPaid('');
                            setEditableCreditBalance(editableChequeBalance === '' ? '' : viewingOrder.total - (editableChequeBalance as number));
                            return;
                          }
                          const paid = parseFloat(val) || 0;
                          setEditableAmountPaid(paid);
                          // Auto-calculate credit balance
                          const newCredit = viewingOrder.total - paid - (editableChequeBalance === '' ? 0 : editableChequeBalance) - (editableReturnAmount === '' ? 0 : editableReturnAmount);
                          setEditableCreditBalance(newCredit > 0 ? newCredit : 0);
                        }}
                        className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 pl-10 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                        disabled={!canEdit}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="returnAmount" className="block mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">Return Amount</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{currency}</span>
                      <input 
                        type="number"
                        id="returnAmount"
                        step="1"
                        min="0"
                        value={editableReturnAmount === undefined || editableReturnAmount === '' ? '' : editableReturnAmount}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '') {
                            setEditableReturnAmount('');
                            setEditableCreditBalance(viewingOrder.total - (editableAmountPaid === '' ? 0 : editableAmountPaid) - (editableChequeBalance === '' ? 0 : editableChequeBalance));
                            return;
                          }
                          const ret = parseFloat(val) || 0;
                          setEditableReturnAmount(ret);
                          // Auto-calculate credit balance
                          const newCredit = viewingOrder.total - (editableAmountPaid === '' ? 0 : editableAmountPaid) - (editableChequeBalance === '' ? 0 : editableChequeBalance) - ret;
                          setEditableCreditBalance(newCredit > 0 ? newCredit : 0);
                        }}
                        className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 pl-10 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                        disabled={!canEdit}
                      />
                    </div>
                  </div>
                                  <div className="sm:col-span-2">
                                      <label className="block mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">Credit Balance (Auto-calculated)</label>
                                      <div className="relative">
                                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{currency}</span>
                                          <input 
                                              type="number"
                                              step="1"
                                              min="0"
                                              value={editableCreditBalance === '' ? '' : editableCreditBalance}
                                              className="bg-gray-100 border border-slate-300 text-slate-900 text-sm rounded-lg block w-full p-2.5 pl-10 dark:bg-slate-800 dark:border-slate-600 dark:text-white cursor-not-allowed"
                                              disabled
                                              readOnly
                                          />
                                      </div>
                                  </div>
                                  <div className="sm:col-span-2 mt-2 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                                      <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Amount Paid:</span> 
                      <span className="font-medium text-green-600">{formatCurrency(editableAmountPaid, currency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Pending Cheque:</span> 
                      <span className="font-medium text-orange-600">{formatCurrency(editableChequeBalance, currency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Return Amount:</span>
                      <span className="font-medium text-blue-600">{formatCurrency(editableReturnAmount === '' ? 0 : editableReturnAmount, currency)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-base mt-1">
                      <span className="text-slate-800 dark:text-slate-200">Balance Due:</span> 
                      <span className="text-red-600">{formatCurrency(editableChequeBalance + editableCreditBalance, currency)}</span>
                    </div>
                                  </div>
                              </div>
                          </div>

                          <div className="pt-2">
                              <h4 className="text-md font-semibold text-slate-800 dark:text-slate-200 mb-2">Items Ordered</h4>
                              <div className="overflow-x-auto border rounded-lg dark:border-slate-700">
                                  <table className="min-w-full text-sm">
                                      <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-400">
                      <tr>
                        <th className="py-2 px-4 text-left">Product</th>
                        <th className="py-2 px-4 text-right">Quantity</th>
                        <th className="py-2 px-4 text-right">Unit Price</th>
                        {isManagerView && <th className="py-2 px-4 text-right">Cost Price</th>}
                        <th className="py-2 px-4 text-right">Discount</th>
                        <th className="py-2 px-4 text-right">Subtotal</th>
                        <th className="py-2 px-4 text-center">Actions</th>
                      </tr>
                                      </thead>
                                      <tbody className="text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                      {(viewingOrder.orderItems ?? []).map(item => {
                        const product = products.find(p => p.id === item.productId);
                        if (!product) return null;
                        const subtotal = (item.quantity * item.price) * (1 - (item.discount || 0) / 100);
                        const totalCostPrice = (product.costPrice || 0) * (item.quantity || 0);
                        return (
                          <tr key={item.productId}>
                            <td className="py-3 px-4">
                              <div className="flex items-center space-x-3">
                                <img src={product.imageUrl} alt={product.name} className="w-10 h-10 rounded-md object-cover" />
                                <span className="font-medium text-slate-800 dark:text-slate-200">{product.name}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right">{item.quantity}</td>
                            <td className="py-3 px-4 text-right">{formatCurrency(item.price, currency)}</td>
                            {isManagerView && (
                            <td className="py-3 px-4 text-right">{formatCurrency(totalCostPrice, currency)}</td>
                            )}
                            <td className="py-3 px-4 text-right text-green-600 dark:text-green-400">{item.discount ? `${item.discount}%` : '-'}</td>
                            <td className="py-3 px-4 text-right font-semibold text-slate-900 dark:text-white">
                              {formatCurrency(subtotal, currency)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button 
                                onClick={() => handleToggleHoldInView(item.productId, 'hold')}
                                className="px-3 py-1 text-xs font-medium rounded-md transition-colors bg-yellow-400 text-yellow-900 hover:bg-yellow-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
                              >
                                Hold
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                                      </tbody>
                                  </table>
                              </div>
                          </div>

                          {viewingOrder.backorderedItems && viewingOrder.backorderedItems.length > 0 && (
                               <div className="pt-4">
                                  <h4 className="text-md font-semibold text-yellow-600 dark:text-yellow-400 mb-2">Backordered Items</h4>
                                  <div className="overflow-x-auto border rounded-lg dark:border-slate-700">
                                      <table className="min-w-full text-sm">
                                          <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-400">
                                              <tr>
                                                  <th className="py-2 px-4 text-left">Product</th>
                                                  <th className="py-2 px-4 text-right">Quantity Held</th>
                                                  <th className="py-2 px-4 text-center">Actions</th>
                                              </tr>
                                          </thead>
                                          <tbody className="text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                                              {(viewingOrder.backorderedItems ?? []).map(item => {
                                                  const product = products.find(p => p.id === item.productId);
                                                  if (!product) return null;
                                                  return (
                                                      <tr key={item.productId}>
                                                          <td className="py-3 px-4">
                                                              <div className="flex items-center space-x-3">
                                                                  <img src={product.imageUrl} alt={product.name} className="w-10 h-10 rounded-md object-cover" />
                                                                  <span className="font-medium text-slate-800 dark:text-slate-200">{product.name}</span>
                                                              </div>
                                                          </td>
                                                          <td className="py-3 px-4 text-right font-semibold text-slate-900 dark:text-white">{item.quantity}</td>
                                                          <td className="py-3 px-4 text-center">
                                                              <button
                                                                  onClick={() => handleToggleHoldInView(item.productId, 'unhold')}
                                                                  className="px-3 py-1 text-xs font-medium rounded-md transition-colors bg-green-500 text-white hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed"
                                                                  disabled={!product || getEffectiveStock(product) === 0}
                                                                  title={!product || getEffectiveStock(product) === 0 ? 'Item is out of stock' : 'Move to current order'}
                                                              >
                                                                  Unhold
                                                              </button>
                                                          </td>
                                                      </tr>
                                                  )
                                              })}
                                          </tbody>
                                      </table>
                                  </div>
                              </div>
                          )}
                      </div>
                      <div className="flex items-center justify-between p-6 border-t border-slate-200 dark:border-slate-600">
            <div className="flex-1">
              <p className="text-sm text-slate-600 dark:text-slate-300">Grand Total: <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(viewingOrder.total, currency)}</span></p>
            </div>
                        <div className="flex flex-wrap items-center gap-2">
                           {canEdit && (
                                <button onClick={handleSaveBalances} type="button" className="text-white bg-green-600 hover:bg-green-700 focus:ring-4 focus:outline-none focus:ring-green-300 font-medium rounded-lg text-sm px-4 py-2 text-center">
                                    Save Balances
                                </button>
                           )}
                            {canPrintBill && (
                              <button 
                                  onClick={handleDownloadBill} 
                                  type="button" 
                                  className="text-white bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-4 py-2 text-center disabled:bg-blue-400 disabled:cursor-not-allowed"
                                  disabled={billLoading}
                              >
                                  {billLoading ? 'Processing...' : (viewingOrder.status === OrderStatus.Delivered ? '📄 Download Bill' : '📄 Download Bill & Confirm Sale')}
                              </button>
                            )}
                            <button onClick={closeViewModal} type="button" className="text-white bg-slate-600 hover:bg-slate-700 focus:ring-4 focus:outline-none focus:ring-slate-300 font-medium rounded-lg text-sm px-4 py-2 text-center">
                                Close
                            </button>
                        </div>
                      </div>
                  </Modal>
              )
          })()}

          {canMarkDelivered && (
            <Modal isOpen={!!orderToFinalize} onClose={() => setOrderToFinalize(null)} title="Confirm Sale & Delivery">
                <div className="p-6">
                    <p className="text-slate-600 dark:text-slate-300">This will mark the order as "Delivered", reduce product stock from inventory, and confirm the sale.</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">This action cannot be undone. Do you want to proceed?</p>
                </div>
                <div className="flex items-center justify-end p-6 space-x-2 border-t border-slate-200 rounded-b dark:border-slate-600">
                    <button onClick={() => setOrderToFinalize(null)} type="button" className="text-slate-500 bg-white hover:bg-slate-100 focus:ring-4 focus:outline-none focus:ring-blue-300 rounded-lg border border-slate-200 text-sm font-medium px-5 py-2.5 hover:text-slate-900 focus:z-10 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-500 dark:hover:text-white dark:hover:bg-slate-600">
                        Cancel
                    </button>
                    <button onClick={handleConfirmFinalize} type="button" className="text-white bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700">
                        Proceed & Print
                    </button>
                </div>
            </Modal>
          )}

          {isPrintPreviewOpen && viewingOrder && canPrintBill && (
        <Modal
          isOpen={isPrintPreviewOpen}
          onClose={() => setIsPrintPreviewOpen(false)}
          title={`Print Preview: Order ${viewingOrder.id}`}
        >
          <div id="printable-bill-content" className="bg-white">
            {viewingOrder && customers.find(c => c.id === viewingOrder.customerId) ? (
                <OrderBill
                  order={{
                    ...viewingOrder,
                    creditBalance: (typeof editableCreditBalance === 'number' ? editableCreditBalance : 0)
                  }}
                  customer={customers.find(c => c.id === viewingOrder.customerId)}
                  products={products}
                  currency={currency}
                  chequeBalance={editableChequeBalance}
                  creditBalance={editableCreditBalance}
                />
            ) : (
              <div className="p-8 text-center text-slate-500">
                பில் விவரங்கள் கிடைக்கவில்லை. தயவுசெய்து order மற்றும் customer தரவை சரிபார்க்கவும்.
              </div>
            )}
          </div>
          <div className="flex items-center justify-end p-6 space-x-2 border-t border-slate-200 rounded-b dark:border-slate-600 no-print">
            <button onClick={() => setIsPrintPreviewOpen(false)} type="button" className="text-slate-500 bg-white hover:bg-slate-100 focus:ring-4 focus:outline-none focus:ring-blue-300 rounded-lg border border-slate-200 text-sm font-medium px-5 py-2.5 hover:text-slate-900 focus:z-10 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-500 dark:hover:text-white dark:hover:bg-slate-600">
              Cancel
            </button>
            <button onClick={() => window.print()} type="button" className="text-white bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center">
              Confirm Print
            </button>
          </div>
        </Modal>
          )}
      </div>
    </>
  );
}
