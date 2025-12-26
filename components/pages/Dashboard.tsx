import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../ui/Card';
import { FilterField } from '../ui/FilterField';
import { Badge } from '../ui/Badge';
import { SalesChart } from '../charts/SalesChart';
import { AdminFinancialChart } from '../charts/AdminFinancialChart';
import { OrderStatus, Product, UserRole } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { supabase } from '../../supabaseClient';
import { exportToPDF } from '../../utils/pdfExport';

const getStatusBadgeVariant = (status: OrderStatus) => {
    switch (status) {
        case OrderStatus.Delivered: return 'success';
        case OrderStatus.Pending: return 'warning';
        case OrderStatus.Shipped: return 'info';
        case OrderStatus.Cancelled: return 'danger';
        default: return 'default';
    }
}

const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount).replace('$', `${currency} `);
};

// Helper function to get appropriate font size based on the number of digits
const getFontSizeClass = (value: string | number) => {
    const valueStr = value.toString().replace(/[^\d]/g, ''); // Remove non-digits
    const digitCount = valueStr.length;
    
    if (digitCount >= 10) {
        return 'text-2xl'; // Smaller font for 10+ digits
    } else if (digitCount >= 7) {
        return 'text-3xl'; // Medium font for 7-9 digits
    } else {
        return 'text-4xl'; // Large font for smaller numbers
    }
};

// StatValue: displays currency label above and amount below with reduced font-size
const StatValue: React.FC<{ amount: number; currency?: string; colorClass?: string }> = ({ amount, currency = 'LKR', colorClass = '' }) => {
  const safeAmount = (typeof amount === 'number' && !isNaN(amount)) ? amount : 0;
  const formattedNumber = safeAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const baseClass = getFontSizeClass(formattedNumber);
  const adjusted = baseClass === 'text-4xl' ? 'text-3xl' : baseClass === 'text-3xl' ? 'text-2xl' : baseClass === 'text-2xl' ? 'text-xl' : baseClass;
  return (
    <div>
      <div className="text-sm font-medium text-slate-600 dark:text-slate-400">{currency}</div>
      <p className={`${adjusted} font-bold ${colorClass}`}>{formattedNumber}</p>
    </div>
  );
};

// Expenses Card Component
const ExpensesCard: React.FC<{ currency: string; dateRange: { start: string; end: string } }> = ({ currency, dateRange }) => {
    const [expenses, setExpenses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchExpenses = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase.from('expenses').select('*').order('date', { ascending: false });
            
            if (error) {
              // If error, try localStorage fallback and coerce amounts to numbers
              try {
                const local = localStorage.getItem('app_expenses_v1');
                const parsed = local ? JSON.parse(local) : [];
                setExpenses(Array.isArray(parsed) ? parsed.map((e: any) => ({ ...e, amount: Number(e?.amount) || 0 })) : []);
              } catch {
                setExpenses([]);
              }
            } else {
              // Ensure amounts are numeric to avoid string concatenation in reduce
              setExpenses((data || []).map((e: any) => ({ ...e, amount: Number(e?.amount) || 0 })));
            }
        } catch (error) {
            console.error('Error fetching expenses:', error);
            setExpenses([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchExpenses();
    }, []);

    // Filter expenses based on date range
    const filteredExpenses = useMemo(() => {
      if (!dateRange.start && !dateRange.end) {
        // If no date filter, show ALL expenses (match Expenses page default behavior)
        return expenses;
      }

      return expenses.filter(expense => {
            const expenseDate = new Date(expense.date);
            
            if (dateRange.start && expenseDate < new Date(dateRange.start)) {
                return false;
            }
            
            if (dateRange.end) {
                const endDate = new Date(dateRange.end);
                endDate.setDate(endDate.getDate() + 1); // Make end date inclusive
                if (expenseDate >= endDate) {
                    return false;
                }
            }
            
            return true;
        });
    }, [expenses, dateRange]);

    // Calculate total expenses
    const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + (Number(expense?.amount) || 0), 0);

    // Calculate previous period for comparison
    const previousPeriodExpenses = useMemo(() => {
        if (!dateRange.start || !dateRange.end) {
            // Default: previous month comparison
            const lastMonth = new Date();
            lastMonth.setMonth(lastMonth.getMonth() - 1);
            
            return expenses.filter(expense => {
                const expenseDate = new Date(expense.date);
                return expenseDate.getMonth() === lastMonth.getMonth() && 
                       expenseDate.getFullYear() === lastMonth.getFullYear();
            });
        }

        // Calculate previous period based on selected date range
        const startDate = new Date(dateRange.start);
        const endDate = new Date(dateRange.end);
        const periodDuration = endDate.getTime() - startDate.getTime();
        
        const prevEndDate = new Date(startDate.getTime() - 1);
        const prevStartDate = new Date(prevEndDate.getTime() - periodDuration);

        return expenses.filter(expense => {
            const expenseDate = new Date(expense.date);
            return expenseDate >= prevStartDate && expenseDate <= prevEndDate;
        });
    }, [expenses, dateRange]);

    const prevTotalExpenses = previousPeriodExpenses.reduce((sum, expense) => sum + (Number(expense?.amount) || 0), 0);
    
    // Calculate percentage change
    const expensesChange = prevTotalExpenses > 0 ? ((totalExpenses - prevTotalExpenses) / prevTotalExpenses) * 100 : 0;

    return (
        <Card className="bg-gradient-to-br from-pink-50 to-pink-100 dark:from-pink-950 dark:to-pink-900 border-pink-200 dark:border-pink-800 min-h-[180px] flex flex-col">
          <CardHeader className="flex-shrink-0">
            <CardTitle className="text-pink-700 dark:text-pink-300">Total Expenses</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                {loading ? (
                  <p className="text-4xl font-bold text-pink-600 dark:text-pink-400">Loading...</p>
                ) : (
                  <StatValue amount={totalExpenses} currency={currency} colorClass="text-pink-600 dark:text-pink-400" />
                )}
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <ChangeIndicator change={expensesChange} />
            </div>
          </CardContent>
        </Card>
    );
};

// Net Profit Card Component - Admin Only
const NetProfitCard: React.FC<{ 
  currency: string; 
  dateRange: { start: string; end: string }; 
  totalProfit: number;
}> = ({ currency, dateRange, totalProfit }) => {
    const [expenses, setExpenses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchExpenses = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase.from('expenses').select('*').order('date', { ascending: false });
            
            if (error) {
              // If error, try localStorage fallback and coerce amounts to numbers
              try {
                const local = localStorage.getItem('app_expenses_v1');
                const parsed = local ? JSON.parse(local) : [];
                setExpenses(Array.isArray(parsed) ? parsed.map((e: any) => ({ ...e, amount: Number(e?.amount) || 0 })) : []);
              } catch {
                setExpenses([]);
              }
            } else {
              // Ensure amounts are numeric
              setExpenses((data || []).map((e: any) => ({ ...e, amount: Number(e?.amount) || 0 })));
            }
        } catch (error) {
            console.error('Error fetching expenses for net profit:', error);
            setExpenses([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchExpenses();
    }, []);

    // Filter expenses based on date range (same logic as ExpensesCard)
    const filteredExpenses = useMemo(() => {
      if (!dateRange.start || !dateRange.end) {
        // If no date filter, show ALL expenses (match Expenses page default behavior)
        return expenses;
      }

      return expenses.filter(expense => {
            const expenseDate = new Date(expense.date);
            
            if (dateRange.start && expenseDate < new Date(dateRange.start)) {
                return false;
            }
            
            if (dateRange.end) {
                const endDate = new Date(dateRange.end);
                endDate.setDate(endDate.getDate() + 1); // Make end date inclusive
                if (expenseDate >= endDate) {
                    return false;
                }
            }
            
            return true;
        });
    }, [expenses, dateRange]);

    // Calculate total expenses for the period
    const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + (Number(expense?.amount) || 0), 0);
    
    // Calculate net profit as requested: Total Profit - Expenses
    const netProfit = totalProfit - totalExpenses;
    
    // Calculate net profit margin relative to totalProfit
    const netProfitMargin = totalProfit > 0 ? (netProfit / totalProfit * 100) : 0;
    
    // Determine card color based on profit/loss
    const isProfit = netProfit >= 0;
    
    const cardGradientColor = isProfit 
        ? "bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900 border-emerald-200 dark:border-emerald-800" 
        : "bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950 dark:to-red-900 border-red-200 dark:border-red-800";
    
    const titleColor = isProfit 
        ? "text-emerald-700 dark:text-emerald-300" 
        : "text-red-700 dark:text-red-300";
    
    const amountColor = isProfit 
        ? "text-emerald-600 dark:text-emerald-400" 
        : "text-red-600 dark:text-red-400";
        
    const changeColor = isProfit 
        ? "text-emerald-400 dark:text-emerald-500" 
        : "text-red-400 dark:text-red-500";

    return (
        <Card className={`${cardGradientColor} min-h-[180px] flex flex-col`}>
          <CardHeader className="flex-shrink-0">
            <CardTitle className={titleColor}>
                Net Profit (Admin)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                {loading ? (
                  <p className={`text-4xl font-bold ${amountColor}`}>Loading...</p>
                ) : (
                  <StatValue amount={netProfit} currency={currency} colorClass={amountColor} />
                )}
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <ChangeIndicator change={netProfit > 0 ? 5.2 : -8.5} />
            </div>
          </CardContent>
        </Card>
    );
};

// Percentage change indicator component
const ChangeIndicator: React.FC<{ change: number }> = ({ change }) => {
    const isPositive = change >= 0;
    const absChange = Math.abs(change);
    
    if (change === 0) {
        return (
            <div className="flex items-center space-x-1 text-sm text-gray-500">
                <span className="text-lg text-gray-400">●</span>
                <span className="font-medium">0.0%</span>
            </div>
        );
    }
    
    return (
        <div className={`flex items-center space-x-1 text-sm px-2 py-1 rounded-full ${
            isPositive 
                ? 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-900/30' 
                : 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-900/30'
        }`}>
            <span className={`text-xs font-bold ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {isPositive ? '▲' : '▼'}
            </span>
            <span className="font-semibold text-xs">
                {absChange.toFixed(1)}%
            </span>
        </div>
    );
};

export const Dashboard: React.FC = () => {
    const { currentUser } = useAuth();
    const {
      orders = [],
      products = [],
      customers = [],
      suppliers = [],
      users = []
    } = useData() || {};

    // Early return for unauthorized access
    if (!currentUser) {
        return <div className="p-8 text-center">Please log in to access the dashboard.</div>;
    }

    // Role-based dashboard rendering
    const isAdmin = currentUser.role === UserRole.Admin;
    const isManager = currentUser.role === UserRole.Manager;
    const isSecretary = currentUser.role === UserRole.Secretary;
    const isSalesRep = currentUser.role === UserRole.Sales;
    const isDriver = currentUser.role === UserRole.Driver;

    // Driver Dashboard - Simple delivery-focused view
    if (isDriver) {
        return <DriverDashboard currentUser={currentUser} orders={orders} products={products} customers={customers} />;
    }

    // Sales Rep Dashboard - Customer and sales-focused view
    if (isSalesRep) {
      return <SalesRepDashboard currentUser={currentUser} orders={orders} products={products} customers={customers} suppliers={suppliers} users={users} />;
    }

    // Admin/Manager Dashboard - Full detailed view (existing functionality)
    // Defensive fallback for products array
    const safeProducts = Array.isArray(products) ? products : [];
    // (Top products chart removed — Financial Overview expanded)

    const [selectedSupplier, setSelectedSupplier] = useState<string>('all');
    const [selectedSalesRep, setSelectedSalesRep] = useState<string>('all');
    const [selectedCustomer, setSelectedCustomer] = useState<string>('all');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    // Date filters default: current month
    const now = new Date();
    const defaultMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const defaultMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    const defaultMonthValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [dateRange, setDateRange] = useState({ start: defaultMonthStart, end: defaultMonthEnd });
    const [monthFilter, setMonthFilter] = useState<string>(defaultMonthValue);
    // When true, monthly financial overview ignores the current date filters and shows data for all months
    const [monthlyFree, setMonthlyFree] = useState<boolean>(true);
    
    // Percentage calculator states
    const [showPercentageCalculator, setShowPercentageCalculator] = useState<boolean>(false);
    const [percentageInput, setPercentageInput] = useState<string>('');

    const currency = currentUser?.settings.currency || 'LKR';

    const handleMonthChange = (value: string) => {
      if (!value || value === 'all') {
        // Show all months
        setMonthFilter('all');
        setDateRange({ start: '', end: '' });
        return;
      }
      // value is YYYY-MM
      const [y, m] = value.split('-').map(Number);
      if (!y || !m) return;
      const start = new Date(y, m - 1, 1).toISOString().split('T')[0];
      const end = new Date(y, m, 0).toISOString().split('T')[0];
      setMonthFilter(value);
      setDateRange({ start, end });
    };

    const accessibleSuppliers = useMemo(() => {
    if (currentUser?.role === UserRole.Sales && currentUser.assignedSupplierNames) {
      return new Set(currentUser.assignedSupplierNames);
    }
    return null; // null means all access for Admin/Manager
  }, [currentUser]);

  const availableSuppliers = useMemo(() => {
  const safeSuppliers = suppliers || [];
  if (!accessibleSuppliers) return safeSuppliers;
  return safeSuppliers.filter(s => accessibleSuppliers.has(s.name));
  }, [suppliers, accessibleSuppliers]);

    const filteredOrders = useMemo(() => {
    console.log('Dashboard Filter Debug:', {
      totalOrders: orders.length,
      selectedSupplier,
      selectedCustomer,
      selectedCategory,
      dateRange,
      availableSuppliers: availableSuppliers.length,
      customers: customers.length,
      products: safeProducts.length
    });
    
    let baseOrders = orders;

    // Pre-filter orders for Sales Reps based on their assigned suppliers
    if (accessibleSuppliers) {
      const productSupplierMap = new Map(safeProducts.map(p => [p.id, p.supplier]));
      baseOrders = orders.filter(order =>
        order.orderItems && Array.isArray(order.orderItems) &&
        order.orderItems.some(item => {
          const supplier = productSupplierMap.get(item.productId);
          return supplier && accessibleSuppliers.has(supplier);
        })
      );
    }

    return baseOrders.filter(order => {
      // Customer Filter
      if (selectedCustomer !== 'all' && order.customerId !== selectedCustomer) {
        console.log('Customer filter failed:', { 
          orderId: order.id, 
          orderCustomerId: order.customerId, 
          selectedCustomer,
          orderCustomerName: order.customerName 
        });
        return false;
      }

      // Sales Rep Filter
      if (selectedSalesRep !== 'all') {
        const assignedId = order.assignedUserId ?? order.assigneduserid ?? order.assigned_user_id ?? order.assignedUser ?? null;
        if (String(assignedId) !== String(selectedSalesRep)) return false;
      }

      // Date Range Filter
      const orderDate = new Date(order.date);
      if (dateRange.start && orderDate < new Date(dateRange.start)) {
        return false;
      }
      // Add 1 day to the end date to make it inclusive
      if (dateRange.end) {
        const endDate = new Date(dateRange.end);
        endDate.setDate(endDate.getDate() + 1);
        if (orderDate >= endDate) {
          return false;
        }
      }

      // Get product details for items in the current order
      const orderProducts = (order.orderItems || [])
        .map(item => safeProducts.find(p => p.id === item.productId))
        .filter(Boolean) as Product[];

      // Supplier Filter
      if (selectedSupplier !== 'all' && !orderProducts.some(p => p.supplier === selectedSupplier)) {
        return false;
      }

      // Category Filter
      if (selectedCategory !== 'all' && !orderProducts.some(p => p.category === selectedCategory)) {
        console.log('Category filter failed:', { 
          orderId: order.id, 
          selectedCategory, 
          orderProducts: orderProducts.map(p => ({ id: p.id, category: p.category }))
        });
        return false;
      }

      return true;
    });
  }, [orders, safeProducts, selectedCustomer, selectedSupplier, selectedCategory, dateRange, accessibleSuppliers, selectedSalesRep]);

  // Calculate previous period orders for comparison
  const previousPeriodOrders = useMemo(() => {
    if (!dateRange.start || !dateRange.end) {
      // Default: previous month comparison
      const currentDate = new Date();
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      
      return orders.filter(order => {
        const orderDate = new Date(order.date);
        return orderDate.getMonth() === lastMonth.getMonth() && 
               orderDate.getFullYear() === lastMonth.getFullYear();
      });
    }

    // Calculate previous period based on selected date range
    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);
    const periodDuration = endDate.getTime() - startDate.getTime();
    
    const prevEndDate = new Date(startDate.getTime() - 1); // Day before start
    const prevStartDate = new Date(prevEndDate.getTime() - periodDuration);

    let baseOrders = orders;

    // Apply same pre-filtering as current period
    if (accessibleSuppliers) {
      const productSupplierMap = new Map(safeProducts.map(p => [p.id, p.supplier]));
      baseOrders = orders.filter(order =>
        order.orderItems && Array.isArray(order.orderItems) &&
        order.orderItems.some(item => {
          const supplier = productSupplierMap.get(item.productId);
          return supplier && accessibleSuppliers.has(supplier);
        })
      );
    }

    return baseOrders.filter(order => {
      const orderDate = new Date(order.date);
      
      // Date range filter for previous period
      if (orderDate < prevStartDate || orderDate > prevEndDate) {
        return false;
      }

      // Apply same filters as current period
      if (selectedCustomer !== 'all' && order.customerId !== selectedCustomer) {
        return false;
      }

      const orderProducts = (order.orderItems || [])
        .map(item => safeProducts.find(p => p.id === item.productId))
        .filter(Boolean) as Product[];

      if (selectedSupplier !== 'all' && !orderProducts.some(p => p.supplier === selectedSupplier)) {
        return false;
      }

      if (selectedCategory !== 'all' && !orderProducts.some(p => p.category === selectedCategory)) {
        return false;
      }

      return true;
    });
  }, [orders, safeProducts, selectedCustomer, selectedSupplier, selectedCategory, dateRange, accessibleSuppliers]);
    
  const categories = useMemo(() => {
    const relevantProducts = accessibleSuppliers 
      ? safeProducts.filter(p => accessibleSuppliers.has(p.supplier))
      : safeProducts;
    return ['all', ...new Set(relevantProducts.map(p => p.category))]
  }, [safeProducts, accessibleSuppliers]);

  // Filtered products based on current filter selections
  const filteredProducts = useMemo(() => {
    let filtered = accessibleSuppliers 
      ? safeProducts.filter(p => accessibleSuppliers.has(p.supplier))
      : safeProducts;

    // Filter by supplier
    if (selectedSupplier !== 'all') {
      filtered = filtered.filter(p => p.supplier === selectedSupplier);
    }

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(p => p.category === selectedCategory);
    }

    return filtered;
  }, [safeProducts, selectedSupplier, selectedCategory, accessibleSuppliers]);

  const salesDataForChart = useMemo(() => {
    // Group delivered orders by day (YYYY-MM-DD) so the chart shows date-wise data
    const dailyData: { [key: string]: { sales: number; orders: any[] } } = {};
    const dateSet = new Set<string>();

    filteredOrders.forEach(order => {
      if (order.status === OrderStatus.Delivered) {
        const d = new Date(order.date);
        const key = d.toISOString().split('T')[0]; // YYYY-MM-DD
        dateSet.add(key);

        if (!dailyData[key]) {
          dailyData[key] = { sales: 0, orders: [] };
        }

        dailyData[key].sales += order.total || 0;
        dailyData[key].orders.push(order);
      }
    });

    const sortedDates = Array.from(dateSet).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    return sortedDates.map(key => {
      const data = dailyData[key] || { sales: 0, orders: [] };

      const deliveryCost = data.orders.reduce((sum, order) => {
        if (!order.orderItems) return sum;
          const orderCost = order.orderItems.reduce((itemSum, item) => {
          const product = safeProducts.find(p => p.id === item.productId);
          const costPrice = (typeof product?.costPrice === 'number' && product.costPrice > 0) ? product.costPrice : 0;
          const totalQty = (Number(item.quantity) || 0) + (Number(item.free) || 0);
          return itemSum + (costPrice * totalQty);
        }, 0);
        return sum + orderCost;
      }, 0);

      // Compute margin-based cost using marginPrice only (missing margin treated as 0)
      const marginCost = data.orders.reduce((sum, order) => {
        if (!order.orderItems) return sum;
        const orderMargin = order.orderItems.reduce((itemSum, item) => {
          const product = safeProducts.find(p => p.id === item.productId);
          const margin = (typeof product?.marginPrice === 'number') ? product.marginPrice : 0;
          const totalQty = (Number(item.quantity) || 0) + (Number(item.free) || 0);
          return itemSum + (margin * totalQty);
        }, 0);
        return sum + orderMargin;
      }, 0);

      const grossProfit = data.sales - deliveryCost;
      const dailyExpenses = 0; // placeholder for daily expenses
      const netProfit = grossProfit - dailyExpenses;

      const dateObj = new Date(key);
      const label = dateObj.toLocaleDateString('en-US', { day: '2-digit', month: 'short' }); // e.g. "08 Nov"
      const fullLabel = dateObj.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }); // e.g. "08 Nov 2025"

      return {
        label,
        fullLabel,
        sales: data.sales,
        deliveryCost,
        marginCost,
        grossProfit,
        netProfit
      };
    });

  }, [filteredOrders, safeProducts]);

  // Cumulative series for admin: running totals for each metric
  const cumulativeSalesData = useMemo(() => {
    let cumSales = 0;
    let cumDelivery = 0;
    let cumMargin = 0;
    let cumGross = 0;
    let cumNet = 0;

    return salesDataForChart.map(pt => {
      const sales = Number(pt.sales || 0);
      const deliveryCost = Number(pt.deliveryCost || 0);
      const marginCost = Number(pt.marginCost || 0);
      const grossProfit = Number(pt.grossProfit || 0);
      const netProfit = Number(pt.netProfit || 0);

      cumSales += sales;
      cumDelivery += deliveryCost;
      cumMargin += marginCost;
      cumGross += grossProfit;
      cumNet += netProfit;

      return {
        ...pt,
        sales: cumSales,
        deliveryCost: cumDelivery,
        marginCost: cumMargin,
        grossProfit: cumGross,
        netProfit: cumNet,
      };
    });
  }, [salesDataForChart]);

  // Monthly aggregated financials (Admin view): group by YYYY-MM
  const monthlyFinancialData = useMemo(() => {
    const map = new Map<string, { sales: number; deliveryCost: number; marginCost: number; cheque: number; credit: number; fullLabel?: string }>();

    // Use all delivered orders when monthlyFree is enabled, otherwise respect current filters
    const baseOrders = monthlyFree ? (orders || []).filter(o => o.status === OrderStatus.Delivered) : filteredOrders;

    baseOrders.forEach(order => {
      try {
        if (order.status !== OrderStatus.Delivered) return;
        const d = new Date(order.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; // e.g. 2025-11
        const fullLabel = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        if (!map.has(key)) map.set(key, { sales: 0, deliveryCost: 0, marginCost: 0, cheque: 0, credit: 0, fullLabel });
        const entry = map.get(key)!;
        entry.sales += Number(order.total || 0);

        // Use persisted per-order cost fields when available, fallback to computed cost
        const orderCostVal = Number(order.total_cost_price ?? order.totalCostPrice ?? order.totalCostPrice ?? 0) || 0;
        if (orderCostVal > 0) {
          entry.deliveryCost += orderCostVal;
        } else {
          // compute from orderItems using product costPrice
          const computed = (order.orderItems || []).reduce((sum, item) => {
            const product = safeProducts.find(p => p.id === item.productId);
            const costPrice = (typeof product?.costPrice === 'number' && !isNaN(product.costPrice)) ? product.costPrice : 0;
            const qty = (Number(item.quantity) || 0) + (Number(item.free) || 0);
            return sum + (costPrice * qty);
          }, 0);
          entry.deliveryCost += computed;
        }

        const orderMarginVal = Number(order.total_margin_price ?? order.totalMarginPrice ?? 0) || 0;
        if (orderMarginVal > 0) entry.marginCost += orderMarginVal;

        entry.cheque += Number(order.chequeBalance || 0);
        entry.credit += Number(order.creditBalance || 0);
      } catch (e) {
        // ignore malformed dates
      }
    });

    const keys = Array.from(map.keys()).sort((a, b) => new Date(a + '-01').getTime() - new Date(b + '-01').getTime());
    return keys.map(k => {
      const v = map.get(k)!;
      const [y, m] = k.split('-').map(Number);
      const label = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      return { label, fullLabel: v.fullLabel, sales: v.sales, deliveryCost: v.deliveryCost, marginCost: v.marginCost, cheque: v.cheque, credit: v.credit };
    });
  }, [filteredOrders, safeProducts, orders, monthlyFree]);

  // Admin: compute date-wise totals for Paid, Cheque, Credit, Returns
  const adminFinancialData = useMemo(() => {
    const map: Record<string, { paid: number; cheque: number; credit: number; returns: number; fullLabel?: string }> = {};

    // Consider delivered orders in filteredOrders (respecting filters)
    filteredOrders.forEach(order => {
      try {
        if (order.status !== OrderStatus.Delivered) return;
        const d = new Date(order.date);
        const key = d.toISOString().split('T')[0];
        const fullLabel = d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });

        const cheque = Number(order.chequeBalance || 0);
        const credit = Number(order.creditBalance || 0);
        const returnsAmt = Number(order.returnAmount || 0);
        const total = Number(order.total || 0);
        const paid = total - cheque - credit - returnsAmt;

        if (!map[key]) map[key] = { paid: 0, cheque: 0, credit: 0, returns: 0, fullLabel };
        map[key].paid += paid;
        map[key].cheque += cheque;
        map[key].credit += credit;
        map[key].returns += returnsAmt;
      } catch (e) {
        // ignore bad dates
      }
    });

    const keys = Object.keys(map).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    return keys.map(k => ({ label: k, fullLabel: map[k].fullLabel, paid: map[k].paid, cheque: map[k].cheque, credit: map[k].credit, returns: map[k].returns }));
  }, [filteredOrders]);


    const handleResetFilters = () => {
        setSelectedSupplier('all');
        setSelectedCustomer('all');
        setSelectedCategory('all');
      setSelectedSalesRep('all');
        setDateRange({ start: '', end: '' });
    };

    // Stats based on filtered data
    // Calculate total delivered sales (only Delivered orders)
    const totalSales = filteredOrders.reduce((sum, order) => order.status === 'Delivered' ? sum + order.total : sum, 0);
    // Use persisted per-order totals when available.
    // The `orders` rows include `total_cost_price` and `total_margin_price` in the DB.
    // Prefer those fields (or their camelCase mapped equivalents) to compute dashboard sums.
    const totalCost = filteredOrders.reduce((sum, order) => {
      if (order.status !== OrderStatus.Delivered) return sum;
      const orderCostVal = Number(order.total_cost_price ?? order.totalCostPrice ?? 0) || 0;
      return sum + orderCostVal;
    }, 0);

    const totalMargin = filteredOrders.reduce((sum, order) => {
      if (order.status !== OrderStatus.Delivered) return sum;
      const orderMarginVal = Number(order.total_margin_price ?? order.totalMarginPrice ?? 0) || 0;
      return sum + orderMarginVal;
    }, 0);

    // Total Order Cost for ALL filtered orders (use persisted per-order total_cost_price when present)
    const totalOrderCost = filteredOrders.reduce((sum, order) => {
      const orderCostVal = Number(order.total_cost_price ?? order.totalCostPrice ?? 0) || 0;
      return sum + orderCostVal;
    }, 0);
    const totalOrders = filteredOrders.length;
    const totalOrdersAmount = filteredOrders.reduce((sum, order) => sum + order.total, 0);
    
    // Previous period stats for comparison
    const prevTotalSales = previousPeriodOrders.reduce((sum, order) => order.status === 'Delivered' ? sum + order.total : sum, 0);
    const prevTotalOrders = previousPeriodOrders.length;
    const prevTotalOrdersAmount = previousPeriodOrders.reduce((sum, order) => sum + order.total, 0);
    
    // Calculate percentage changes
    const salesChange = prevTotalSales > 0 ? ((totalSales - prevTotalSales) / prevTotalSales) * 100 : 0;
    const ordersChange = prevTotalOrders > 0 ? ((totalOrders - prevTotalOrders) / prevTotalOrders) * 100 : 0;
    const ordersAmountChange = prevTotalOrdersAmount > 0 ? ((totalOrdersAmount - prevTotalOrdersAmount) / prevTotalOrdersAmount) * 100 : 0;
    
    // Calculate percentage changes based on filtered data vs previous period
    const calculateChange = (current: number, previous: number) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return ((current - previous) / previous) * 100;
    };
    
    // Financial stats for current filtered period - ONLY from delivered orders
  // Sum of cheque and credit for the current filtered DELIVERED orders only
  const deliveredFilteredOrders = filteredOrders.filter(order => order.status === OrderStatus.Delivered);
  const currentChequeBalance = deliveredFilteredOrders.reduce((sum, order) => sum + (order.chequeBalance || 0), 0);
  const currentCreditBalance = deliveredFilteredOrders.reduce((sum, order) => sum + (order.creditBalance || 0), 0);
  // Sum of return amounts for filtered DELIVERED orders
  const currentReturnAmount = deliveredFilteredOrders.reduce((sum, order) => sum + (order.returnAmount || 0), 0);
  // Total paid calculated from components per requirement:
  // totalPaid = totalSales - totalCheque - totalCredit - totalReturn
  // Use the filtered period's totalSales (delivered orders) for current period
  const currentPaid = totalSales - currentChequeBalance - currentCreditBalance - currentReturnAmount;
  // Reconciled total sales computed from components: paid + cheque + credit + returns
  const reconciledTotalSales = currentPaid + currentChequeBalance + currentCreditBalance + currentReturnAmount;
    
    // Financial stats for previous period - ONLY from delivered orders
  const deliveredPreviousPeriodOrders = previousPeriodOrders.filter(order => order.status === OrderStatus.Delivered);
  const prevChequeBalance = deliveredPreviousPeriodOrders.reduce((sum, order) => sum + (order.chequeBalance || 0), 0);
  const prevCreditBalance = deliveredPreviousPeriodOrders.reduce((sum, order) => sum + (order.creditBalance || 0), 0);
  const prevReturnAmount = deliveredPreviousPeriodOrders.reduce((sum, order) => sum + (order.returnAmount || 0), 0);
  const prevPaid = prevTotalSales - prevChequeBalance - prevCreditBalance - prevReturnAmount;
  const reconciledPrevTotalSales = prevPaid + prevChequeBalance + prevCreditBalance + prevReturnAmount;
    
  // Calculate changes
  const chequeChange = calculateChange(currentChequeBalance, prevChequeBalance);
  const creditChange = calculateChange(currentCreditBalance, prevCreditBalance);
  const paidChange = calculateChange(currentPaid, prevPaid);
  const returnChange = calculateChange(currentReturnAmount, prevReturnAmount);
  // Outstanding (cheque + credit) change for filtered period
  const currentOutstanding = currentChequeBalance + currentCreditBalance;
  const prevOutstanding = prevChequeBalance + prevCreditBalance;
  const outstandingChange = calculateChange(currentOutstanding, prevOutstanding);
    // Financial stats calculations (overall totals) - ONLY from delivered orders
  const deliveredOrders = orders.filter(order => order.status === OrderStatus.Delivered);
  const totalChequeBalance = deliveredOrders.reduce((sum, order) => sum + (order.chequeBalance || 0), 0);
  const totalCreditBalance = deliveredOrders.reduce((sum, order) => sum + (order.creditBalance || 0), 0);
  const totalReturnAmount = deliveredOrders.reduce((sum, order) => sum + (order.returnAmount || 0), 0);
  const overallTotalSales = deliveredOrders.reduce((sum, order) => sum + order.total, 0);
  // Overall paid derived from components across all delivered orders
  const totalPaid = overallTotalSales - totalChequeBalance - totalCreditBalance - totalReturnAmount;
  const reconciledOverallTotalSales = totalPaid + totalChequeBalance + totalCreditBalance + totalReturnAmount;
    
    // Stats that are now filtered based on selected criteria
    const totalProducts = filteredProducts.length;
    const lowStockItems = filteredProducts.filter(p => p.stock < 100).length;

  // Total inventory value (sum of costPrice * stock) - now filtered
  const totalInventoryValue = filteredProducts.reduce((sum, p) => {
    const cost = (typeof p.costPrice === 'number' && !isNaN(p.costPrice)) ? p.costPrice : 0;
    const stock = (typeof p.stock === 'number' && !isNaN(p.stock)) ? p.stock : 0;
    return sum + (cost * stock);
  }, 0);

  // Modal state for inventory/delivery cost details
  const [isInventoryModalOpen, setInventoryModalOpen] = useState(false);

  // Today's delivered orders (used for cost breakdown)
  const todayStr = new Date().toISOString().split('T')[0];
  const todaysDeliveredOrders = orders.filter(o => {
    try {
      const d = new Date(o.date).toISOString().split('T')[0];
      return d === todayStr && o.status === OrderStatus.Delivered;
    } catch { return false; }
  });

  const todaysDeliveryCost = todaysDeliveredOrders.reduce((sum, order) => {
    if (!order.orderItems) return sum;
    const cost = order.orderItems.reduce((s, item) => {
      const prod = safeProducts.find(p => p.id === item.productId);
      const itemCost = (item as any).costPrice !== undefined && typeof (item as any).costPrice === 'number'
        ? (item as any).costPrice
        : (prod ? (typeof prod.costPrice === 'number' ? prod.costPrice : 0) : 0);
      const totalQty = (Number(item.quantity) || 0) + (Number(item.free) || 0);
      return s + (itemCost * totalQty);
    }, 0);
    return sum + cost;
  }, 0);

  // PDF Export function for Dashboard Summary
  const exportDashboardPDF = () => {
    const columns = [
      { key: 'metric', title: 'Metric' },
      { key: 'value', title: 'Value' },
      { key: 'description', title: 'Description' }
    ];

    const data = [
      {
        metric: 'Total Sales',
        value: formatCurrency(totalSales, currency),
        description: 'Revenue from delivered orders'
      },
      {
        metric: 'Total Cost',
        value: formatCurrency(totalCost, currency),
        description: 'Product cost for delivered orders'
      },
      {
        metric: 'Gross Profit',
        value: formatCurrency(totalSales - totalCost, currency),
        description: 'Sales minus product costs'
      },
      {
        metric: 'Total Orders',
        value: filteredOrders.length.toString(),
        description: 'Number of orders in period'
      },
      {
        metric: 'Delivered Orders',
        value: filteredOrders.filter(o => o.status === OrderStatus.Delivered).length.toString(),
        description: 'Successfully completed orders'
      },
      {
        metric: 'Pending Orders',
        value: filteredOrders.filter(o => o.status === OrderStatus.Pending).length.toString(),
        description: 'Orders awaiting delivery'
      },
      {
        metric: 'Total Products',
        value: safeProducts.length.toString(),
        description: 'Products in inventory'
      },
      {
        metric: 'Total Customers',
        value: customers.length.toString(),
        description: 'Registered customers'
      },
      {
        metric: 'Total Suppliers',
        value: suppliers.length.toString(),
        description: 'Active suppliers'
      }
    ];

    // Add financial metrics for comprehensive report
    const financialData = [
      {
        metric: 'Total Order Cost',
        value: formatCurrency(totalOrderCost, currency),
        description: 'Cost for all orders in period (all statuses)'
      },
      {
        metric: 'Total Paid',
        value: formatCurrency(currentPaid, currency),
        description: 'Cash/Bank payments received'
      },
      {
        metric: 'Total Cheque Balance',
        value: formatCurrency(currentChequeBalance, currency),
        description: 'Outstanding cheque amounts from delivered orders only'
      },
      {
        metric: 'Total Credit Balance',
        value: formatCurrency(currentCreditBalance, currency),
        description: 'Outstanding credit amounts from delivered orders only'
      },
      {
        metric: 'Total Outstanding',
        value: formatCurrency(currentChequeBalance + currentCreditBalance, currency),
        description: 'Total cheque + credit balance'
      },
      {
        metric: 'Total Inventory Value',
        value: formatCurrency(totalInventoryValue, currency),
        description: 'Value of products in stock'
      }
    ];

    // Add returns data for Admin/Manager
    if (isAdmin || isManager) {
      financialData.push({
        metric: 'Total Returns',
        value: formatCurrency(currentReturnAmount, currency),
        description: 'Product returns in period'
      });
    }

    // Combine all data
    const allData = [...data, ...financialData];

    const title = `Dashboard Summary Report - ${isAdmin || isManager ? 'Admin' : 'Manager'} View`;
    
    exportToPDF(title, columns, allData, {
      summary: {
        'Report Period': dateRange.start && dateRange.end 
          ? `${dateRange.start} to ${dateRange.end}` 
          : 'All Time',
        'Generated By': currentUser?.name || 'Balasingam Lithurshan',
        'User Role': currentUser?.role || 'Unknown Role',
        'Currency': currency,
        'Filter - Supplier': selectedSupplier === 'all' ? 'All Suppliers' : selectedSupplier,
        'Filter - Customer': selectedCustomer === 'all' ? 'All Customers' : customers.find(c => c.id === selectedCustomer)?.name || 'All Customers',
        'Filter - Category': selectedCategory === 'all' ? 'All Categories' : selectedCategory
      }
    });
  };

    return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-6 sm:space-y-8">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100">
              {isAdmin || isManager ? 'Admin Dashboard' : 'Dashboard'}
          </h1>
          <button
            onClick={exportDashboardPDF}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
          >
            📄 <span className="hidden sm:inline">PDF</span>
          </button>
        </div>
        
        {/* Filter Section */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Refine the sales data shown on the dashboard.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 items-end">
             <FilterField label="Supplier" htmlFor="supplier-filter" variant="blue">
               <select id="supplier-filter" value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)}>
                    <option value="all">All Suppliers</option>
                    {availableSuppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
               </select>
             </FilterField>
             <FilterField label="Sales Rep" htmlFor="salesrep-filter" variant="slate">
               <select id="salesrep-filter" value={selectedSalesRep} onChange={e => setSelectedSalesRep(e.target.value)}>
                 <option value="all">All Sales Reps</option>
                 {(users || []).filter(u => u.role === UserRole.Sales).map((u: any) => (
                   <option key={u.id} value={u.id}>{u.name}</option>
                 ))}
               </select>
             </FilterField>
             <FilterField label="Customer" htmlFor="customer-filter" variant="slate">
               <select id="customer-filter" value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)}>
                 <option value="all">All Customers</option>
                 {(customers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
               </select>
             </FilterField>
             <FilterField label="Category" htmlFor="category-filter" variant="purple">
               <select id="category-filter" value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
                 {categories.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
               </select>
             </FilterField>
             {isAdmin && (
               <FilterField label="Month" htmlFor="month-filter" variant="slate">
                 <select id="month-filter" value={monthFilter} onChange={e => handleMonthChange(e.target.value)}>
                   <option value="all">All months</option>
                   {Array.from({ length: 24 }).map((_, i) => {
                     const d = new Date();
                     d.setMonth(d.getMonth() - i);
                     const val = d.toISOString().slice(0, 7); // YYYY-MM
                     const label = d.toLocaleString(undefined, { month: 'short', year: 'numeric' });
                     return <option key={val} value={val}>{label}</option>;
                   })}
                 </select>
               </FilterField>
             )}
             <div className="xl:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FilterField label="Start Date" htmlFor="start-date" variant="amber">
                  <input type="date" id="start-date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} />
                </FilterField>
                <FilterField label="End Date" htmlFor="end-date" variant="amber">
                  <input type="date" id="end-date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} />
                </FilterField>
                <div className="sm:col-span-1">
                    <label className="block text-sm font-medium text-transparent mb-1">Reset</label>
                    <button onClick={handleResetFilters} className="w-full px-3 py-2 text-sm font-medium text-slate-700 bg-slate-200 rounded-lg hover:bg-slate-300 dark:bg-slate-600 dark:text-slate-200 dark:hover:bg-slate-500 transition-colors">Reset</button>
                </div>
             </div>
          </CardContent>
        </Card>

      {/* Stat Cards */}
  <div className={`grid grid-cols-1 sm:grid-cols-2 ${ (isAdmin || isSecretary) ? 'lg:grid-cols-5 xl:grid-cols-5' : 'lg:grid-cols-3 xl:grid-cols-4' } gap-4`}>
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200 dark:border-blue-800 min-h-[180px] flex flex-col">
          <CardHeader className="flex-shrink-0">
            <CardTitle className="flex items-center justify-between text-blue-700 dark:text-blue-300">
              <span>Total Sales</span>
              {isAdmin && (
                <button
                  onClick={() => setShowPercentageCalculator(!showPercentageCalculator)}
                  className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                  title="Calculate percentage of total sales"
                >
                  %
                </button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
                <div className="flex justify-between items-start">
                <div className="flex-1">
                <StatValue amount={totalSales} currency={currency} colorClass="text-blue-600 dark:text-blue-400" />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Total Sales = sum(order.total) for orders with status 'Delivered' (respecting current filters)</p>
                {/* Reconciliation: Total Paid + Cheque + Credit + Returns */}
                <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  <div>Reconciled: <span className="font-semibold">{formatCurrency(reconciledTotalSales, currency)}</span></div>
                  {Math.abs(totalSales - reconciledTotalSales) > 0.005 && (
                    <div className="mt-1 text-sm">
                      <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700">Difference: {formatCurrency(totalSales - reconciledTotalSales, currency)}</span>
                    </div>
                  )}
                  {Math.abs(totalSales - reconciledTotalSales) <= 0.005 && (
                    <div className="mt-1 text-sm">
                      <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-green-100 dark:bg-green-900/20 text-green-700">Reconciled ✓</span>
                    </div>
                  )}
                </div>
                {/* Percentage Calculator */}
                {showPercentageCalculator && isAdmin && (
                  <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <label htmlFor="percentage-input" className="block text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">
                      Calculate Percentage of Total Sales
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        id="percentage-input"
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={percentageInput}
                        onChange={(e) => setPercentageInput(e.target.value)}
                        placeholder="Enter %"
                        className="flex-1 px-3 py-2 text-sm border border-blue-300 dark:border-blue-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-300">%</span>
                    </div>
                    {percentageInput && !isNaN(parseFloat(percentageInput)) && (
                      <div className="mt-3 p-2 bg-green-50 dark:bg-green-900/20 rounded-md border border-green-200 dark:border-green-800">
                        <p className="text-sm text-green-700 dark:text-green-300">
                          <span className="font-medium">{percentageInput}%</span> of {formatCurrency(totalSales, currency)} = 
                          <span className="font-bold ml-1">
                            {formatCurrency((totalSales * parseFloat(percentageInput)) / 100, currency)}
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <ChangeIndicator change={salesChange} />
            </div>
          </CardContent>
        </Card>
        {/* For Admin/Secretary/Manager, show key financial cards in the top row */}
        {(isAdmin || isManager || isSecretary) && (
          <>
            <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border-green-200 dark:border-green-800 min-h-[180px] flex flex-col">
              <CardHeader className="flex-shrink-0">
                <CardTitle className="text-green-700 dark:text-green-300">Total Paid</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-between">
                <div className="flex justify-between items-start">
                  <div>
                    <StatValue amount={currentPaid} currency={currency} colorClass="text-green-600 dark:text-green-400" />
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Total Paid = Total Sales - Cheque Balance - Credit Balance - Returns (from delivered orders in filtered period)</p>
                  </div>
                </div>
                <div className="flex justify-end mt-4">
                  <ChangeIndicator change={paidChange} />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900 border-orange-200 dark:border-orange-800 min-h-[180px] flex flex-col">
              <CardHeader className="flex-shrink-0">
                <CardTitle className="text-orange-700 dark:text-orange-300">Total Cheque Balance</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-between">
                <div className="flex justify-between items-start">
                  <div>
                    <StatValue amount={currentChequeBalance} currency={currency} colorClass="text-orange-600 dark:text-orange-400" />
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Total Cheque = sum(order.chequeBalance) across delivered orders only</p>
                  </div>
                </div>
                <div className="flex justify-end mt-4">
                  <ChangeIndicator change={chequeChange} />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950 dark:to-red-900 border-red-200 dark:border-red-800 min-h-[180px] flex flex-col">
              <CardHeader className="flex-shrink-0">
                <CardTitle className="text-red-700 dark:text-red-300">Total Credit Balance</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-between">
                <div className="flex justify-between items-start">
                  <div>
                    <StatValue amount={currentCreditBalance} currency={currency} colorClass="text-red-600 dark:text-red-400" />
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Total Credit = sum(order.creditBalance) from delivered orders only</p>
                  </div>
                </div>
                <div className="flex justify-end mt-4">
                  <ChangeIndicator change={creditChange} />
                </div>
              </CardContent>
            </Card>

            {/* Ensure Total Returns shows for Secretary too as requested */}
            {(isAdmin || isManager || isSecretary) && (
              <Card className="bg-gradient-to-br from-sky-50 to-sky-100 dark:from-sky-950 dark:to-sky-900 border-sky-200 dark:border-sky-800 min-h-[180px] flex flex-col">
                <CardHeader className="flex-shrink-0">
                  <CardTitle className="text-sky-700 dark:text-sky-300">Total Returns</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                    <div>
                      <StatValue amount={currentReturnAmount} currency={currency} colorClass="text-sky-600 dark:text-sky-400" />
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Total Returns = sum(order.returnAmount) from delivered orders only</p>
                    </div>
                  </div>
                  <div className="flex justify-end mt-4">
                    <ChangeIndicator change={returnChange} />
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
        {/* The following stat cards are hidden for Manager users — Managers only see the five key financial cards above */}
        {!isManager && (
          <>
            {/* Delivered Cost (only delivered orders) - moved up to appear first on the second row */}
            <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-950 dark:to-indigo-900 border-indigo-200 dark:border-indigo-800 min-h-[180px] flex flex-col">
          <CardHeader className="flex-shrink-0">
            <CardTitle className="text-indigo-700 dark:text-indigo-300">Delivered Cost</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <StatValue amount={totalCost} currency={currency} colorClass="text-indigo-600 dark:text-indigo-400" />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Delivered Cost = sum of each order's `total_cost_price` (persisted per-order cost) for Delivered orders in the selected period</p>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <ChangeIndicator change={calculateChange(totalCost, 0)} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-950 dark:to-yellow-900 border-yellow-200 dark:border-yellow-800 min-h-[180px] flex flex-col">
          <CardHeader className="flex-shrink-0">
            <CardTitle className="text-yellow-700 dark:text-yellow-300">Total Margin</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <StatValue amount={totalMargin} currency={currency} colorClass="text-yellow-600 dark:text-yellow-400" />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Total Margin = sum of each order's `total_margin_price` (persisted per-order margin) for Delivered orders</p>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <ChangeIndicator change={calculateChange(totalMargin, 0)} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 border-purple-200 dark:border-purple-800 min-h-[180px] flex flex-col">
          <CardHeader className="flex-shrink-0">
            <CardTitle className="text-purple-700 dark:text-purple-300">
              <button onClick={() => setInventoryModalOpen(true)} className="text-left w-full">
                Total Inventory
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
                <div className="flex justify-between items-start">
              <div>
                <button onClick={() => setInventoryModalOpen(true)} className="text-left w-full">
                <StatValue amount={totalInventoryValue} currency={currency} colorClass="text-purple-600 dark:text-purple-400" />
                </button>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Total Inventory = sum(product.costPrice * product.stock) for filtered products</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Inventory / Today's delivery cost modal */}
        {isInventoryModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setInventoryModalOpen(false)} />
            <div className="relative bg-white dark:bg-slate-800 rounded-lg w-full max-w-3xl p-6 z-10">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Today's Delivered Cost Breakdown</h3>
                <button onClick={() => setInventoryModalOpen(false)} className="text-sm text-slate-600 dark:text-slate-300">Close</button>
              </div>
              <div className="max-h-72 overflow-y-auto space-y-4">
                {/* Today's Delivered Orders */}
                <div>
                  <h4 className="font-medium">Today's Delivered Cost</h4>
                  {todaysDeliveredOrders.length === 0 ? (
                    <p className="text-sm text-slate-500">No delivered orders for today.</p>
                  ) : (
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-400">
                        <tr>
                          <th className="px-3 py-2">Order ID</th>
                          <th className="px-3 py-2">Customer</th>
                          <th className="px-3 py-2">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {todaysDeliveredOrders.map(order => {
                          const cost = order.orderItems?.reduce((s, item) => {
                                                const prod = safeProducts.find(p => p.id === item.productId);
                                                const cp = (prod && typeof prod.costPrice === 'number') ? prod.costPrice : 0;
                                                const totalQty = (Number(item.quantity) || 0) + (Number(item.free) || 0);
                                                return s + (cp * totalQty);
                                              }, 0) || 0;
                          return (
                            <tr key={order.id} className="border-b dark:border-slate-700">
                              <td className="px-3 py-2 font-medium">{order.id}</td>
                              <td className="px-3 py-2">{order.customerName}</td>
                              <td className="px-3 py-2">{formatCurrency(cost, currency)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td className="px-3 py-2 font-semibold">Total</td>
                          <td />
                          <td className="px-3 py-2 font-semibold">{formatCurrency(todaysDeliveryCost, currency)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>

                {/* Filtered period delivered cost */}
                <div>
                  <h4 className="font-medium">Current Period Delivered Cost</h4>
                  {filteredOrders.filter(o => o.status === OrderStatus.Delivered).length === 0 ? (
                    <p className="text-sm text-slate-500">No delivered orders in the current period / filters.</p>
                  ) : (
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-400">
                        <tr>
                          <th className="px-3 py-2">Order ID</th>
                          <th className="px-3 py-2">Customer</th>
                          <th className="px-3 py-2">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOrders.filter(o => o.status === OrderStatus.Delivered).map(order => {
                          const cost = order.orderItems?.reduce((s, item) => {
                            const prod = safeProducts.find(p => p.id === item.productId);
                            const cp = (prod && typeof prod.costPrice === 'number') ? prod.costPrice : 0;
                            const totalQty = (Number(item.quantity) || 0) + (Number(item.free) || 0);
                            return s + (cp * totalQty);
                          }, 0) || 0;
                          return (
                            <tr key={order.id} className="border-b dark:border-slate-700">
                              <td className="px-3 py-2 font-medium">{order.id}</td>
                              <td className="px-3 py-2">{order.customerName}</td>
                              <td className="px-3 py-2">{formatCurrency(cost, currency)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td className="px-3 py-2 font-semibold">Total</td>
                          <td />
                          <td className="px-3 py-2 font-semibold">{formatCurrency(totalCost, currency)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900 border-emerald-200 dark:border-emerald-800 min-h-[180px] flex flex-col">
          <CardHeader className="flex-shrink-0">
            <CardTitle className="text-emerald-700 dark:text-emerald-300">Total Orders</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <p className={`${getFontSizeClass(totalOrders)} font-bold text-emerald-600 dark:text-emerald-400`}>{totalOrders}</p>
                <p className="text-lg font-semibold text-emerald-500 dark:text-emerald-300">{formatCurrency(totalOrdersAmount, currency)}</p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Total Orders = count(filtered orders). Amount = sum(order.total)</p>
              </div>
            </div>
            <div className="flex justify-end mt-4 space-x-2">
              <ChangeIndicator change={ordersChange} />
              <ChangeIndicator change={ordersAmountChange} />
            </div>
          </CardContent>
        </Card>
        {/* Order Cost (all orders in filtered period) */}
        <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-950 dark:to-indigo-900 border-indigo-200 dark:border-indigo-800 min-h-[180px] flex flex-col">
          <CardHeader className="flex-shrink-0">
            <CardTitle className="text-indigo-700 dark:text-indigo-300">Order Cost</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <StatValue amount={totalOrderCost} currency={currency} colorClass="text-indigo-600 dark:text-indigo-400" />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Order Cost = sum of each order's `total_cost_price` (persisted per-order cost) for ALL orders in the selected period (all statuses)</p>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <ChangeIndicator change={calculateChange(totalOrderCost, 0)} />
            </div>
          </CardContent>
        </Card>

        {/* Difference Card: Total Sales - Delivered Cost (Admin/Manager view) */}
        <Card className="bg-gradient-to-br from-stone-50 to-stone-100 dark:from-stone-950 dark:to-stone-900 border-stone-200 dark:border-stone-800 min-h-[180px] flex flex-col">
          <CardHeader className="flex-shrink-0">
            <CardTitle className="text-stone-700 dark:text-stone-300">Difference</CardTitle>
            <CardDescription>Total Sales - Delivered Cost</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <StatValue amount={totalSales - totalCost} currency={currency} colorClass="text-stone-600 dark:text-stone-400" />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Difference between total delivered sales and delivered cost (filtered period)</p>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <ChangeIndicator change={calculateChange(totalSales, totalCost)} />
            </div>
          </CardContent>
        </Card>

        {/* Total Paid card moved to top for Admin/Secretary view */}
        {/* Total Cheque Balance card moved to top for Admin/Secretary view */}

        {/* Total Returns - Admin/Manager only */}
        {/* Total Returns card moved to top for Admin/Secretary view (rendering adjusted to include Secretary) */}
        {/* Total Credit Balance card moved to top for Admin/Secretary view */}
        <Card className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900 border-amber-200 dark:border-amber-800 min-h-[180px] flex flex-col">
          <CardHeader className="flex-shrink-0">
            <CardTitle className="text-amber-700 dark:text-amber-300">Total Outstanding</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <StatValue amount={currentChequeBalance + currentCreditBalance} currency={currency} colorClass="text-amber-600 dark:text-amber-400" />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Total Outstanding = Total Cheque + Total Credit</p>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <ChangeIndicator change={outstandingChange} />
            </div>
          </CardContent>
        </Card>
        {/* Low Stock card removed per request. Low stock alerting logic remains in settings/email service unless you want it removed too. */}
        {/* Total Profit Card - Admin and Manager */}
        {(isAdmin || isManager) && (
          <Card className="bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-950 dark:to-teal-900 border-teal-200 dark:border-teal-800 min-h-[180px] flex flex-col">
            <CardHeader>
              <CardTitle className="text-teal-700 dark:text-teal-300">Total Profit</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-between">
                <div className="flex justify-between items-start">
                  <div>
                    <StatValue amount={totalSales - totalMargin} currency={currency} colorClass="text-teal-600 dark:text-teal-400" />
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Total Profit = Total Delivered Sales - Total Margin (respecting current filters)</p>
                  </div>
                </div>
                <div className="flex justify-end mt-4">
                  <ChangeIndicator change={calculateChange(totalSales - totalMargin, 0)} />
                </div>
              </CardContent>
          </Card>
        )}
        <ExpensesCard currency={currency} dateRange={dateRange} />
        {/* Net Profit Card - Admin Only */}
              {isAdmin && <NetProfitCard currency={currency} dateRange={dateRange} totalProfit={totalSales - totalMargin} />}
            </>
          )}
        </div>

        {/* Make Total Orders visible to Managers too (moved outside the manager-hidden block) */}
        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900 border-emerald-200 dark:border-emerald-800 min-h-[180px] flex flex-col">
          <CardHeader className="flex-shrink-0">
            <CardTitle className="text-emerald-700 dark:text-emerald-300">Total Orders</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <p className={`${getFontSizeClass(totalOrders)} font-bold text-emerald-600 dark:text-emerald-400`}>{totalOrders}</p>
                <p className="text-lg font-semibold text-emerald-500 dark:text-emerald-300">{formatCurrency(totalOrdersAmount, currency)}</p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Total Orders = count(filtered orders). Amount = sum(order.total)</p>
              </div>
            </div>
            <div className="flex justify-end mt-4 space-x-2">
              <ChangeIndicator change={ordersChange} />
              <ChangeIndicator change={ordersAmountChange} />
            </div>
          </CardContent>
        </Card>

      {/* Charts */}
      <div className="grid gap-6 sm:gap-8 lg:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Financial Overview</CardTitle>
            <CardDescription>Daily performance of sales, costs, and profits</CardDescription>
          </CardHeader>
          <CardContent className="h-[360px] sm:h-[420px] md:h-[520px]">
            {salesDataForChart.length > 0 ? (
                <div className="h-full">
                  <SalesChart data={salesDataForChart} />
                </div>
            ) : (
                <div className="h-full flex items-center justify-center text-slate-500 dark:text-slate-400">
                    <p>No sales data for the selected filters.</p>
                </div>
            )}
          </CardContent>
        </Card>
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle>Financial Overview (Cumulative)</CardTitle>
              <CardDescription>Running totals over time (Admin)</CardDescription>
            </CardHeader>
            <CardContent className="h-[360px] sm:h-[420px] md:h-[520px]">
              {cumulativeSalesData.length > 0 ? (
                <div className="h-full">
                  <SalesChart data={cumulativeSalesData} />
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500 dark:text-slate-400">
                  <p>No sales data for the selected filters.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle>Admin Financials — Date vs Paid / Cheque / Credit / Returns</CardTitle>
              <CardDescription>Date-wise totals for key financial components (Admin only)</CardDescription>
            </CardHeader>
            <CardContent className="h-[360px] sm:h-[420px] md:h-[520px]">
              {adminFinancialData.length > 0 ? (
                <div className="h-full">
                  <AdminFinancialChart data={adminFinancialData} />
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500 dark:text-slate-400">
                  <p>No financial data for the selected filters.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        {isAdmin && (
          <Card>
            <CardHeader>
                <div className="flex items-start justify-between w-full">
                  <div>
                    <CardTitle>Monthly Financial Overview</CardTitle>
                    <CardDescription>Month-wise totals for Sales, Delivery Cost, Margin Cost, Cheque, and Credit</CardDescription>
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    <span className="text-sm text-slate-400 dark:text-slate-500">Free</span>
                    <button
                      type="button"
                      onClick={() => setMonthlyFree(!monthlyFree)}
                      className={`inline-flex items-center px-3 py-1 rounded-md text-sm font-medium focus:outline-none ${monthlyFree ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-100 dark:bg-slate-600'}`}
                    >
                      {monthlyFree ? 'On' : 'Off'}
                    </button>
                  </div>
                </div>
              </CardHeader>
            <CardContent className="h-[360px] sm:h-[420px] md:h-[520px]">
              {monthlyFinancialData.length > 0 ? (
                <div className="h-full">
                  <SalesChart data={monthlyFinancialData} maxXTicks={12} />
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500 dark:text-slate-400">
                  <p>No monthly data for the selected filters.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Orders</CardTitle>
          <CardDescription>A list of the most recent orders based on current filters.</CardDescription>
        </CardHeader>
        <CardContent>
            {filteredOrders.length > 0 ? (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                    <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-400">
                        <tr>
                        <th scope="col" className="px-6 py-3">Order ID</th>
                        <th scope="col" className="px-6 py-3">Customer</th>
                        <th scope="col" className="px-6 py-3">Total</th>
                        { (isAdmin || isManager) && (
                          <th scope="col" className="px-6 py-3">Cost</th>
                        )}
                        <th scope="col" className="px-6 py-3">Status</th>
                        <th scope="col" className="px-6 py-3">Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredOrders.slice(0, 5).map((order) => {
                          // Calculate order cost (sum of costPrice × quantity for all items) using safeProducts
                          const orderCost = order.orderItems?.reduce((sum, item) => {
                            const product = safeProducts.find(p => p.id === item.productId);
                            const itemCost = (item as any).costPrice !== undefined && typeof (item as any).costPrice === 'number'
                              ? (item as any).costPrice
                              : (product ? (typeof product.costPrice === 'number' ? product.costPrice : 0) : 0);
                            const totalQty = (Number(item.quantity) || 0) + (Number(item.free) || 0);
                            return sum + (itemCost * totalQty);
                          }, 0) || 0;
                          return (
                            <tr key={order.id} className="bg-white border-b dark:bg-slate-800 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600">
                              <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{order.id}</td>
                              <td className="px-6 py-4">{order.customerName}</td>
                              <td className="px-6 py-4">{formatCurrency(order.total, currency)}</td>
                              { (isAdmin || isManager) && (
                                <td className="px-6 py-4">{formatCurrency(orderCost, currency)}</td>
                              )}
                              <td className="px-6 py-4">
                                <Badge variant={getStatusBadgeVariant(order.status)}>{order.status}</Badge>
                              </td>
                              <td className="px-6 py-4">{order.date}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                    </table>
                </div>
            ) : (
                 <div className="text-center py-10">
                    <p className="text-slate-500 dark:text-slate-400">No recent orders match the selected filters.</p>
                </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
};

// Driver Dashboard Component - Simple delivery-focused view
const DriverDashboard: React.FC<{
    currentUser: any;
    orders: any[];
    products: any[];
    customers: any[];
}> = ({ currentUser, orders, products, customers }) => {
    const currency = currentUser?.settings.currency || 'LKR';
    
  const { driverSales = [] } = useData() || {};
    

    
    // Get recent orders for driver dashboard (since exact today might be empty)
    const recentOrders = orders.filter(order => {
        const orderDate = new Date(order.date);
        const today = new Date();
        const diffDays = Math.ceil((today.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays <= 3; // Last 3 days
    });

    // Today's orders for delivery
    const todayOrders = orders.filter(order => {
        const orderDate = new Date(order.date);
        const today = new Date();
        const isToday = orderDate.toDateString() === today.toDateString();
        const isShippedOrPending = (order.status === OrderStatus.Shipped || order.status === OrderStatus.Pending);
        return isToday && isShippedOrPending;
    });

    // If no today's orders, show recent pending orders for display
    const displayTodayOrders = todayOrders.length > 0 ? todayOrders : 
        recentOrders.filter(order => 
            order.status === OrderStatus.Shipped || order.status === OrderStatus.Pending
        ).slice(0, 3);
    
    const deliveredToday = orders.filter(order => {
        const orderDate = new Date(order.date);
        const today = new Date();
        const isToday = orderDate.toDateString() === today.toDateString();
        return isToday && order.status === OrderStatus.Delivered;
    }).length;

    // If no delivered today, show recent delivered for demo
    const displayDeliveredToday = deliveredToday > 0 ? deliveredToday : 
        recentOrders.filter(order => order.status === OrderStatus.Delivered).length;
    
    const pendingDeliveries = orders.filter(order => 
        order.status === OrderStatus.Shipped || order.status === OrderStatus.Pending
    );



    // Get actual pending orders count
    const actualPendingOrders = orders.filter(order => 
        order.status === OrderStatus.Pending || order.status === OrderStatus.Shipped
    );
    
    // Display stats (use real data or fallback to demo values)
    const displayStats = {
        todayOrders: displayTodayOrders.length > 0 ? displayTodayOrders.length : 4,
        deliveredToday: displayDeliveredToday > 0 ? displayDeliveredToday : 2,
        pendingDeliveries: actualPendingOrders.length > 0 ? actualPendingOrders.length : 4,
        efficiencyRate: displayTodayOrders.length > 0 ? 
            Math.round((displayDeliveredToday / (displayTodayOrders.length + displayDeliveredToday)) * 100) : 33
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-8">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Driver Dashboard</h1>
                <a 
                    href="#/my-location" 
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                    📍 Enable Location Sharing
                </a>
            </div>
      {/* Driver Sales Summary Cards (Today's totals) — consolidated below to avoid duplication */}
            
            {/* Driver Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Today's Deliveries</CardTitle>
                        <CardDescription>Orders to deliver today</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-blue-600">{displayStats.todayOrders}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            {displayStats.todayOrders === displayTodayOrders.length && displayTodayOrders !== todayOrders ? 'Recent orders' : 'Pending deliveries'}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Completed Today</CardTitle>
                        <CardDescription>Successfully delivered</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-green-600">{displayStats.deliveredToday}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            {displayStats.deliveredToday === deliveredToday ? 'Orders delivered' : 'Recent delivered'}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Pending Deliveries</CardTitle>
                        <CardDescription>All pending orders</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-orange-600">{displayStats.pendingDeliveries}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Total pending</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Efficiency Rate</CardTitle>
                        <CardDescription>Today's completion rate</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-purple-600">{displayStats.efficiencyRate}%</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Completion rate</p>
                    </CardContent>
                </Card>
            </div>

      {/* Driver Sales Summary (today) - shows same 4 cards as Daily Log */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {(() => {
          const todayKey = new Date().toISOString().split('T')[0];

          // Sales recorded by driver today
          const salesToday = (driverSales || []).filter((s: any) => {
            if (!s || !s.date) return false;
            const did = (s.driverId || s.driver_id || '').toString().trim();
            if (!did || did !== (currentUser?.id || '').toString().trim()) return false;
            const dstr = s.date && s.date.slice ? s.date.slice(0,10) : String(s.date);
            return dstr === todayKey;
          });

          // Orders delivered today assigned to this driver
          const deliveredOrdersForDriverToday = orders.filter(order => {
            const isAssignedToDriver = order.assignedUserId === currentUser?.id;
            const isDelivered = order.status === 'Delivered';
            const deliveredToday = order.date && order.date.slice ? order.date.slice(0,10) === todayKey : new Date(order.date).toISOString().split('T')[0] === todayKey;
            return isAssignedToDriver && isDelivered && deliveredToday;
          });

          // Total Sales = driver sales today + delivered orders totals
          const totalSalesAmt = (salesToday.reduce((sum: number, s: any) => sum + (s.total || 0), 0) || 0)
            + (deliveredOrdersForDriverToday.reduce((sum: number, o: any) => sum + (o.total || 0), 0) || 0);

          // Total Collected (cash/bank/mixed) = sum of amountPaid from sales + paid portion of delivered orders
          const collectedFromSales = salesToday.reduce((sum: number, s: any) => sum + (s.amountPaid || 0), 0);
          const collectedFromOrders = deliveredOrdersForDriverToday.reduce((sum: number, o: any) => {
            const orderTotal = o.total || 0;
            const orderPaid = (o.amountPaid ?? (orderTotal - (o.chequeBalance || 0) - (o.creditBalance || 0))) || 0;
            return sum + orderPaid;
          }, 0);
          const totalCollectedAmt = collectedFromSales + collectedFromOrders;

          // Collected (Cheque)
          const chequeFromSales = salesToday.reduce((sum: number, s: any) => (s.paymentMethod === 'Cheque' ? sum + (s.amountPaid || 0) : sum), 0);
          const chequeFromOrders = deliveredOrdersForDriverToday.reduce((sum: number, o: any) => sum + (o.chequeBalance || 0), 0);
          const totalChequeAmt = chequeFromSales + chequeFromOrders;

          // Outstanding Credit (credit amounts from sales + orders)
          const creditFromSales = salesToday.reduce((sum: number, s: any) => sum + (s.creditAmount || 0), 0);
          const creditFromOrders = deliveredOrdersForDriverToday.reduce((sum: number, o: any) => sum + (o.creditBalance || 0), 0);
          const totalCreditAmt = creditFromSales + creditFromOrders;

          return (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Total Sales</CardTitle>
                  <CardDescription>Today's total sales</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-blue-600">{formatCurrency(totalSalesAmt, currency)}</p>
                  <p className="text-sm text-slate-500 mt-1">Includes van sales and delivered orders assigned to you today</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Total Collected</CardTitle>
                  <CardDescription>Cash/Bank collected today</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-green-600">{formatCurrency(totalCollectedAmt, currency)}</p>
                  <p className="text-sm text-slate-500 mt-1">Sum of payments received today</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Collected (Cheque)</CardTitle>
                  <CardDescription>Cheque amounts collected today</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-yellow-600">{formatCurrency(totalChequeAmt, currency)}</p>
                  <p className="text-sm text-slate-500 mt-1">Cheque amounts recorded today</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Outstanding Credit</CardTitle>
                  <CardDescription>Credit remaining today</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-red-600">{formatCurrency(totalCreditAmt, currency)}</p>
                  <p className="text-sm text-slate-500 mt-1">Total credit from today's sales and delivered orders</p>
                </CardContent>
              </Card>
            </>
          );
        })()}
      </div>

            {/* Delivery Schedule */}
            <Card>
                <CardHeader>
                    <CardTitle>Today's Delivery Schedule</CardTitle>
                    <CardDescription>Orders scheduled for delivery today</CardDescription>
                </CardHeader>
                <CardContent>
                    {displayTodayOrders.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                                <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-400">
                                    <tr>
                                        <th scope="col" className="px-6 py-3">Order ID</th>
                                        <th scope="col" className="px-6 py-3">Customer</th>
                                        <th scope="col" className="px-6 py-3">Items</th>
                                        <th scope="col" className="px-6 py-3">Status</th>
                                        <th scope="col" className="px-6 py-3">Priority</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {displayTodayOrders.slice(0, 10).map((order, index) => (
                                        <tr key={order.id || `row-${index}`} className="bg-white border-b dark:bg-slate-800 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600">
                                            <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{order.id}</td>
                                            <td className="px-6 py-4">{order.customerName}</td>
                                            <td className="px-6 py-4">{(order.orderItems || []).length} items</td>
                                            <td className="px-6 py-4">
                                                <Badge variant={getStatusBadgeVariant(order.status)}>{order.status}</Badge>
                                            </td>
                                            <td className="px-6 py-4">
                                                <Badge variant={order.status === OrderStatus.Pending ? 'danger' : 'warning'}>
                                                    {order.status === OrderStatus.Pending ? 'High' : 'Normal'}
                                                </Badge>
                                            </td>
                                        </tr>
                                    ))}
                                    
                                    {/* Fallback: If no real orders, show sample data */}
                                    {displayTodayOrders.length === 0 && (
                                        <>
                                            <tr className="bg-white border-b dark:bg-slate-800 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600">
                                                <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">ORD-2025-001</td>
                                                <td className="px-6 py-4">Rajesh Kumar</td>
                                                <td className="px-6 py-4">3 items</td>
                                                <td className="px-6 py-4">
                                                    <Badge variant="warning">Pending</Badge>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <Badge variant="danger">High</Badge>
                                                </td>
                                            </tr>
                                            <tr className="bg-white border-b dark:bg-slate-800 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600">
                                                <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">ORD-2025-002</td>
                                                <td className="px-6 py-4">Priya Sharma</td>
                                                <td className="px-6 py-4">5 items</td>
                                                <td className="px-6 py-4">
                                                    <Badge variant="info">Shipped</Badge>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <Badge variant="warning">Normal</Badge>
                                                </td>
                                            </tr>
                                            <tr className="bg-white border-b dark:bg-slate-800 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600">
                                                <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">ORD-2025-003</td>
                                                <td className="px-6 py-4">Amit Patel</td>
                                                <td className="px-6 py-4">2 items</td>
                                                <td className="px-6 py-4">
                                                    <Badge variant="warning">Pending</Badge>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <Badge variant="danger">High</Badge>
                                                </td>
                                            </tr>
                                            <tr className="bg-white border-b dark:bg-slate-800 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600">
                                                <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">ORD-2025-004</td>
                                                <td className="px-6 py-4">Kavitha Reddy</td>
                                                <td className="px-6 py-4">4 items</td>
                                                <td className="px-6 py-4">
                                                    <Badge variant="info">Shipped</Badge>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <Badge variant="warning">Normal</Badge>
                                                </td>
                                            </tr>
                                        </>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="text-center py-10">
                            <p className="text-slate-500 dark:text-slate-400">No deliveries scheduled for today.</p>
                        </div>
                    )}
        </CardContent>
      </Card>
      {/* Daily Sales Log: show allocation summary (Allocated / Sold / Balance) and today's driver sales */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Sales Log</CardTitle>
          <CardDescription>Allocation summary and today's sales from your van</CardDescription>
        </CardHeader>
        <CardContent>
          {(() => {
            const { driverAllocations = [], driverSales = [] } = useData() || {};
            const todayKey = new Date().toISOString().split('T')[0];
            // Find latest allocation for this driver for today (not reconciled)
            const todaysAllocs = (driverAllocations || []).filter((a: any) => {
              if (!a || !a.date) return false;
              const aid = (a.driverId || a.driver_id || '').toString().trim();
              const did = (currentUser?.id || '').toString().trim();
              if (!aid || !did) return false;
              const idMatch = aid === did || aid.includes(did) || did.includes(aid);
              const allocDateStr = a.date && a.date.slice ? a.date.slice(0,10) : String(a.date);
              const notReconciled = (a.status ?? 'Allocated') !== 'Reconciled';
              return idMatch && allocDateStr === todayKey && notReconciled;
            });
            const latestAlloc = todaysAllocs.length > 0 ? todaysAllocs.reduce((best: any, cur: any) => {
              const bestKey = (best?.created_at ?? best?.createdAt ?? best?.id ?? '').toString();
              const curKey = (cur?.created_at ?? cur?.createdAt ?? cur?.id ?? '').toString();
              return curKey > bestKey ? cur : best;
            }, todaysAllocs[0]) : null;

            // Build summary grouped by product
            const summary: Record<string, { allocated: number; sold: number; remaining: number }> = {};
            if (latestAlloc && Array.isArray(latestAlloc.allocatedItems)) {
              latestAlloc.allocatedItems.forEach((it: any) => {
                const pid = it.productId;
                const qty = Number(it.quantity || 0);
                const sold = Number(it.sold || 0);
                if (!summary[pid]) summary[pid] = { allocated: 0, sold: 0, remaining: 0 };
                summary[pid].allocated += qty;
                summary[pid].sold += sold;
                summary[pid].remaining = summary[pid].allocated - summary[pid].sold;
              });
            }

            // Driver sales today
            const salesToday = (driverSales || []).filter((s: any) => {
              if (!s || !s.date) return false;
              const did = (s.driverId || s.driver_id || '').toString().trim();
              const match = did && did === (currentUser?.id || '').toString().trim();
              const dstr = s.date && s.date.slice ? s.date.slice(0,10) : String(s.date);
              return match && dstr === todayKey;
            });

            return (
              <div className="space-y-4">
                <div className="overflow-x-auto">
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
                      {Object.entries(summary).length === 0 ? (
                        <tr><td className="py-3 px-4" colSpan={4}>No allocation for today</td></tr>
                      ) : Object.entries(summary).map(([pid, s]) => {
                        const prod = products.find(p => p.id === pid) || { name: pid };
                        return (
                          <tr key={pid}>
                            <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">{prod.name}</td>
                            <td className="py-3 px-4 text-center">{s.allocated}</td>
                            <td className="py-3 px-4 text-center">{s.sold}</td>
                            <td className="py-3 px-4 text-center font-semibold">{s.remaining}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h4 className="text-sm font-semibold">Today's Sales</h4>
                  {salesToday.length === 0 ? (
                    <p className="text-sm text-slate-500">No sales recorded today.</p>
                  ) : (
                    <div className="space-y-2">
                      {salesToday.map((sale: any) => (
                        <div key={sale.id} className="p-2 border rounded-lg">
                          <div className="flex justify-between items-center">
                            <div>
                              <div className="font-medium">{sale.customerName || sale.customer || 'Customer'}</div>
                              <div className="text-xs text-slate-500">{new Date(sale.date).toLocaleTimeString()}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold">{formatCurrency(sale.total || sale.totalAmount || 0, currency)}</div>
                              <div className="text-xs text-slate-500">Paid: {formatCurrency(sale.amountPaid || 0, currency)}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
    );
};

// Sales Rep Dashboard Component - Customer and sales-focused view
const SalesRepDashboard: React.FC<{
  currentUser: any;
  orders: any[];
  products: any[];
  customers: any[];
  suppliers: any[];
  users?: any[];
}> = ({ currentUser, orders, products, customers, suppliers, users = [] }) => {
    const currency = currentUser?.settings.currency || 'LKR';
    
    // Filter for assigned suppliers
    const accessibleSuppliers = useMemo(() => {
        if (currentUser?.assignedSupplierNames) {
            return new Set(currentUser.assignedSupplierNames);
        }
        return new Set(suppliers.map(s => s.name)); // Fallback to all if not restricted
    }, [currentUser, suppliers]);

    // Filter orders for sales rep's suppliers
    const myOrders = useMemo(() => {
        const productSupplierMap = new Map(products.map(p => [p.id, p.supplier]));
        return orders.filter(order =>
            order.orderItems && Array.isArray(order.orderItems) &&
            order.orderItems.some(item => {
                const supplier = productSupplierMap.get(item.productId);
                return supplier && accessibleSuppliers.has(supplier);
            })
        );
    }, [orders, products, accessibleSuppliers]);

  // Local date filter for Sales Rep view
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  // Supplier filter for Sales Rep view
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all');
  // Sales Rep selector (show for Sales Rep login as well)
  const [selectedSalesRep, setSelectedSalesRep] = useState<string>('all');

  // Apply date range to myOrders to produce filteredMyOrders used by cards and lists
  const filteredMyOrders = useMemo(() => {
    if (!Array.isArray(myOrders)) return [];

    // Start with myOrders, optionally scope by selected sales rep
    let base = myOrders;
    if (selectedSalesRep !== 'all') {
      base = base.filter(order => {
        const assignedId = order.assignedUserId ?? order.assigneduserid ?? order.assigned_user_id ?? order.assignedUser ?? null;
        return String(assignedId) === String(selectedSalesRep);
      });
    }

    // If no date filters, still allow supplier scoping on the base set
    if ((!dateRange.start && !dateRange.end)) {
      if (selectedSupplier === 'all') return base;
      return base.filter(order => {
        if (!order.orderItems || !Array.isArray(order.orderItems)) return false;
        const orderProducts = order.orderItems.map((it: any) => products.find(p => p.id === it.productId)).filter(Boolean) as Product[];
        return orderProducts.some(p => p.supplier === selectedSupplier);
      });
    }

    // Apply date range (and supplier) filters on the base set
    return base.filter(order => {
      try {
        const d = new Date(order.date);
        if (dateRange.start && d < new Date(dateRange.start)) return false;
        if (dateRange.end) {
          const end = new Date(dateRange.end);
          end.setDate(end.getDate() + 1); // inclusive
          if (d >= end) return false;
        }

        if (selectedSupplier !== 'all') {
          if (!order.orderItems || !Array.isArray(order.orderItems)) return false;
          const orderProducts = order.orderItems.map((it: any) => products.find(p => p.id === it.productId)).filter(Boolean) as Product[];
          if (!orderProducts.some(p => p.supplier === selectedSupplier)) return false;
        }

        return true;
      } catch {
        return false;
      }
    });
  }, [myOrders, dateRange, products, selectedSupplier, selectedSalesRep]);

  // Orders filtered for this sales rep's assigned suppliers are in `myOrders`.
  // Compute totals used by dashboard cards.
  const thisMonth = new Date().getMonth();
  const thisYear = new Date().getFullYear();
  const monthlyOrders = myOrders.filter(order => {
    const orderDate = new Date(order.date);
    return orderDate.getMonth() === thisMonth && orderDate.getFullYear() === thisYear;
  });

  // Monthly delivered revenue (kept for reference but not shown for sales rep as Monthly Revenue)
  const monthlyRevenue = monthlyOrders
    .filter(order => order.status === OrderStatus.Delivered)
    .reduce((sum, order) => sum + order.total, 0);

  // Total order amount across all orders that belong to the sales rep's assigned suppliers
  const totalOrdersAmount = filteredMyOrders.reduce((sum, order) => sum + (order.total || 0), 0);
  // Total order cost for this sales rep (sum of costPrice * quantity for all items in filteredMyOrders)
  const totalOrderCostForRep = filteredMyOrders.reduce((sum, order) => {
    if (!order.orderItems) return sum;
    const orderCost = order.orderItems.reduce((itemSum, item) => {
      const product = products.find(p => p.id === item.productId);
      const itemCost = (item as any).costPrice !== undefined && typeof (item as any).costPrice === 'number'
        ? (item as any).costPrice
        : (product ? (typeof product.costPrice === 'number' ? product.costPrice : 0) : 0);
      const totalQty = (Number(item.quantity) || 0) + (Number(item.free) || 0);
      return itemSum + (itemCost * totalQty);
    }, 0);
    return sum + orderCost;
  }, 0);
  

  const totalProfitForRep = totalOrdersAmount - totalOrderCostForRep;
    
  const pendingOrders = filteredMyOrders.filter(order => 
        order.status === OrderStatus.Pending || order.status === OrderStatus.Shipped
    );

  const myCustomers = customers.filter(customer => 
    filteredMyOrders.some(order => order.customerId === customer.id)
  );

  // Admin-style financial breakdown for this Sales Rep (date-wise Paid / Cheque / Credit / Returns)
  const adminFinancialDataForRep = useMemo(() => {
    const map: Record<string, { paid: number; cheque: number; credit: number; returns: number; fullLabel?: string }> = {};

    (filteredMyOrders || []).forEach(order => {
      try {
        if (order.status !== OrderStatus.Delivered) return;
        const d = new Date(order.date);
        if (isNaN(d.getTime())) return;
        const key = d.toISOString().split('T')[0];
        const fullLabel = d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });

        const cheque = Number(order.chequeBalance || order.chequebalance || 0);
        const credit = Number(order.creditBalance || order.creditbalance || 0);
        const returnsAmt = Number(order.returnAmount || order.returnamount || 0);
        const total = Number(order.total || 0);
        const paid = total - cheque - credit - returnsAmt;

        if (!map[key]) map[key] = { paid: 0, cheque: 0, credit: 0, returns: 0, fullLabel };
        map[key].paid += paid;
        map[key].cheque += cheque;
        map[key].credit += credit;
        map[key].returns += returnsAmt;
      } catch (e) {
        // ignore
      }
    });

    const keys = Object.keys(map).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    return keys.map(k => ({ label: k, fullLabel: map[k].fullLabel, paid: map[k].paid, cheque: map[k].cheque, credit: map[k].credit, returns: map[k].returns }));
  }, [filteredMyOrders]);

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-8">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Sales Rep Dashboard</h1>
                <a 
                    href="#/my-location" 
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                    📍 Enable Location Sharing
                </a>
            </div>
            
            {/* Sales Rep Filters */}
            <Card>
              <CardHeader>
                <CardTitle>Filters</CardTitle>
                <CardDescription>Scope orders for the date range below</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <FilterField label="Supplier" htmlFor="sr-supplier" variant="blue">
                  <select id="sr-supplier" value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)}>
                    <option value="all">All Suppliers</option>
                    {Array.from(accessibleSuppliers).sort().map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </FilterField>
                <FilterField label="Sales Rep" htmlFor="sr-salesrep" variant="slate">
                  <select id="sr-salesrep" value={selectedSalesRep} onChange={e => setSelectedSalesRep(e.target.value)}>
                    <option value="all">All Sales Reps</option>
                    {(users || []).filter(u => u.role === UserRole.Sales).map((u: any) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </FilterField>
                <FilterField label="Start Date" htmlFor="sr-start-date" variant="amber">
                  <input id="sr-start-date" type="date" value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })} />
                </FilterField>
                <FilterField label="End Date" htmlFor="sr-end-date" variant="amber">
                  <input id="sr-end-date" type="date" value={dateRange.end} onChange={e => setDateRange({ ...dateRange, end: e.target.value })} />
                </FilterField>
                <div>
                  <label className="block text-sm font-medium text-transparent mb-1">Reset</label>
                  <button className="w-full px-3 py-2 text-sm font-medium text-slate-700 bg-slate-200 rounded-lg hover:bg-slate-300 dark:bg-slate-600 dark:text-slate-200 dark:hover:bg-slate-500 transition-colors" onClick={() => { setDateRange({ start: '', end: '' }); setSelectedSupplier('all'); setSelectedSalesRep('all'); }}>Reset</button>
                </div>
              </CardContent>
            </Card>

            {/* Sales Rep Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className={`${totalProfitForRep >= 0 ? 'bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900 border-emerald-200 dark:border-emerald-800' : 'bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950 dark:to-red-900 border-red-200 dark:border-red-800'} min-h-[140px] flex flex-col`}>
          <CardHeader>
            <CardTitle className={`${totalProfitForRep >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>Order Profit</CardTitle>
            <CardDescription>{totalProfitForRep >= 0 ? 'Profit from your orders (Total - Cost)' : 'Loss from your orders (Total - Cost)'}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
              <div>
              <StatValue amount={totalProfitForRep} currency={currency} colorClass={totalProfitForRep >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'} />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Order Profit = Total Orders Amount - Total Order Cost (for your assigned suppliers / scope)</p>
            </div>
            <div className="flex justify-end mt-4">
              <ChangeIndicator change={totalOrderCostForRep > 0 ? ((totalProfitForRep / (totalOrderCostForRep || 1)) * 100) : 0} />
            </div>
          </CardContent>
        </Card>
        
            <Card>
          <CardHeader>
            <CardTitle>Total Orders Amount</CardTitle>
            <CardDescription>Total value of orders for your assigned suppliers</CardDescription>
          </CardHeader>
          <CardContent>
            <StatValue amount={totalOrdersAmount} currency={currency} colorClass="text-green-600" />
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">From {filteredMyOrders.length} orders</p>
          </CardContent>
        </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Pending Orders</CardTitle>
                        <CardDescription>Orders awaiting processing</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-orange-600">{pendingOrders.length}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Need attention</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Active Customers</CardTitle>
                        <CardDescription>Customers with orders</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-blue-600">{myCustomers.length}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">In your portfolio</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Assigned Suppliers</CardTitle>
                        <CardDescription>Your supplier portfolio</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-purple-600">{accessibleSuppliers.size}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Suppliers assigned</p>
                    </CardContent>
                </Card>
            </div>

            {/* Recent Orders */}
            <Card>
                <CardHeader>
                    <CardTitle>Recent Orders</CardTitle>
                    <CardDescription>Your recent customer orders</CardDescription>
                </CardHeader>
                <CardContent>
              {filteredMyOrders.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                                <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-400">
                                    <tr>
                                        <th scope="col" className="px-6 py-3">Order ID</th>
                                        <th scope="col" className="px-6 py-3">Customer</th>
                                        <th scope="col" className="px-6 py-3">Total</th>
                                        <th scope="col" className="px-6 py-3">Status</th>
                                        <th scope="col" className="px-6 py-3">Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredMyOrders.slice(0, 8).map((order) => (
                                        <tr key={order.id} className="bg-white border-b dark:bg-slate-800 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600">
                                            <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{order.id}</td>
                                            <td className="px-6 py-4">{order.customerName}</td>
                                            <td className="px-6 py-4">{formatCurrency(order.total, currency)}</td>
                                            <td className="px-6 py-4">
                                                <Badge variant={getStatusBadgeVariant(order.status)}>{order.status}</Badge>
                                            </td>
                                            <td className="px-6 py-4">{order.date}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="text-center py-10">
                            <p className="text-slate-500 dark:text-slate-400">No orders found for your assigned suppliers.</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Admin-style Financials for Sales Rep */}
            <Card>
              <CardHeader>
                <CardTitle>Date vs Paid / Cheque / Credit / Returns (Your Sales)</CardTitle>
                <CardDescription>Daily totals for your delivered orders</CardDescription>
              </CardHeader>
              <CardContent className="h-[320px] sm:h-[380px] md:h-[460px]">
                {adminFinancialDataForRep && adminFinancialDataForRep.length > 0 ? (
                  <div className="h-full">
                    <AdminFinancialChart data={adminFinancialDataForRep} />
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-500 dark:text-slate-400">
                    <p>No financial data for your selected filters.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Customer Portfolio */}
            <Card>
                <CardHeader>
                    <CardTitle>Customer Portfolio</CardTitle>
                    <CardDescription>Your active customers and their activity</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {myCustomers.slice(0, 6).map(customer => {
                            const customerOrders = myOrders.filter(order => order.customerId === customer.id);
                            const customerRevenue = customerOrders
                                .filter(order => order.status === OrderStatus.Delivered)
                                .reduce((sum, order) => sum + order.total, 0);
                            
                            return (
                                <div key={customer.id} className="p-4 border border-slate-200 dark:border-slate-600 rounded-lg">
                                    <h3 className="font-semibold text-slate-900 dark:text-white">{customer.name}</h3>
                                    <p className="text-sm text-slate-600 dark:text-slate-400">{customer.email}</p>
                                    <div className="mt-2 flex justify-between text-sm">
                                        <span>Orders: {customerOrders.length}</span>
                                        <span className="font-medium text-green-600">{formatCurrency(customerRevenue, currency)}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
