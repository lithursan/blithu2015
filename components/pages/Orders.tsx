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
import { exportToPDF } from '../../utils/pdfExport';
import { emailService } from '../../utils/emailService';
import { confirmSecureDelete } from '../../utils/passwordConfirmation';
import html2pdf from "html2pdf.js";

const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount).replace('$', `${currency} `);
};

// Special formatting function for cheque and credit balances
const formatBalanceAmount = (amount: number, currency: string) => {
    if (amount === 0) {
        return `${currency} 0`;
    }
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount).replace('$', `${currency} `);
};

const format = (amount: number) => {
  return new Intl.NumberFormat('en-US', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  }).format(amount);
};

// Local date-time formatter (avoids UTC-style display when using ISO strings)
const formatDateTimeLocal = (isoOrDateStr?: string) => {
  if (!isoOrDateStr) return 'N/A';
  const d = new Date(isoOrDateStr);
  if (isNaN(d.getTime())) return isoOrDateStr; // fallback if not a valid date
  return d.toLocaleString(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
};

// Helper function to render customer location in orders table
const renderCustomerLocationInOrder = (order: Order, customers: Customer[]) => {
  const customer = customers.find(c => c.id === order.customerId);
  if (!customer || !customer.location) {
    return null;
  }

  const gpsMatch = customer.location.match(/GPS:\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
  
  if (gpsMatch) {
    const [, lat, lng] = gpsMatch;
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
    
    return (
      <a 
        href={mapsUrl} 
        target="_blank" 
        rel="noopener noreferrer"
        className="text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-200 text-xs inline-flex items-center gap-1"
        title={`Open ${customer.name}'s location in Google Maps`}
        onClick={(e) => e.stopPropagation()}
      >
        📍 Location
      </a>
    );
  }
  
  return (
    <span className="text-slate-400 dark:text-slate-500 text-xs">📍 Address</span>
  );
};

// Helper function to open customer location for an order
const openOrderLocation = (order: Order, customers: Customer[]) => {
  const customer = customers.find(c => c.id === order.customerId);
  if (!customer || !customer.location) {
    alert('No location available for this customer');
    return;
  }

  const gpsMatch = customer.location.match(/GPS:\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
  
  if (gpsMatch) {
    const [, lat, lng] = gpsMatch;
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
    window.open(mapsUrl, '_blank');
  } else {
    // If no GPS coordinates, try to open with the raw address
    const encodedAddress = encodeURIComponent(customer.location);
    const mapsUrl = `https://www.google.com/maps/search/${encodedAddress}`;
    window.open(mapsUrl, '_blank');
  }
};

// Helper function to format phone numbers nicely
const formatPhoneNumber = (phone: string) => {
  if (!phone) return '';
  
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');
  
  // Handle Sri Lankan numbers (+94)
  if (digits.startsWith('94') && digits.length === 11) {
    // Format: +94 XX XXX XXXX
    return `+94 ${digits.slice(2, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  
  // Handle local numbers (0XXXXXXXXX)
  if (digits.startsWith('0') && digits.length === 10) {
    // Format: 0XX XXX XXXX
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  
  // Handle 9-digit numbers (XXXXXXXXX) 
  if (digits.length === 9) {
    // Format: XX XXX XXXX
    return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
  }
  
  // Default: return as-is if doesn't match expected patterns
  return phone;
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
          <p className="text-sm"><strong>Date:</strong> {order.created_at ? formatDateTimeLocal(order.created_at) : order.date}</p>
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
              <th className="py-2 px-4 text-right font-semibold">Free</th>
              <th className="py-2 px-4 text-right font-semibold">Price</th>
              <th className="py-2 px-4 text-right font-semibold">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {(order.orderItems ?? []).map(item => {
              const product = findProduct(item.productId);
              if (!product) return null;
              const subtotal = item.price * item.quantity;
              return (
                <tr key={item.productId} className="border-b">
                  <td className="py-3 px-4">{product.name}</td>
                  <td className="py-3 px-4 text-right">{item.quantity}</td>
                  <td className="py-3 px-4 text-right font-bold text-green-600">{item.free || 0}</td>
                  <td className="py-3 px-4 text-right">{item.price}</td>
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
          <span className="text-sm text-gray-600">Total Items:</span>
          <span className="font-semibold text-gray-900">{order.totalItems}</span>
        </div>
        <div className="flex justify-between items-center mt-2">
          <span className="text-lg font-bold text-gray-700">Grand Total:</span>
          <span className="text-xl font-bold text-black">{formatCurrency(order.total, currency)}</span>
        </div>
        <div className="flex justify-between items-center mt-2">
          <span className="text-sm text-gray-600">Return Amount:</span>
          <span className="text-lg font-bold text-blue-600">{formatCurrency(billReturnAmount, currency)}</span>
        </div>
        <div className="flex justify-between items-center mt-2">
          <span className="text-sm text-gray-600">Amount Paid:</span>
          <span className="text-lg font-bold text-green-600">{formatCurrency(amountPaid, currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Pending Cheque:</span>
          <span className="font-medium text-yellow-600">{formatBalanceAmount(billChequeBalance, currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Credit Balance:</span>
          <span className="font-medium text-red-600">{formatBalanceAmount(billCreditBalance, currency)}</span>
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
  // ...existing code...
  const { orders, setOrders, customers, products, setProducts, users, driverAllocations, setDriverAllocations, refetchData } = useData();
  const { currentUser } = useAuth();
  const currency = currentUser?.settings.currency || 'LKR';

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [deliveryDateFilter, setDeliveryDateFilter] = useState('');
  const [dateRangeFilter, setDateRangeFilter] = useState<'today' | 'this_week' | 'this_month' | 'all'>(currentUser?.role === UserRole.Driver ? 'today' : 'all');
  
  const [modalState, setModalState] = useState<'closed' | 'create' | 'edit'>('closed');
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [customerSearch, setCustomerSearch] = useState<string>('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState<boolean>(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const [orderItems, setOrderItems] = useState<Record<string, number>>({});
  const [orderDiscounts, setOrderDiscounts] = useState<Record<string, number>>({});
  const [orderItemPrices, setOrderItemPrices] = useState<Record<string, number>>({});
  const [freeItems, setFreeItems] = useState<Record<string, number>>({});
  const [heldItems, setHeldItems] = useState<Set<string>>(new Set());
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState<string>('');
  const [deliveryAddress, setDeliveryAddress] = useState<string>('');
  const [orderToFinalize, setOrderToFinalize] = useState<Order | null>(null);
  
  // GPS Location for orders
  const [orderLocation, setOrderLocation] = useState<{latitude: number, longitude: number, accuracy?: number} | null>(null);
  const [isCapturingLocation, setIsCapturingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [editableChequeBalance, setEditableChequeBalance] = useState<number | ''>('');
  const [editableCreditBalance, setEditableCreditBalance] = useState<number | ''>('');
  const [editableAmountPaid, setEditableAmountPaid] = useState<number | ''>('');
  // Return amount for returned products (calculated)
  const [returnAmount, setReturnAmount] = useState<number>(0);
  // Editable return amount for input
  const [editableReturnAmount, setEditableReturnAmount] = useState<number | ''>('');

  // Prevent duplicate submissions when saving/creating orders
  const [isSavingOrder, setIsSavingOrder] = useState(false);

  // Load amountPaid into editableAmountPaid when viewing/editing an order
  useEffect(() => {
    if (viewingOrder) {
      setEditableAmountPaid(typeof viewingOrder.amountPaid === 'number' ? viewingOrder.amountPaid : '');
    }
  }, [viewingOrder]);

  const canEdit = useMemo(() => 
    currentUser?.role === UserRole.Admin || 
    currentUser?.role === UserRole.Manager ||
    currentUser?.role === UserRole.Driver ||
    currentUser?.role === UserRole.Sales,
    [currentUser]
  );
  
  const canDelete = useMemo(() => currentUser?.role === UserRole.Admin, [currentUser]);

  // GPS Location Capture Function
  const captureCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by this browser');
      return;
    }

    setIsCapturingLocation(true);
    setLocationError(null);

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000 // 1 minute
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        };
        setOrderLocation(location);
        setIsCapturingLocation(false);
        console.log('Order location captured:', location);
      },
      (error) => {
        console.error('Location capture error:', error);
        setLocationError(error.message);
        setIsCapturingLocation(false);
      },
      options
    );
  };

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
    currentUser?.role === UserRole.Admin || currentUser?.role === UserRole.Secretary || currentUser?.role === UserRole.Manager,
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

    // Aggregate allocations across ALL dates for this driver
    const allocationsForDriver = driverAllocations.filter(a => a.driverId === currentUser.id);
    if (allocationsForDriver.length === 0) return 0;

    const totalAllocated = allocationsForDriver.reduce((sum, alloc) => {
      const item = alloc.allocatedItems.find(i => i.productId === productId);
      if (!item) return sum;
      const sold = typeof item.sold === 'number' ? item.sold : 0;
      return sum + Math.max(0, (item.quantity || 0) - sold);
    }, 0);

    return totalAllocated;
  };

  // Helper function to get effective stock (driver allocation or warehouse stock)
  const getEffectiveStock = (product: Product): number => {
    if (currentUser?.role === UserRole.Driver) {
      return getDriverAllocatedStock(product.id);
    }
    return product.stock; // For non-drivers, show warehouse stock
  };

  // Build pending quantities map used across the order creation UI so we can show (stock - pending)
  const pendingMap = useMemo(() => {
    const map = new Map<string, number>();
    try {
      if (!orders || orders.length === 0) return map;
      const pendingOrders = orders.filter(o => (o.status || '') === OrderStatus.Pending && !(modalState === 'edit' && currentOrder && o.id === currentOrder.id));
      for (const po of pendingOrders) {
        (po.orderItems || []).forEach((it: any) => {
          if (!it || !it.productId) return;
          map.set(it.productId, (map.get(it.productId) || 0) + (Number(it.quantity) || 0));
        });
      }
    } catch (err) {
      console.error('Error building pendingMap for product display:', err);
    }
    return map;
  }, [orders, modalState, currentOrder]);

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
    
    // Filter orders based on user role
    if (currentUser?.role === UserRole.Sales) {
      // Sales rep can only see orders assigned to them
      displayOrders = displayOrders.filter(order => order.assignedUserId === currentUser.id);
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

  // Delivery date filters (available to all roles including Drivers)
  // Specific date filter
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

    // Sort orders with custom priority:
    // 1) Pending (yellow cards) at the top
    // 2) Delivered with outstanding > 0 (red cards) next
    // 3) Delivered with outstanding === 0 (green cards) next
    // 4) Other statuses after that
    // Within the same priority group, newest orders appear first
    return displayOrders.sort((a, b) => {
      const getPriority = (order: any) => {
        const status = order.status;
        const cheque = (typeof order.chequeBalance === 'number' && !isNaN(order.chequeBalance)) ? order.chequeBalance : (order.chequeBalance ?? 0) || (order.chequebalance ?? 0) || 0;
        const credit = (typeof order.creditBalance === 'number' && !isNaN(order.creditBalance)) ? order.creditBalance : (order.creditBalance ?? 0) || (order.creditbalance ?? 0) || 0;
        const outstanding = (Number(cheque) || 0) + (Number(credit) || 0);

        if (status === 'Pending') return 1; // yellow
        if (status === 'Delivered' && outstanding > 0) return 2; // red
        if (status === 'Delivered' && outstanding === 0) return 3; // green
        return 4; // other statuses
      };

      const pa = getPriority(a);
      const pb = getPriority(b);
      if (pa === pb) {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
      return pa - pb;
    });
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

  // Total Paid across currently displayed (filtered) orders
  const totalPaidAcrossDisplayedOrders = useMemo(() => {
    return filteredOrders.reduce((sum, order) => {
      try {
        const returnAmt = typeof order.returnAmount === 'number' ? order.returnAmount : 0;
        const chequeAmt = order.chequeBalance == null || isNaN(Number(order.chequeBalance)) ? 0 : Number(order.chequeBalance);
        const creditAmt = order.creditBalance == null || isNaN(Number(order.creditBalance)) ? 0 : Number(order.creditBalance);
        // fallback paid when amountPaid not stored
        const paidFallback = Math.max(0, (order.total || 0) - (chequeAmt + creditAmt + returnAmt));
        const amountPaid = order.status === OrderStatus.Pending ? 0 : ((typeof order.amountPaid === 'number' && order.amountPaid > 0) ? order.amountPaid : paidFallback);
        return sum + (Number(amountPaid) || 0);
      } catch (e) {
        return sum;
      }
    }, 0);
  }, [filteredOrders]);

  const openCreateModal = () => {
    setCurrentOrder(null);
    setSelectedCustomer('');
    setCustomerSearch('');
    setOrderItems({});
    setOrderDiscounts({});
    setFreeItems({});
    const initialPrices = products.reduce((acc, p) => {
        acc[p.id] = p.price;
        return acc;
    }, {} as Record<string, number>);
    setOrderItemPrices(initialPrices);
    setHeldItems(new Set());
    setExpectedDeliveryDate('');
    setDeliveryAddress('');
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
    const discounts = {} as Record<string, number>; // Remove discount functionality
    const frees = allItems.reduce((acc, item) => {
      if (item.free && item.free > 0) {
        acc[item.productId] = item.free;
      }
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
    setFreeItems(frees);
    setOrderItemPrices(prices);
    setHeldItems(backorderedIds);
    setExpectedDeliveryDate(order.expectedDeliveryDate || '');
    setDeliveryAddress(order.deliveryAddress || '');
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
  
  const handlePriceChange = (productId: string, price: number | string) => {
    if (price === '') {
      setOrderItemPrices(prev => ({ ...prev, [productId]: '' }));
    } else {
      const numPrice = typeof price === 'string' ? parseFloat(price) : price;
      const newPrice = Math.max(0, numPrice);
      setOrderItemPrices(prev => ({ ...prev, [productId]: newPrice }));
    }
  };

  const handleFreeQuantityChange = (productId: string, quantity: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const newQuantity = Math.max(0, quantity);
    setFreeItems(prev => ({ ...prev, [productId]: newQuantity }));
  };

  // Note: 'Hold' functionality removed from UI per request — keep heldItems state for compatibility with existing data but
  // remove the interactive toggle function so items cannot be toggled to 'held' from the product list.

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
            const customPrice = orderItemPrices[productId];
            const price = (customPrice === '' || customPrice === undefined) ? product.price : (typeof customPrice === 'number' ? customPrice : (parseFloat(customPrice) || product.price));
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
      const customPrice = orderItemPrices[productId];
      const price = (customPrice === '' || customPrice === undefined) ? (product?.price ?? 0) : (typeof customPrice === 'number' ? customPrice : (parseFloat(customPrice) || (product?.price ?? 0)));
      const freeQuantity = freeItems[productId] || 0;

      if (isHeld || isOutOfStock) {
        newBackorderedItems.push({ 
          productId, 
          quantity, 
          price,
          free: freeQuantity
        });
      } else {
         newOrderItems.push({ 
          productId, 
          quantity, 
          price: price,
          free: freeQuantity, // Include free quantity in regular order item
        });
      }
    });
  // Patch: Always assign customerId (snake_case for DB)
  // Prevent duplicate submissions
  if (isSavingOrder) {
    console.warn('Order save already in progress — ignoring duplicate submit');
    return;
  }
  setIsSavingOrder(true);
  try {
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

      // Generate unique order ID using database function (safer than client-side calculation)
      let newOrderId: string;
      try {
        const { data: idResult, error: idError } = await supabase.rpc('generate_next_order_id');
        if (idError || !idResult) {
          console.warn('Database ID generation failed, using fallback method:', idError);
          // Fallback to client-side generation with timestamp for uniqueness
          const maxIdNum = orders.reduce((max, order) => {
            const num = parseInt(order.id.replace('ORD', ''), 10);
            return num > max ? num : max;
          }, 0);
          const timestamp = Date.now().toString().slice(-3); // Last 3 digits of timestamp
          newOrderId = `ORD${(maxIdNum + 1).toString().padStart(3, '0')}_${timestamp}`;
        } else {
          newOrderId = idResult;
        }
      } catch (error) {
        console.warn('Error generating order ID:', error);
        // Ultimate fallback with UUID-like suffix
        const maxIdNum = orders.reduce((max, order) => {
          const num = parseInt(order.id.replace('ORD', ''), 10);
          return num > max ? num : max;
        }, 0);
        const randomSuffix = Math.random().toString(36).substr(2, 4).toUpperCase();
        newOrderId = `ORD${(maxIdNum + 1).toString().padStart(3, '0')}_${randomSuffix}`;
      }

      // compute cost amount from products' costPrice * qty (for inventory cost tracking)
      const costAmount = newOrderItems.reduce((sum, item) => {
        const prod = products.find(p => p.id === item.productId);
        const cp = prod && typeof prod.costPrice === 'number' ? prod.costPrice : 0;
        return sum + (cp * (item.quantity || 0));
      }, 0);

      // --- New validation: ensure (stock - pending) >= requested qty for each product ---
      // Build pending map from existing orders (exclude currentOrder when editing)
      const pendingMap = new Map<string, number>();
      try {
        const pendingOrders = orders.filter(o => (o.status || '') === OrderStatus.Pending);
        for (const po of pendingOrders) {
          // If editing, exclude the current order's items from pending totals
          if (modalState === 'edit' && currentOrder && po.id === currentOrder.id) continue;
          (po.orderItems || []).forEach((it: any) => {
            if (!it || !it.productId) return;
            pendingMap.set(it.productId, (pendingMap.get(it.productId) || 0) + (Number(it.quantity) || 0));
          });
        }
      } catch (err) {
        console.error('Error building pendingMap for order validation:', err);
      }

      const insufficient: { productId: string; name?: string; available: number; requested: number }[] = [];
      for (const it of newOrderItems) {
        const prod = products.find(p => p.id === it.productId);
        if (!prod) continue;
        const pendingQty = pendingMap.get(it.productId) || 0;
        // For drivers, effective stock is driver's allocated stock; otherwise use warehouse stock
        const baseStock = currentUser?.role === UserRole.Driver ? getEffectiveStock(prod) : (prod.stock || 0);
        const available = (baseStock || 0) - pendingQty;
        if (available < it.quantity) {
          insufficient.push({ productId: it.productId, name: prod.name, available, requested: it.quantity });
        }
      }
      if (insufficient.length > 0) {
        const msg = insufficient.map(i => `${i.name || i.productId}: available ${i.available}, requested ${i.requested}`).join('\n');
        alert('Cannot create order because some products would exceed available stock considering pending orders:\n' + msg);
        return;
      }

      const newOrder = {
        id: newOrderId,
        customerid: customer.id,
        customername: customer.name,
        assigneduserid: currentUser?.id ?? '',
        orderitems: JSON.stringify(newOrderItems),
        backordereditems: JSON.stringify(newBackorderedItems),
        method: '',
        expecteddeliverydate: expectedDeliveryDate || null,
        deliveryaddress: deliveryAddress || null,
        orderdate: expectedDeliveryDate || new Date().toISOString().slice(0, 10),
        created_at: new Date().toISOString(), // Add creation timestamp with proper timezone
        totalamount: total,
        costamount: costAmount,
        status: OrderStatus.Pending,
        notes: orderNotes || '',
        chequebalance: 0,
        creditbalance: 0,
      };
      
      // Try inserting with costamount and created_at; if the DB doesn't have the columns yet, retry without them
      let insertPayload: any = { ...newOrder };
      try {
        // Log the payload so we can inspect what is being POSTed to Supabase
        console.log('Inserting order payload to Supabase:', insertPayload);

        // Use .select('*') to get the representation back and surface more detailed errors
        const { data: insertData, error } = await supabase.from('orders').insert([insertPayload]).select('*');
        console.log('Supabase insert response:', { insertData, error });

        if (error) {
          // Provide richer debug info to the developer
          console.error('Supabase insert error details:', {
            message: error.message,
            details: (error as any).details,
            hint: (error as any).hint,
            code: (error as any).code,
          });

          const msg = (error.message || '').toLowerCase();
          if (msg.includes("could not find the 'created_at' column") || msg.includes('created_at')) {
            // Retry without created_at
            const payloadNoCreatedAt = ((({ created_at, ...rest }) => rest)(insertPayload));
            console.log('Retrying insert without created_at:', payloadNoCreatedAt);
            const { data: retryData, error: retryError } = await supabase.from('orders').insert([payloadNoCreatedAt]).select('*');
            console.log('Supabase retry response:', { retryData, retryError });
            if (retryError) {
              const retryMsg = (retryError.message || '').toLowerCase();
              if (retryMsg.includes('costamount')) {
                // Both created_at and costamount missing
                const payloadMinimal = ((({ created_at, costamount, ...rest }) => rest)(insertPayload));
                console.log('Retrying insert without created_at and costamount:', payloadMinimal);
                const { data: finalData, error: finalError } = await supabase.from('orders').insert([payloadMinimal]).select('*');
                if (finalError) {
                  alert('Error adding order - Database migration required: ' + finalError.message + '\n\nPlease run the database migration SQL.');
                  return;
                }
              } else {
                alert('Error adding order after created_at retry: ' + retryError.message + '\n\nSee console for details.');
                return;
              }
            }
          } else if (msg.includes("could not find the 'costamount' column") || msg.includes('costamount')) {
            // Retry without costamount
            const payloadNoCost = ((({ costamount, ...rest }) => rest)(insertPayload));
            console.log('Retrying insert without costamount:', payloadNoCost);
            const { data: retryData, error: retryError } = await supabase.from('orders').insert([payloadNoCost]).select('*');
            console.log('Supabase retry response:', { retryData, retryError });
            if (retryError) {
              const retryMsg = (retryError.message || '').toLowerCase();
              if (retryMsg.includes('created_at')) {
                // Both costamount and created_at missing
                const payloadMinimal = ((({ costamount, created_at, ...rest }) => rest)(insertPayload));
                console.log('Retrying insert without costamount and created_at:', payloadMinimal);
                const { data: finalData, error: finalError } = await supabase.from('orders').insert([payloadMinimal]).select('*');
                if (finalError) {
                  alert('Error adding order - Database migration required: ' + finalError.message + '\n\nPlease run the database migration SQL.');
                  return;
                }
              } else {
                alert('Error adding order after costamount retry: ' + retryError.message + '\n\nSee console for details.');
                return;
              }
            }
          } else if (msg.includes("could not find the 'deliveryaddress' column") || msg.includes('deliveryaddress')) {
            // Retry without deliveryaddress
            const payloadNoDelivery = ((({ deliveryaddress, ...rest }) => rest)(insertPayload));
            console.log('Retrying insert without deliveryaddress:', payloadNoDelivery);
            const { data: retryData, error: retryError } = await supabase.from('orders').insert([payloadNoDelivery]).select('*');
            console.log('Supabase retry response:', { retryData, retryError });
            if (retryError) {
              // Check if other columns are missing
              const retryMsg = (retryError.message || '').toLowerCase();
              if (retryMsg.includes('costamount') || retryMsg.includes('created_at')) {
                const payloadMinimal = ((({ costamount, deliveryaddress, created_at, ...rest }) => rest)(insertPayload));
                console.log('Retrying insert without costamount, deliveryaddress, and created_at:', payloadMinimal);
                const { data: finalData, error: finalError } = await supabase.from('orders').insert([payloadMinimal]).select('*');
                if (finalError) {
                  alert('Error adding order - Database migration required: ' + finalError.message + '\n\nPlease run the database migration SQL.');
                  return;
                }
              } else {
                alert('Error adding order after delivery retry: ' + retryError.message + '\n\nSee console for details.');
                return;
              }
            }
          } else {
            alert('Error adding order: ' + error.message + '\n\nSee console for details.');
            return;
          }
        }
      } catch (err) {
        console.error('Unexpected insert exception:', err);
        alert('Unexpected error adding order. Check console for details.');
        return;
      }
      
      const freshOrders = await fetchOrders();
      if (freshOrders) {
        setOrders(prev => {
          const byId = new Map<string, Order>();
          prev.forEach(o => byId.set(o.id, o));
          freshOrders.forEach(o => byId.set(o.id, o));
          return Array.from(byId.values()).sort((a, b) => new Date((b.date as string) || '').getTime() - new Date((a.date as string) || '').getTime());
        });
      }
      
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
        // Ensure the editor (current logged-in rep) becomes the assigned user when editing
        assigneduserid: currentUser?.id ?? currentOrder.assigneduserid ?? '',
        orderitems: JSON.stringify(newOrderItems),
        backordereditems: JSON.stringify(newBackorderedItems),
        method: '',
        expecteddeliverydate: expectedDeliveryDate || null,
        deliveryaddress: deliveryAddress || null,
        orderdate: expectedDeliveryDate || currentOrder.orderdate || new Date().toISOString().slice(0, 10),
        totalamount: total,
          // update costamount when editing
          costamount: newOrderItems.reduce((sum, item) => {
            const prod = products.find(p => p.id === item.productId);
            const cp = prod && typeof prod.costPrice === 'number' ? prod.costPrice : 0;
            return sum + (cp * (item.quantity || 0));
          }, 0),
        status: currentOrder.status ?? OrderStatus.Pending,
        notes: orderNotes || '',
        chequebalance: currentOrder.chequeBalance || 0,
        creditbalance: currentOrder.creditBalance || 0,
      };
      // --- Validation for edit: ensure (stock - pending) >= requested qty for each product ---
      try {
        const pendingMapEdit = new Map<string, number>();
        const pendingOrders = orders.filter(o => (o.status || '') === OrderStatus.Pending);
        for (const po of pendingOrders) {
          if (currentOrder && po.id === currentOrder.id) continue; // exclude current order
          (po.orderItems || []).forEach((it: any) => {
            if (!it || !it.productId) return;
            pendingMapEdit.set(it.productId, (pendingMapEdit.get(it.productId) || 0) + (Number(it.quantity) || 0));
          });
        }

        const insufficientEdit: { productId: string; name?: string; available: number; requested: number }[] = [];
        for (const it of newOrderItems) {
          const prod = products.find(p => p.id === it.productId);
          if (!prod) continue;
          const pendingQty = pendingMapEdit.get(it.productId) || 0;
          const baseStock = currentUser?.role === UserRole.Driver ? getEffectiveStock(prod) : (prod.stock || 0);
          const available = (baseStock || 0) - pendingQty;
          if (available < it.quantity) {
            insufficientEdit.push({ productId: it.productId, name: prod.name, available, requested: it.quantity });
          }
        }
        if (insufficientEdit.length > 0) {
          const msg = insufficientEdit.map(i => `${i.name || i.productId}: available ${i.available}, requested ${i.requested}`).join('\n');
          alert('Cannot update order because some products would exceed available stock considering pending orders:\n' + msg);
          return;
        }
      } catch (err) {
        console.error('Unexpected validation error before order update:', err);
      }
      
      try {
        // Sanitize payload: remove undefined or NaN values and ensure JSON/string types for JSON columns
        const sanitizedPayload: any = {};
        Object.entries(updatedOrder).forEach(([k, v]) => {
          if (v === undefined) return;
          if (typeof v === 'number' && isNaN(v)) return;
          // Keep nulls explicitly
          sanitizedPayload[k] = v;
        });
        // Ensure JSON fields are strings where expected by DB (orderitems/backordereditems)
        if (sanitizedPayload.orderitems && typeof sanitizedPayload.orderitems !== 'string') {
          try { sanitizedPayload.orderitems = JSON.stringify(sanitizedPayload.orderitems); } catch {};
        }
        if (sanitizedPayload.backordereditems && typeof sanitizedPayload.backordereditems !== 'string') {
          try { sanitizedPayload.backordereditems = JSON.stringify(sanitizedPayload.backordereditems); } catch {};
        }

        console.log('PATCH payload for orders.update:', sanitizedPayload);
        const { error } = await supabase.from('orders').update(sanitizedPayload).eq('id', currentOrder.id);
        if (error) {
          const msg = (error.message || '').toLowerCase();
          if (msg.includes("could not find the 'costamount' column") || msg.includes('costamount')) {
            // Retry without costamount
            const { error: retryError } = await supabase.from('orders').update(((({ costamount, ...rest }) => rest)(updatedOrder))).eq('id', currentOrder.id);
            if (retryError) {
              alert('Error updating order after retry: ' + retryError.message);
              return;
            }
          } else if (msg.includes("could not find the 'deliveryaddress' column") || msg.includes('deliveryaddress')) {
            // Retry without deliveryaddress
            const { error: retryError } = await supabase.from('orders').update(((({ deliveryaddress, ...rest }) => rest)(updatedOrder))).eq('id', currentOrder.id);
            if (retryError) {
              const retryMsg = (retryError.message || '').toLowerCase();
              if (retryMsg.includes('costamount')) {
                // Both columns missing - retry without both
                const { error: finalError } = await supabase.from('orders').update(((({ costamount, deliveryaddress, ...rest }) => rest)(updatedOrder))).eq('id', currentOrder.id);
                if (finalError) {
                  alert('Error updating order - Database migration required: ' + finalError.message);
                  return;
                }
              } else {
                alert('Error updating order after delivery retry: ' + retryError.message);
                return;
              }
            }
          } else {
            alert('Error updating order: ' + error.message);
            return;
          }
        }
      } catch (err) {
        console.error('Unexpected update error:', err);
        alert('Unexpected error updating order. Check console for details.');
        return;
      }
      
      const freshOrders = await fetchOrders();
      if (freshOrders) {
        setOrders(prev => {
          const byId = new Map<string, Order>();
          prev.forEach(o => byId.set(o.id, o));
          freshOrders.forEach(o => byId.set(o.id, o));
          return Array.from(byId.values()).sort((a, b) => new Date((b.date as string) || '').getTime() - new Date((a.date as string) || '').getTime());
        });
      }
      // Ensure all pages and context pick up the latest DB state (deliveries, allocations, etc.)
      try {
        await refetchData();
      } catch (e) {
        console.warn('Failed to refetch global data after order update:', e);
      }
      alert('Order updated successfully!');
    } catch (error) {
      console.error('Unexpected error updating order:', error);
      alert('An unexpected error occurred. Please try again.');
      return;
    }
  }
  } finally {
    setIsSavingOrder(false);
  }
  closeModal();
};
  
  const handleDeleteOrder = async () => {
    if (!orderToDelete || !currentUser?.email) return;
    
    // Require password confirmation for delete
    const confirmed = await confirmSecureDelete(
      orderToDelete.id, 
      'Order', 
      currentUser.email
    );
    
    if (!confirmed) {
      closeDeleteModal();
      return;
    }
    
    try {
      const { error } = await supabase.from('orders').delete().eq('id', orderToDelete.id);
      if (error) {
        alert('Error deleting order: ' + error.message);
        return;
      }
      
      const freshOrders = await fetchOrders();
      if (freshOrders) {
        setOrders(prev => {
          const byId = new Map<string, Order>();
          prev.forEach(o => byId.set(o.id, o));
          freshOrders.forEach(o => byId.set(o.id, o));
          return Array.from(byId.values()).sort((a, b) => new Date((b.date as string) || '').getTime() - new Date((a.date as string) || '').getTime());
        });
      }
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

  // 'Hold/Unhold in view' removed: this function previously moved items between orderItems and backorderedItems.
  // The interactive controls were removed from the UI; backordered state continues to be derived from DB and stock levels.

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
          setOrders(prev => {
            const byId = new Map<string, Order>();
            prev.forEach(o => byId.set(o.id, o));
            mappedOrders.forEach((o: Order) => byId.set(o.id, o));
            return Array.from(byId.values()).sort((a, b) => new Date((b.date as string) || '').getTime() - new Date((a.date as string) || '').getTime());
          });
          setViewingOrder(updatedOrder);
          // Also refetch global data so admin deliveries and driver allocations reflect the change
          try {
            await refetchData();
          } catch (e) {
            console.warn('Failed to refetch global data after saving balances:', e);
          }
          alert('Balances updated and saved!');
        } else {
          alert('Balances saved, but failed to refresh orders.');
        }
      } else {
        alert('Failed to save balances: ' + error.message);
      }
    });
  };



  const handleConfirmFinalize = async (orderToProcess?: Order): Promise<boolean> => {
  const targetOrder = orderToProcess || orderToFinalize;
  if (!targetOrder) return false;
  // Prevent double delivery logic
  if (targetOrder.status === OrderStatus.Delivered) {
    // Already delivered, skip all allocation/stock logic
    return true;
  }
  // Integrity check
  if (!targetOrder || !targetOrder.orderItems || targetOrder.orderItems.length === 0) {
    alert("Cannot finalize an order with no items.");
    if (!orderToProcess) setOrderToFinalize(null);
    return false;
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
    return false; // Abort the finalization
  }
  // --- Update order as Delivered, and set sold qty if the column exists ---
  const soldQty = targetOrder.orderItems.reduce((sum, i) => sum + i.quantity, 0);
  try {
    const { error } = await supabase
      .from('orders')
      .update({ status: OrderStatus.Delivered, sold: soldQty })
      .eq('id', targetOrder.id);
    if (error) {
      const msg = String(error.message || '').toLowerCase();
      const code = String((error as any).code || '').toLowerCase();
      // Fallback when 'sold' column doesn't exist
      if (msg.includes('sold') || code === '42703') {
        await supabase.from('orders').update({ status: OrderStatus.Delivered }).eq('id', targetOrder.id);
        console.warn('Orders: "sold" column not found, updated status only.');
      } else {
        console.error('Error updating Delivered status with sold:', error);
      }
    }
  } catch (e) {
    console.error('Unexpected error setting Delivered status:', e);
  }
  // Refetch all data to sync UI everywhere
  await refetchData();
    // --- Sync allocation salesTotal and update allocatedItems after delivery ---
    // If the order is assigned to a driver, or the current user is the driver, sync delivered items
    const deliveryAssigneeIsDriver = (targetOrder.assignedUserId && users && users.length > 0)
      ? users.find(u => u.id === targetOrder.assignedUserId)?.role === UserRole.Driver
      : false;

    if ((currentUser?.role === UserRole.Driver || deliveryAssigneeIsDriver) && driverAllocations.length > 0) {
      // Distribute delivered items across ALL allocations for the relevant driver (oldest first)
      const driverIdToUse = currentUser?.role === UserRole.Driver ? currentUser.id : targetOrder.assignedUserId;
      const allocationsForDriver = driverAllocations
        .filter((a: any) => a.driverId === driverIdToUse)
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

      if (allocationsForDriver.length > 0) {
        // Build remaining to deduct per product
        const toDeduct: Record<string, number> = {};
        for (const di of targetOrder.orderItems) {
          toDeduct[di.productId] = (toDeduct[di.productId] || 0) + di.quantity;
        }

        const updatedAllocs: typeof allocationsForDriver = allocationsForDriver.map(a => ({ ...a, allocatedItems: a.allocatedItems.map(it => ({...it})) }));

        for (const alloc of updatedAllocs) {
          for (const item of alloc.allocatedItems) {
            const need = toDeduct[item.productId] || 0;
            if (need <= 0) continue;
            const sold = typeof item.sold === 'number' ? item.sold : 0;
            const available = Math.max(0, (item.quantity || 0) - sold);
            if (available <= 0) continue;
            const useQty = Math.min(available, need);
            // Increase sold on this allocation
            item.sold = sold + useQty;
            toDeduct[item.productId] = need - useQty;
          }
        }

        // Persist updates for allocations that changed
        for (const alloc of updatedAllocs) {
          const original = allocationsForDriver.find(a => a.id === alloc.id);
          // Compare sold values to detect change
          const changed = (alloc.allocatedItems || []).some((it, idx) => {
            const prev = original?.allocatedItems?.[idx];
            // If product order differs, fall back to stringify compare
            if (!prev || prev.productId !== it.productId) {
              return JSON.stringify(original?.allocatedItems || []) !== JSON.stringify(alloc.allocatedItems || []);
            }
            return (prev.sold || 0) !== (it.sold || 0);
          });
          if (!changed) continue;

          // Recompute sales_total based on sold * price for this allocation
          let allocSalesTotal = 0;
          for (const it of alloc.allocatedItems) {
            const product = products.find(p => p.id === it.productId);
            const sold = typeof it.sold === 'number' ? it.sold : 0;
            if (product && sold > 0) {
              allocSalesTotal += sold * (product.price || 0);
            }
          }

          await supabase.from('driver_allocations')
            .update({
              allocated_items: JSON.stringify(alloc.allocatedItems),
              sales_total: allocSalesTotal,
              status: 'Delivered'
            })
            .eq('id', alloc.id);
        }

        // Update local state
        setDriverAllocations(prev => prev.map(a => {
          const updated = updatedAllocs.find(u => u.id === a.id);
          if (!updated) return a;
          let allocSalesTotal = 0;
          for (const it of updated.allocatedItems) {
            const product = products.find(p => p.id === it.productId);
            const sold = typeof it.sold === 'number' ? it.sold : 0;
            if (product && sold > 0) allocSalesTotal += sold * (product.price || 0);
          }
          return { ...a, allocatedItems: updated.allocatedItems, salesTotal: allocSalesTotal, status: 'Delivered' } as any;
        }));
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
    return true;
  }
  
  const [billLoading, setBillLoading] = useState(false);

  // Helper: ensure we have the customer record for a given order.
  // Tries in-memory first, then falls back to fetching from Supabase by id.
  const ensureCustomerById = async (customerId: string): Promise<Customer | null> => {
    let customer = customers.find(c => c.id === customerId);
    if (customer) return customer;

    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .maybeSingle();

      if (error) {
        console.error('Failed to fetch customer for bill:', error);
        return null;
      }

      if (!data) {
        // No row found for this customer id
        return null;
      }

      // Optionally, we could push this into context cache, but keep it local to avoid side-effects
      return (data as unknown) as Customer;
    } catch (e) {
      console.error('Unexpected error fetching customer for bill:', e);
      return null;
    }
  };

  const handleDownloadBill = async () => {
    if (billLoading) return; // Prevent double click
    setBillLoading(true);
    if (!viewingOrder) {
      setBillLoading(false);
      return;
    }
    let customer = await ensureCustomerById(viewingOrder.customerId);
    if (!customer) {
      console.warn('Customer not found by id. Falling back to order.customerName for bill rendering.');
      // Proceed with a minimal customer object so bill can still be printed
      customer = {
        id: viewingOrder.customerId,
        name: viewingOrder.customerName || 'Unknown Customer',
        email: '',
        phone: '',
        location: '',
        route: 'Unassigned',
        joinDate: '',
        totalSpent: 0,
        outstandingBalance: 0,
        avatarUrl: ''
      } as unknown as Customer;
    }

    // Only on first delivery (not already delivered)
    if (viewingOrder.status !== OrderStatus.Delivered && canMarkDelivered) {
      if (!confirm('This will mark the order as delivered and reduce stock. Continue?')) {
        setBillLoading(false);
        return;
      }
      try {
        const success = await handleConfirmFinalize(viewingOrder); // This will update status to Delivered and reduce stock/allocation
        if (!success) {
          // Stock validation failed, don't print bill and keep status as pending
          setBillLoading(false);
          return;
        }
        // Update viewingOrder status in UI immediately for live sync
        if (setViewingOrder) setViewingOrder({ ...viewingOrder, status: OrderStatus.Delivered });
        // Also update the order in the orders list if present
        setOrders(prev => prev.map(o => o.id === viewingOrder.id ? { ...o, status: OrderStatus.Delivered } : o));
        await refetchData();
        setTimeout(() => {
          generateAndDownloadBill(viewingOrder.status, customer);
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
      generateAndDownloadBill(viewingOrder.status, customer);
      setBillLoading(false);
    }
  };

  // Download bill directly from order card (does not rely on viewingOrder state)
  const handleCardDownloadBill = async (order: Order) => {
    if (billLoading) return;
    setBillLoading(true);
    try {
      let customer = await ensureCustomerById(order.customerId);
      if (!customer) {
        customer = {
          id: order.customerId,
          name: order.customerName || 'Unknown Customer',
          email: '', phone: '', location: '', route: 'Unassigned', joinDate: '', totalSpent: 0, outstandingBalance: 0, avatarUrl: ''
        } as unknown as Customer;
      }

      // If order not delivered and the user can mark delivered, perform finalize flow
      if (order.status !== OrderStatus.Delivered && canMarkDelivered) {
        if (!confirm('This will mark the order as delivered and reduce stock. Continue?')) {
          setBillLoading(false);
          return;
        }
        const success = await handleConfirmFinalize(order);
        if (!success) {
          setBillLoading(false);
          return;
        }
        // Update orders state to mark delivered for immediate UX
        setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: OrderStatus.Delivered } : o));
        await refetchData();
        // generate using latest order object (status updated)
        generateAndDownloadBill(OrderStatus.Delivered, customer);
        setBillLoading(false);
        return;
      }

      // Already delivered: just generate and download
      // Temporarily set viewingOrder so generateAndDownloadBill has the same context (it reads viewingOrder internally)
      setViewingOrder(order);
      // small delay to ensure viewingOrder is set (not strictly necessary but keeps behaviour consistent)
      setTimeout(() => {
        generateAndDownloadBill(order.status, customer);
        setBillLoading(false);
      }, 250);
    } catch (err) {
      console.error('Error downloading bill from card:', err);
      setBillLoading(false);
    }
  };


  const generateAndDownloadBill = (status, resolvedCustomer?: Customer) => {
    if (!viewingOrder) return;
    const customer = resolvedCustomer ?? customers.find(c => c.id === viewingOrder.customerId);
    if (!customer) return;

    // Generate the bill HTML as before
    const displayDate = viewingOrder.created_at ? formatDateTimeLocal(viewingOrder.created_at) : viewingOrder.date;
    const billHTML = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Invoice - Order ${viewingOrder.id}</title>
          <style>
          body {
            font-family: Arial, sans-serif;
            margin: 5px;
            color: #333;
            width: 58mm; /* 👈 fit thermal width */
          }
          .header {
            border-bottom: 1px dashed #000;
            padding-bottom: 5px;
            margin-bottom: 8px;
          }
          .company-info h1 {
            margin: 0;
            font-size: 16px;
            text-align: center;
            font-weight: bold;
          }
          .company-info p {
            margin: 2px 0;
            font-size: 12px;
            text-align: center;
            font-weight: bold;
          }
          .invoice-info {
            text-align: left;
            font-size: 12px;
            margin-top: 4px;
            font-weight: bold;
          }
          .billTo {
            font-size: 14px;
            font-weight: bold;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
            font-weight: bold;
          }
          th, td {
            padding: 4px 0;
            border-bottom: 1px dashed #ccc;
          }
          th {
            text-align: left;
          }
          td.text-right {
            text-align: right;
          }
          .total-section {
            border-top: 1px dashed #000;
            margin-top: 6px;
            padding-top: 4px;
            font-size: 12px;
            font-weight: bold;
          }
          /* Make labels slightly muted and numeric totals darker for better print contrast */
          .total-section div span:first-child { color: #444; }
          .total-section div span:last-child { color: #000; font-weight: 700; }
          .total-section div {
            display: flex;
            justify-content: space-between;
            margin: 2px 0;
          }
          .grand-total {
            font-size: 13px;
            font-weight: bold;
            border-top: 1px solid #000;
            margin-top: 5px;
            padding-top: 5px;
            color: #000;
          }
          .thank-you {
            text-align: center;
            font-size: 11px;
            margin-top: 6px;
            margin-bottom: 10px;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-info">
            <h1>${COMPANY_DETAILS.name}</h1>
            <p>A9 Road, Kanthaswamy Kovil, Kilinochchi,</p>
            <p>Sri Lanka.</p>
            <p>${COMPANY_DETAILS.email}</p>
            <p>${COMPANY_DETAILS.phone}</p>
          </div>
          <div class="invoice-info">
            <p><strong>Order ID:</strong> ${viewingOrder.id}</p>
            <p><strong>Date:</strong> ${displayDate}</p>
            <p><strong>Status:</strong> ${viewingOrder.status}</p>
          </div>
        </div>

        <p class="billTo"><strong>Bill To:</strong> ${customer.name}</p>

        <table>
          <thead>
            <tr>
              <th style="width: 40%">Product</th>
              <th class="text-right">Qty</th>
              <th class="text-right">Price</th>
              <th class="text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${(viewingOrder.orderItems ?? []).map(item => {
              const product = products.find(p => p.id === item.productId);
              const subtotal = item.price * item.quantity;
              return `
                <tr>
                  <td>${product?.name || 'Unknown'}</td>
                  <td class="text-right">${item.quantity}</td>
                  <td class="text-right">${format(item.price)}</td>
                  <td class="text-right">${format(subtotal)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <div class="total-section">
          <div><span>Invoice Total:</span><span>${formatCurrency(viewingOrder.total || 0, currency)}</span></div>
          <div><span>Total Items:</span><span>${viewingOrder.orderItems?.reduce((sum, item) => sum + item.quantity, 0) ?? 0}</span></div>
          <!-- dotted full-width line for handwriting (no label) -->
          <div style="margin:6px 0; border-bottom: 1px dotted #000; height:10px;"></div>
          <div><span>Return Amount:</span><span>${formatCurrency(viewingOrder.returnAmount || 0, currency)}</span></div>
          <div><span>Paid:</span><span>${formatCurrency(editableAmountPaid, currency)}</span></div>
          <div><span>Cheque:</span><span>${formatBalanceAmount(editableChequeBalance, currency)}</span></div>
          <div><span>Credit:</span><span>${formatBalanceAmount(editableCreditBalance, currency)}</span></div>
          <br/>
          <div class="grand-total"><span>Balance Due:</span><span>${formatBalanceAmount(editableChequeBalance + editableCreditBalance, currency)}</span></div>
        </div>

        <div class="thank-you">
          <p>Thank you for your business!</p>
        </div>

        <div style="margin-top: 50px; text-align: right;">
          <div style="border-top: 1px solid #000; width: 200px; margin-left: auto;"></div>
          <p style="margin-bottom: 6px; font-size: 12px;font-weight: bold;">Customer Signature</p>
        </div>
      </body>
    </html>
  `;
 
    const options = {
      margin: 1,
      filename: `Invoice-${viewingOrder.id}.pdf`,
      image: { type: "jpeg" as const, quality: 1 },
      html2canvas: { scale: 2 },
      // Cast format to a fixed tuple to satisfy TypeScript definitions
      jsPDF: { unit: "mm", format: [80, 200] as [number, number], orientation: "portrait" as const }
    };

    html2pdf().set(options).from(billHTML).save();
  };

  // PDF Export function
  const exportOrdersPDF = () => {
    const columns = [
      { key: 'id', title: 'Order ID' },
      { key: 'customerName', title: 'Customer' },
      { key: 'items', title: 'Items' },
      { key: 'total', title: 'Total' },
      { key: 'status', title: 'Status' },
      { key: 'assignedTo', title: 'Assigned To' },
      { key: 'deliveryDate', title: 'Delivery Date' },
      { key: 'createdAt', title: 'Order Date' }
    ];

    const data = filteredOrders.map(order => {
      const customer = customers.find(c => c.id === order.customerId);
      const assignedUser = order.assignedUserId ? users?.find(u => u.id === order.assignedUserId) : null;
      const orderTotal = order.orderItems.reduce((sum, item) => {
        const product = products.find(p => p.id === item.productId);
        return sum + (item.quantity * (product?.price || 0));
      }, 0);

      const itemsList = order.orderItems.map(item => {
        const product = products.find(p => p.id === item.productId);
        return `${product?.name || 'Unknown'} (${item.quantity})`;
      }).join(', ');

      // Helper function to safely format dates
      const formatDate = (dateValue: any) => {
        if (!dateValue) return 'Not set';
        try {
          const date = new Date(dateValue);
          if (isNaN(date.getTime())) return 'Invalid Date';
          return date.toLocaleDateString('en-GB');
        } catch (error) {
          return 'Invalid Date';
        }
      };

      return {
        id: order.id,
        customerName: customer?.name || 'Unknown Customer',
        items: itemsList,
        total: `${currency} ${orderTotal.toFixed(2)}`,
        status: order.status,
        assignedTo: assignedUser?.name || 'Unassigned',
        deliveryDate: formatDate(order.expectedDeliveryDate || order.date),
        createdAt: formatDate(order.created_at || order.date)
      };
    });

    exportToPDF('Orders Report', columns, data);
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

      <div className="p-3 sm:p-4 lg:p-6 space-y-6 sm:space-y-8 no-print">
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-0 sm:justify-between sm:items-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100">Orders</h1>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            {/* Export Buttons */}
            <button
              onClick={exportOrdersPDF}
              className="px-3 sm:px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-xs sm:text-sm font-medium"
              title="Export as PDF"
            >
              <span className="hidden sm:inline">📄 PDF</span>
              <span className="sm:hidden">PDF</span>
            </button>
            <button
              onClick={() => exportOrders(filteredOrders, 'csv')}
              className="px-3 sm:px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-xs sm:text-sm font-medium"
              title="Export as CSV"
            >
              <span className="hidden sm:inline">📊 CSV</span>
              <span className="sm:hidden">CSV</span>
            </button>
            <button
              onClick={() => exportOrders(filteredOrders, 'xlsx')}
              className="px-3 sm:px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-xs sm:text-sm font-medium"
              title="Export as Excel"
            >
              <span className="hidden sm:inline">📋 Excel</span>
              <span className="sm:hidden">Excel</span>
            </button>
            {canEdit && (
              <button
                onClick={openCreateModal}
                className="px-4 sm:px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm sm:text-base font-medium"
              >
                <span className="hidden sm:inline">+ New Order</span>
                <span className="sm:hidden">+ Order</span>
              </button>
            )}
            {/* Driver-only: show Total Paid across displayed orders */}
            {currentUser?.role === UserRole.Driver && (
              <div className="flex items-center px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <span className="mr-2 text-xs text-slate-500">Total Paid</span>
                <span>{formatCurrency(totalPaidAcrossDisplayedOrders, currency)}</span>
              </div>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{isManagerView ? 'Order History' : 'My Orders'}</CardTitle>
            <CardDescription>
                {isManagerView ? 'View and manage all customer orders.' : 'View and manage orders assigned to you.'}
            </CardDescription>
            <div className="pt-4 space-y-4">
              {/* Search - Full width on mobile */}
              <div>
                <input
                  type="text"
                  placeholder="Search by Order ID or Customer..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-sm sm:text-base border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              {/* Filter dropdowns - responsive grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Status</label>
                  <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as OrderStatus | 'all')}
                      className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-sm sm:text-base border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                      <option value="all">All Statuses</option>
                      <option value={OrderStatus.Pending}>Pending</option>
                      <option value={OrderStatus.Delivered}>Delivered</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Time Range</label>
                  <select
                      value={dateRangeFilter}
                      onChange={(e) => {
                          setDateRangeFilter(e.target.value as 'today' | 'this_week' | 'this_month' | 'all');
                          setDeliveryDateFilter(''); // Clear specific date when range is selected
                      }}
                      className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-sm sm:text-base border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                      <option value="all">All Delivery Dates</option>
                      <option value="today">Today's Deliveries</option>
                      <option value="this_week">This Week</option>
                      <option value="this_month">This Month</option>
                  </select>
                </div>
                
              </div>
            </div>
            
              <div className="pt-3 flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-end">
                <div className="flex-1 max-w-xs">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Specific Date</label>
                  <input
                      type="date"
                      value={deliveryDateFilter}
                      onChange={(e) => {
                          setDeliveryDateFilter(e.target.value);
                          setDateRangeFilter('all'); // Clear range when specific date is selected
                      }}
                      className="w-full px-3 sm:px-4 py-2.5 sm:py-2 text-sm sm:text-base border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      title="Filter by specific delivery date"
                  />
                </div>
                
                <div className="flex gap-2 sm:gap-3">
                  {(deliveryDateFilter || dateRangeFilter !== 'all') && (
                      <button
                          onClick={() => {
                              setDeliveryDateFilter('');
                              setDateRangeFilter('all');
                          }}
                          className="px-3 sm:px-4 py-2.5 sm:py-2 text-sm font-medium bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 rounded-lg transition-colors"
                          title="Clear date filters"
                      >
                          <span className="hidden sm:inline">Clear Filters</span>
                          <span className="sm:hidden">Clear</span>
                      </button>
                  )}
                </div>
              </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {Object.entries(ordersBySupplier).map(([supplierName, supplierOrders]) => {
                const ordersList = (supplierOrders ?? []) as Order[];
                return (
                  <div key={supplierName}>
                    <div className="flex items-center space-x-3 mb-6">
                      <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-300">{supplierName}</h2>
                      <Badge variant="default">{ordersList.length} {ordersList.length === 1 ? 'Order' : 'Orders'}</Badge>
                    </div>
                    
                    {/* Compact card-based layout */}
                    <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                      {ordersList.map((order, orderIndex) => {
                        const assignedUser = users.find(u => u.id === order.assignedUserId);
                        const outstandingAmount = ((typeof order.chequeBalance === 'number' && !isNaN(order.chequeBalance) ? order.chequeBalance : 0) + (typeof order.creditBalance === 'number' && !isNaN(order.creditBalance) ? order.creditBalance : 0));
                        
                        // Enhanced colorful card styling based on status and outstanding amount
                        const getCardStyle = () => {
                          if (order.status === 'Pending') {
                            return {
                              border: 'bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:from-amber-900/30 dark:via-orange-900/30 dark:to-yellow-900/30 border-l-4 border-amber-500 shadow-lg shadow-amber-100/50 dark:shadow-amber-900/20',
                              text: 'text-amber-800 dark:text-amber-300',
                              badge: 'bg-gradient-to-r from-amber-100 to-orange-100 text-amber-800 border border-amber-300 dark:from-amber-900/40 dark:to-orange-900/40 dark:text-amber-300 dark:border-amber-600 shadow-sm'
                            };
                          } else if (order.status === 'Delivered') {
                            if (outstandingAmount === 0) {
                              return {
                                border: 'bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 dark:from-emerald-900/30 dark:via-green-900/30 dark:to-teal-900/30 border-l-4 border-emerald-500 shadow-lg shadow-emerald-100/50 dark:shadow-emerald-900/20',
                                text: 'text-emerald-800 dark:text-emerald-300',
                                badge: 'bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-800 border border-emerald-300 dark:from-emerald-900/40 dark:to-green-900/40 dark:text-emerald-300 dark:border-emerald-600 shadow-sm'
                              };
                            } else {
                              return {
                                border: 'bg-gradient-to-br from-rose-50 via-red-50 to-pink-50 dark:from-rose-900/30 dark:via-red-900/30 dark:to-pink-900/30 border-l-4 border-rose-500 shadow-lg shadow-rose-100/50 dark:shadow-rose-900/20',
                                text: 'text-rose-800 dark:text-rose-300',
                                badge: 'bg-gradient-to-r from-rose-100 to-red-100 text-rose-800 border border-rose-300 dark:from-rose-900/40 dark:to-red-900/40 dark:text-rose-300 dark:border-rose-600 shadow-sm'
                              };
                            }
                          }
                          return {
                            border: 'bg-gradient-to-br from-slate-50 via-gray-50 to-zinc-50 dark:from-slate-900/30 dark:via-gray-900/30 dark:to-zinc-900/30 border-l-4 border-slate-400 shadow-lg shadow-slate-100/50 dark:shadow-slate-900/20',
                            text: 'text-slate-800 dark:text-slate-200',
                            badge: 'bg-gradient-to-r from-slate-100 to-gray-100 text-slate-800 border border-slate-300 dark:from-slate-900/40 dark:to-gray-900/40 dark:text-slate-300 dark:border-slate-600 shadow-sm'
                          };
                        };
                        
                        const cardStyle = getCardStyle();
                        
                        return (
                          <Card key={order.id} className={`${cardStyle.border} hover:shadow-xl hover:-translate-y-1 hover:scale-[1.02] transition-all duration-300 cursor-pointer border-0 overflow-hidden relative`}>
                            <div className="absolute inset-0 bg-gradient-to-br from-white/60 via-transparent to-transparent dark:from-black/20 dark:via-transparent dark:to-transparent pointer-events-none"></div>
                            <CardContent className="p-3 relative z-10">
                              {/* Order Header */}
                              <div className="flex justify-between items-start mb-2">
                                <div className="flex-1 min-w-0">
                                  <h3 className={`font-bold text-sm ${cardStyle.text} drop-shadow-sm`}>{order.id}</h3>
                                  <p className={`text-xs flex items-center gap-1 mt-0.5 font-semibold ${cardStyle.text.replace('800', '700').replace('300', '400')}`}>
                                    <span className="font-bold truncate">{order.customerName}</span>
                                  </p>
                                  {(() => {
                                    const customer = customers.find(c => c.id === order.customerId);
                                    if (customer?.phone) {
                                      return (
                                        <a 
                                          href={`tel:${customer.phone}`}
                                          className="inline-flex items-center gap-1 px-2 py-1 mt-0.5 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 rounded transition-colors cursor-pointer"
                                          title={`Call ${customer.name}`}
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          📞 {formatPhoneNumber(customer.phone)}
                                        </a>
                                      );
                                    }
                                    return null;
                                  })()}
                                  {(() => {
                                    const customer = customers.find(c => c.id === order.customerId);
                                    if (customer?.route) {
                                      return (
                                        <div className="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1 mt-0.5">
                                          <span>🚛</span>
                                          <span className="font-medium">Route: {customer.route}</span>
                                        </div>
                                      );
                                    }
                                    return null;
                                  })()}
                                </div>
                                <Badge variant={getStatusBadgeVariant(order.status)} className={`${cardStyle.badge} text-xs font-bold whitespace-nowrap drop-shadow-sm flex-shrink-0`}>
                                  {order.status}
                                </Badge>
                              </div>
                              
                              {/* Order Details */}
                              <div className="space-y-1.5">
                                {/* Date */}
                                <div className="text-xs text-slate-600 dark:text-slate-400">
                                  {order.date
                                    ? (() => {
                                        const d = new Date(order.date);
                                        return isNaN(d.getTime())
                                          ? order.date
                                          : d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
                                      })()
                                    : 'N/A'
                                  }
                                </div>

                                {/* Total Amount */}
                                <div className={`text-lg font-bold drop-shadow-sm ${cardStyle.text}`}>
                                  {formatCurrency(order.total, currency)}
                                </div>
                                
                                {/* Outstanding Amount - Always show */}
                                <div className={`text-sm font-bold ${cardStyle.text} drop-shadow-sm`}>
                                  Outstanding: {formatCurrency(outstandingAmount, currency)}
                                </div>

                                {/* Return Amount and Amount Paid (show on card) */}
                                {(() => {
                                  const returnAmt = typeof order.returnAmount === 'number' ? order.returnAmount : 0;
                                  const chequeAmt = order.chequeBalance == null || isNaN(Number(order.chequeBalance)) ? 0 : Number(order.chequeBalance);
                                  const creditAmt = order.creditBalance == null || isNaN(Number(order.creditBalance)) ? 0 : Number(order.creditBalance);
                                  // For pending orders, show paid as 0 per requirement
                                  const paidFallback = Math.max(0, (order.total || 0) - (chequeAmt + creditAmt + returnAmt));
                                  const amountPaid = order.status === OrderStatus.Pending
                                    ? 0
                                    : ((typeof order.amountPaid === 'number' && order.amountPaid > 0) ? order.amountPaid : paidFallback);

                                  const reconciliationTotal = returnAmt + amountPaid + chequeAmt + creditAmt;
                                  const diff = Math.round(((order.total || 0) - reconciliationTotal) * 100) / 100;

                                  return (
                                    <>
                                      <div className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                                        Return: {formatCurrency(returnAmt, currency)}
                                      </div>
                                      <div className="text-sm text-green-600 dark:text-green-400 font-medium">
                                        Paid: {formatCurrency(amountPaid, currency)}
                                      </div>
                                      {/* Reconciliation hint for Delivered orders */}
                                      {order.status === OrderStatus.Delivered && (
                                        <div className="text-xs text-slate-400 mt-1">
                                          Total = Return + Paid + Cheque + Credit = {formatCurrency(reconciliationTotal, currency)}
                                          {Math.abs(diff) > 0.005 && (
                                            <span className="ml-2 text-xs text-red-500">(Diff: {formatCurrency(diff, currency)})</span>
                                          )}
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                                
                                {/* Items Count */}
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                  {(order.orderItems || []).length} items
                                </div>
                                
                                {/* Expected Delivery Date - Only if different from order date */}
                                {order.expectedDeliveryDate && order.expectedDeliveryDate !== order.date && (
                                  <div className="text-xs text-blue-600 dark:text-blue-400">
                                    Expected: {new Date(order.expectedDeliveryDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })}
                                  </div>
                                )}
                                
                                {/* Assigned User - Only show if exists and not empty */}
                                {assignedUser && assignedUser.name && (
                                  <div className="text-xs text-slate-500 dark:text-slate-400">
                                    {assignedUser.name}
                                  </div>
                                )}

                                {/* Payment details - show all balances including 0 */}
                                <div className="text-xs text-orange-600 dark:text-orange-400">
                                  Cheque: {formatBalanceAmount(order.chequeBalance || 0, currency)}
                                </div>
                                <div className="text-xs text-red-600 dark:text-red-400">
                                  Credit: {formatBalanceAmount(order.creditBalance || 0, currency)}
                                </div>





                              </div>
                              
                              {/* Order Creation Date and Time */}
                              <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600">
                                <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
                                  <span className="flex items-center gap-1">
                                    📅 Created: {(() => {
                                      // Use created_at if available, fallback to order date
                                      const createdDate = order.created_at || order.date;
                                      const d = new Date(createdDate);
                                      return isNaN(d.getTime())
                                        ? createdDate
                                        : d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
                                    })()}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    🕒 {(() => {
                                      // Use created_at if available, fallback to order date
                                      const createdDate = order.created_at || order.date;
                                      const d = new Date(createdDate);
                                      if (isNaN(d.getTime())) {
                                        return 'N/A';
                                      }
                                      
                                      // Format time in local timezone with AM/PM
                                      const hours = d.getHours();
                                      const minutes = d.getMinutes();
                                      const ampm = hours >= 12 ? 'PM' : 'AM';
                                      const displayHours = hours % 12 || 12;
                                      const displayMinutes = minutes.toString().padStart(2, '0');
                                      
                                      return `${displayHours}:${displayMinutes} ${ampm}`;
                                    })()}
                                  </span>
                                </div>
                              </div>
                              
                              {/* Action Buttons */}
                              <div className="flex gap-1.5 sm:gap-1 mt-2 pt-2 border-t border-slate-200 dark:border-slate-600">
                                {/* Location Button */}
                                {(() => {
                                  const customer = customers.find(c => c.id === order.customerId);
                                  if (customer?.location) {
                                    return (
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openOrderLocation(order, customers);
                                        }} 
                                        className="px-2 py-2 sm:py-1 text-xs font-medium text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/30 rounded transition-colors min-h-[32px] sm:min-h-auto"
                                        title={`Open ${customer.name}'s location`}
                                      >
                                        <span className="hidden sm:inline">📍 Location</span>
                                        <span className="sm:hidden">📍</span>
                                      </button>
                                    );
                                  }
                                  return null;
                                })()}
                                {/* Action buttons: hide download/view/edit/delete for Delivered orders when user is Driver/Sales/Manager */}
                                {((order.status === OrderStatus.Delivered) && (currentUser?.role === UserRole.Driver || currentUser?.role === UserRole.Sales || currentUser?.role === UserRole.Manager)) ? (
                                  // Render nothing (only Location button remains visible above)
                                  null
                                ) : (
                                  <>
                                    <button 
                                      onClick={() => openViewModal(order)} 
                                      className="flex-1 px-2 py-2 sm:py-1 text-xs font-medium text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded transition-colors min-h-[32px] sm:min-h-auto"
                                    >
                                      View
                                    </button>
                                    {canEdit && (
                                      <button 
                                        onClick={() => openEditModal(order)} 
                                        className="flex-1 px-2 py-2 sm:py-1 text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 rounded transition-colors min-h-[32px] sm:min-h-auto"
                                      >
                                        Edit
                                      </button>
                                    )}
                                    {canDelete && (
                                      <button 
                                        onClick={() => openDeleteModal(order)} 
                                        className="px-2 py-2 sm:py-1 text-xs font-medium text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 rounded transition-colors min-h-[32px] sm:min-h-auto"
                                      >
                                        <span className="hidden sm:inline">Delete</span>
                                        <span className="sm:hidden">Del</span>
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
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

        <Modal isOpen={modalState === 'create' || modalState === 'edit'} onClose={closeModal} title={modalState === 'create' ? '🛒 Create New Order' : `📝 Edit Order ${currentOrder?.id}`}>
          <div className="flex flex-col h-[85vh] sm:h-[90vh] lg:h-[800px] max-h-[90vh] bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800">
            {/* Compact Header Section */}
            <div className="p-1 sm:p-2 border-b border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 flex-shrink-0">
              {/* Date and Time Display */}
              <div className="mb-2 p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-700">
                <div className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-blue-600 dark:text-blue-400">📅</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      Order Date: {new Date().toLocaleDateString('en-GB', { 
                        day: '2-digit', 
                        month: '2-digit', 
                        year: 'numeric' 
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-blue-600 dark:text-blue-400">🕒</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      Time: {new Date().toLocaleTimeString('en-GB', { 
                        hour: '2-digit', 
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                {/* Ultra Compact Customer Selection */}
                <div className="relative" ref={customerDropdownRef}>
                  <label htmlFor="customer" className="block mb-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                    👤 Customer
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      id="customer"
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        setIsCustomerDropdownOpen(e.target.value.length > 0);
                      }}
                      onFocus={() => setIsCustomerDropdownOpen(customerSearch.length > 0)}
                      placeholder="Search customer..."
                      className="bg-white border border-slate-300 text-slate-900 text-xs rounded focus:ring-1 focus:ring-blue-400 focus:border-blue-400 block w-full p-1.5 pr-6 dark:bg-slate-700 dark:border-slate-500 dark:placeholder-slate-400 dark:text-white"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-2 sm:pr-4 pointer-events-none">
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    
                    {isCustomerDropdownOpen && customerSearch.length > 0 && (
                      <div className="absolute z-50 w-full mt-2 bg-white/95 backdrop-blur-md border-2 border-blue-200 rounded-xl shadow-xl max-h-60 overflow-y-auto dark:bg-slate-700/95 dark:border-slate-500">
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
                              className={`p-2 cursor-pointer hover:bg-blue-50 dark:hover:bg-slate-600 border-b border-blue-100 dark:border-slate-600 last:border-b-0 transition-all duration-150 ${
                                selectedCustomer === customer.id ? 'bg-gradient-to-r from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-blue-800/30 border-l-4 border-l-blue-500' : ''
                              }`}
                            >
                              <div className="font-medium text-sm text-slate-900 dark:text-white flex items-center gap-2">
                                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                                {customer.name}
                              </div>
                              {customer.email && (
                                <div className="text-xs text-slate-500 dark:text-slate-400">{customer.email}</div>
                              )}
                              {customer.phone && (
                                <div className="text-xs text-slate-500 dark:text-slate-400">{customer.phone}</div>
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
                
                {/* Ultra Compact Delivery Date Section */}
                <div>
                  <label htmlFor="deliveryDate" className="block mb-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                    📅 Delivery Date
                  </label>
                  <input
                    type="date"
                    id="deliveryDate"
                    value={expectedDeliveryDate}
                    onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                    className="bg-white border border-slate-300 text-slate-900 text-xs rounded focus:ring-1 focus:ring-blue-400 focus:border-blue-400 block w-full p-1.5 dark:bg-slate-700 dark:border-slate-500 dark:text-white"
                  />
                </div>

                {/* Delivery Address Section */}
                <div>
                  <label htmlFor="deliveryAddress" className="block mb-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                    📍 Delivery Address
                  </label>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      id="deliveryAddress"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="Enter specific delivery address"
                      className="bg-white border border-slate-300 text-slate-900 text-xs rounded focus:ring-1 focus:ring-blue-400 focus:border-blue-400 block w-full p-1.5 dark:bg-slate-700 dark:border-slate-500 dark:placeholder-slate-400 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const customer = customers.find(c => c.id === selectedCustomer);
                        if (customer) {
                          setDeliveryAddress(customer.location);
                        }
                      }}
                      className="px-2 py-1.5 text-xs bg-blue-100 hover:bg-blue-200 text-blue-600 rounded transition-colors dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800 whitespace-nowrap"
                      title="Use customer's address"
                    >
                      Use Default
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Leave empty to use customer's default address
                  </p>
                </div>
              </div>
              
              {/* Ultra Compact Products Search Section */}
              <div>
                <label className="block mb-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                  🛍️ Products
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={productSearchTerm}
                    onChange={(e) => setProductSearchTerm(e.target.value)}
                    className="bg-white border border-slate-300 text-slate-900 text-xs rounded focus:ring-1 focus:ring-blue-400 focus:border-blue-400 block w-full p-1.5 pr-6 dark:bg-slate-700 dark:border-slate-500 dark:placeholder-slate-400 dark:text-white"
                  />
                  {productSearchTerm && (
                    <button
                      onClick={() => setProductSearchTerm('')}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 rounded-full p-1 transition-all duration-200 dark:hover:text-red-300"
                      title="Clear search"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Ultra Compact Products Section */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {/* Sticky Column Headers */}
              <div className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-600 px-1 py-1">
                <div className="flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <div className="w-4"></div> {/* Space for image */}
                  <div className="flex-1 min-w-0 mr-0.5">Product</div>
                  <div className="flex items-center gap-0.5">
                    <div className="w-16 text-center">LKR</div>
                    <div className="w-8 text-center">Qty</div>
                    <div className="w-8 text-center">Free</div>
                  </div>
                  {/* Hold column removed - no interactive hold control */}
                </div>
              </div>
              <div className="p-1">
                <div className="space-y-0">
                  {availableProductsForOrder.length === 0 ? (
                    <div className="text-center py-4 text-slate-500 dark:text-slate-400">
                      <div className="text-2xl mb-1">📦</div>
                      <p className="text-sm font-medium">{productSearchTerm.trim() ? 'No products found' : 'No products available'}</p>
                    </div>
                  ) : (
                    availableProductsForOrder
                      .sort((a, b) => {
                        // First priority: Show products with quantity > 0 first (at top)
                        const aHasQuantity = (orderItems[a.id] || 0) > 0;
                        const bHasQuantity = (orderItems[b.id] || 0) > 0;
                        if (aHasQuantity && !bHasQuantity) return -1;
                        if (!aHasQuantity && bHasQuantity) return 1;

                        // Second priority: Show in-stock products before out-of-stock products
                        const aBase = currentUser?.role === UserRole.Driver ? getEffectiveStock(a) : (a.stock || 0);
                        const bBase = currentUser?.role === UserRole.Driver ? getEffectiveStock(b) : (b.stock || 0);
                        const aAvail = (aBase || 0) - (pendingMap.get(a.id) || 0);
                        const bAvail = (bBase || 0) - (pendingMap.get(b.id) || 0);
                        const aIsOutOfStock = aAvail <= 0;
                        const bIsOutOfStock = bAvail <= 0;
                        if (!aIsOutOfStock && bIsOutOfStock) return -1;
                        if (aIsOutOfStock && !bIsOutOfStock) return 1;

                        // Within each group, sort by name
                        return a.name.localeCompare(b.name);
                      })
                      .map(product => {
                    const baseStock = currentUser?.role === UserRole.Driver ? getEffectiveStock(product) : (product.stock || 0);
                    const pendingQty = pendingMap.get(product.id) || 0;
                    const available = (baseStock || 0) - pendingQty;
                    const isOutOfStock = available <= 0;
                    const isHeld = heldItems.has(product.id);
                    const isUnavailable = isHeld || isOutOfStock;
                    const hasQuantity = (orderItems[product.id] || 0) > 0;
                    
                    return (
                      <div key={product.id} className={`p-0.5 rounded border ${
                        hasQuantity
                          ? 'bg-green-100 dark:bg-green-900/30 border-green-400 shadow-sm'
                          : isHeld 
                            ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300' 
                            : isOutOfStock 
                              ? 'bg-red-50 dark:bg-red-900/20 border-red-300 opacity-70' 
                              : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-500'
                      }`}>
                        {/* Super Compact Layout - Single Row */}
                        <div className="flex items-center gap-1">
                          <img src={product.imageUrl} alt={product.name} className="w-4 h-4 rounded object-cover flex-shrink-0" />
                          <div className="flex-1 min-w-0 mr-0.5">
                            <h4 className="font-medium text-xs text-slate-800 dark:text-white truncate leading-none">{product.name}</h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-none">
                              <span className={`text-green-600 dark:text-green-300 text-xs font-medium`}>{baseStock}</span>
                              <span className="mx-2 text-purple-500 dark:text-purple-300 text-xs">({pendingQty})</span>
                              <span className={`text-yellow-500 dark:text-yellow-300 text-xs font-semibold ml-1`}>{available}</span>
                            </p>
                          </div>
                          
                          {/* Super Compact Controls - Inline */}
                          <div className="flex items-center gap-0.5">
                            <div className="relative w-16">
                              <span className="absolute left-0.5 top-1/2 -translate-y-1/2 text-blue-500 text-xs">{currency}</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={orderItemPrices[product.id] !== undefined ? orderItemPrices[product.id] : product.price}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  handlePriceChange(product.id, value);
                                }}
                                onFocus={(e) => e.target.select()}
                                placeholder={product.price.toString()}
                                className="w-full py-0.5 pl-4 pr-0.5 border border-slate-300 rounded text-xs text-center focus:ring-1 focus:ring-blue-400 dark:bg-slate-600 dark:border-slate-500 dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                disabled={isUnavailable}
                              />
                            </div>

                                <div className="w-8">
                              <input
                                type="number"
                                min="0"
                                max={isUnavailable ? undefined : Math.max(0, available)}
                                value={orderItems[product.id] || ''}
                                placeholder="0"
                                onChange={(e) => handleQuantityChange(product.id, parseInt(e.target.value, 10) || 0)}
                                className="w-full py-0.5 px-0.5 border border-slate-300 rounded text-xs text-center focus:ring-1 focus:ring-blue-400 dark:bg-slate-600 dark:border-slate-500 dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </div>

                            <div className="w-8">
                              <input
                                type="number"
                                min="0"
                                value={freeItems[product.id] || ''}
                                placeholder="0"
                                onChange={(e) => handleFreeQuantityChange(product.id, parseInt(e.target.value, 10) || 0)}
                                className="w-full py-0.5 px-0.5 border border-green-300 rounded text-xs text-center focus:ring-1 focus:ring-green-400 bg-green-50 dark:bg-green-900/20 dark:border-green-500 dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                title="Free quantity"
                              />
                            </div>
                          </div>
                          
                          {/* Hold button removed from product row per UX change */}
                        </div>
                      </div>
                    )
                  }))}
                </div>
              </div>
            </div>

            {/* Compact Bottom Section */}
            <div className="border-t border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 flex-shrink-0">
              <div className="p-0.5 sm:p-1 space-y-1">
                {/* Ultra Compact Order Summary */}
                <div className="p-1.5 bg-slate-50 dark:bg-slate-700 rounded border border-slate-300 dark:border-slate-500">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-green-700 dark:text-green-300">✅ {inStockItems}</span>
                      {heldItemsCount > 0 && (
                        <span className="text-yellow-700 dark:text-yellow-300">⏳ {heldItemsCount}</span>
                      )}
                    </div>
                    <div className="font-semibold text-blue-600 dark:text-blue-300">
                      {formatCurrency(total, currency)}
                    </div>
                  </div>
                </div>
                
                {/* Ultra Compact Order Notes */}
                <div>
                  <label htmlFor="orderNotes" className="block mb-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                    📝 Notes
                  </label>
                  <input 
                    type="text"
                    id="orderNotes" 
                    value={orderNotes} 
                    onChange={e => setOrderNotes(e.target.value)} 
                    placeholder="Order notes..."
                    className="bg-white border border-slate-300 text-slate-900 text-xs rounded focus:ring-1 focus:ring-blue-400 focus:border-blue-400 block w-full p-1.5 dark:bg-slate-700 dark:border-slate-500 dark:text-white" 
                  />
                </div>
                
                {/* Compact Action Section */}
                <div className="space-y-1">
                  <div className="text-center text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 p-1 sm:p-1.5 rounded">
                    Items: {inStockItems + heldItemsCount}
                  </div>
                  
                  <div className="flex gap-1 sm:gap-2 w-full">
                    <button 
                      onClick={closeModal} 
                      type="button" 
                      className="flex-1 px-2 py-1.5 sm:px-3 sm:py-2 text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 text-xs font-medium rounded transition-all duration-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-500"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleSaveOrder} 
                      type="button" 
                      className="flex-1 px-2 py-1.5 sm:px-3 sm:py-2 text-white bg-blue-600 hover:bg-blue-700 border border-blue-600 text-xs font-semibold rounded transition-all duration-200 disabled:bg-slate-400 disabled:cursor-not-allowed" 
                      disabled={(inStockItems + heldItemsCount) === 0 || !selectedCustomer || isSavingOrder}
                    >
                      {modalState === 'create' ? (isSavingOrder ? 'Creating...' : 'Create') : (isSavingOrder ? 'Saving...' : 'Save')}
                    </button>
                  </div>
                </div>
              </div>
              {/* Safe area padding for mobile devices */}
              <div className="h-4 sm:h-0 bg-white dark:bg-slate-800 flex-shrink-0"></div>
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
                      <div className="p-3 space-y-2 max-h-[80vh] overflow-y-auto">
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                              <div>
                                  <p className="font-medium text-xs text-slate-700 dark:text-slate-300">Customer:</p>
                                  <div className="flex items-center gap-2">
                                    <p className="text-xs text-slate-900 dark:text-white">{viewingOrder.customerName}</p>
                                    {renderCustomerLocationInOrder(viewingOrder, customers)}
                                  </div>
                              </div>
                              <div>
                                  <p className="font-medium text-xs text-slate-700 dark:text-slate-300">Location:</p>
                                  {customer?.location ? (
                                    (() => {
                                      const gpsMatch = customer.location.match(/GPS:\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
                                      if (gpsMatch) {
                                        const [fullMatch, lat, lng] = gpsMatch;
                                        const latitude = parseFloat(lat);
                                        const longitude = parseFloat(lng);
                                        const addressPart = customer.location.replace(fullMatch, '').replace(/\s*\(\s*\)\s*$/, '').trim();
                                        const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
                                        return (
                                          <div className="text-xs">
                                            {addressPart && (
                                              <p className="text-slate-900 dark:text-white truncate">{addressPart}</p>
                                            )}
                                            <a 
                                              href={mapsUrl} 
                                              target="_blank" 
                                              rel="noopener noreferrer"
                                              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 underline inline-flex items-center gap-1"
                                              title={`Open location in Google Maps (${latitude}, ${longitude})`}
                                            >
                                              📍 GPS: {latitude.toFixed(4)}, {longitude.toFixed(4)}
                                            </a>
                                          </div>
                                        );
                                      }
                                      return <p className="text-xs text-slate-900 dark:text-white">{customer.location}</p>;
                                    })()
                                  ) : (
                                    <p className="text-xs text-slate-500 dark:text-slate-400">N/A</p>
                                  )}
                              </div>
                <div>
                  <p className="font-medium text-xs text-slate-700 dark:text-slate-300">Order Date:</p>
                  <p className="text-xs text-slate-900 dark:text-white">{viewingOrder.orderdate}</p>
                </div>
                              <div>
                                  <p className="font-medium text-xs text-slate-700 dark:text-slate-300">Status:</p>
                                  <p><Badge variant={getStatusBadgeVariant(viewingOrder.status)}>{viewingOrder.status}</Badge></p>
                <div>
                  <p className="font-medium text-xs text-slate-700 dark:text-slate-300">Assigned To:</p>
                  <p className="text-xs text-slate-900 dark:text-white">{viewingOrder.assigneduserid}</p>
                </div>
                              </div>
                          </div>
                          
                          <div className="pt-2 border-t dark:border-slate-700">
                              <h4 className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-1">Financial Summary</h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <label htmlFor="chequeBalance" className="block mb-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">Pending Cheque</label>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">{currency}</span>
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
                        className="bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded focus:ring-blue-500 focus:border-blue-500 block w-full p-1.5 pl-7 dark:bg-slate-700 dark:border-slate-600 dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        disabled={!canEdit}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="amountPaid" className="block mb-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">Amount Paid</label>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">{currency}</span>
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
                        className="bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded focus:ring-blue-500 focus:border-blue-500 block w-full p-1.5 pl-7 dark:bg-slate-700 dark:border-slate-600 dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                        className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 pl-10 dark:bg-slate-700 dark:border-slate-600 dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                                              className="bg-gray-100 border border-slate-300 text-slate-900 text-sm rounded-lg block w-full p-2.5 pl-10 dark:bg-slate-800 dark:border-slate-600 dark:text-white cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                      <span className="font-medium text-orange-600">{formatBalanceAmount(editableChequeBalance, currency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Return Amount:</span>
                      <span className="font-medium text-blue-600">{formatCurrency(editableReturnAmount === '' ? 0 : editableReturnAmount, currency)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-base mt-1">
                      <span className="text-slate-800 dark:text-slate-200">Balance Due:</span> 
                      <span className="text-red-600">{formatBalanceAmount(editableChequeBalance + editableCreditBalance, currency)}</span>
                    </div>
                                  </div>
                              </div>
                          </div>

                          <div className="pt-2">
                              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">Items Ordered</h4>
                              <div className="overflow-x-auto border rounded-lg dark:border-slate-700">
                                  <table className="min-w-full text-xs">
                                      <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-400">
                      <tr>
                        <th className="py-1 px-2 text-left">Product</th>
                        <th className="py-1 px-2 text-right">Quantity</th>
                        <th className="py-1 px-2 text-right">Free</th>
                        <th className="py-1 px-2 text-right">Unit Price</th>
                        <th className="py-1 px-2 text-right">Subtotal</th>
                        {/* Actions column removed (Hold/Unhold removed) */}
                      </tr>
                                      </thead>
                                      <tbody className="text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                      {(viewingOrder.orderItems ?? []).map(item => {
                        const product = products.find(p => p.id === item.productId);
                        if (!product) return null;
                        const subtotal = (item.quantity * item.price);
                        const totalCostPrice = (product.costPrice || 0) * (item.quantity || 0);
                        return (
                          <tr key={item.productId}>
                            <td className="py-1 px-2">
                              <div className="flex items-center space-x-2">
                                <img src={product.imageUrl} alt={product.name} className="w-6 h-6 rounded object-cover" />
                                <span className="font-medium text-xs text-slate-800 dark:text-slate-200">{product.name}</span>
                              </div>
                            </td>
                            <td className="py-1 px-2 text-right text-xs">{item.quantity}</td>
                            <td className="py-1 px-2 text-right text-xs font-bold text-green-600">{item.free || 0}</td>
                            <td className="py-1 px-2 text-right text-xs">{formatCurrency(item.price, currency)}</td>
                            <td className="py-1 px-2 text-right font-semibold text-xs text-slate-900 dark:text-white">
                              {formatCurrency(subtotal, currency)}
                            </td>
                            {/* Hold action removed */}
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
                              {/* Unhold action removed */}
                                                      </tr>
                                                  )
                                              })}
                                          </tbody>
                                      </table>
                                  </div>
                              </div>
                          )}
                      </div>
                      <div className="flex items-center justify-between p-2 border-t border-slate-200 dark:border-slate-600">
            <div className="flex-1">
              <p className="text-xs text-slate-600 dark:text-slate-300">Grand Total: <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(viewingOrder.total, currency)}</span></p>
            </div>
                        <div className="flex flex-wrap items-center gap-1">
                           {canEdit && (
                                <button onClick={handleSaveBalances} type="button" className="text-white bg-green-600 hover:bg-green-700 font-medium rounded text-xs px-2 py-1 text-center">
                                    Save Balances
                                </button>
                           )}
                            {canPrintBill && !(viewingOrder.status === OrderStatus.Delivered && (currentUser?.role === UserRole.Driver || currentUser?.role === UserRole.Sales || currentUser?.role === UserRole.Manager)) && (
                              <button 
                                  onClick={handleDownloadBill} 
                                  type="button" 
                                  className="text-white bg-blue-600 hover:bg-blue-700 font-medium rounded text-xs px-2 py-1 text-center disabled:bg-blue-400 disabled:cursor-not-allowed"
                                  disabled={billLoading}
                              >
                                  {billLoading ? 'Processing...' : (viewingOrder.status === OrderStatus.Delivered ? 'Download Bill' : 'Download Bill & Confirm')}
                              </button>
                            )}
                            <button onClick={closeViewModal} type="button" className="text-white bg-slate-600 hover:bg-slate-700 font-medium rounded text-xs px-2 py-1 text-center">
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
                    <button onClick={async () => {
                      const success = await handleConfirmFinalize();
                      if (success) {
                        setOrderToFinalize(null);
                      }
                      // If not successful, modal stays open and order status remains pending
                    }} type="button" className="text-white bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700">
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