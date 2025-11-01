﻿import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { SalesChart } from '../charts/SalesChart';
import { TopProductsChart } from '../charts/TopProductsChart';
import { OrderStatus, Product, UserRole } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { supabase } from '../../supabaseClient';

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

// Expenses Card Component
const ExpensesCard: React.FC<{ currency: string; dateRange: { start: string; end: string } }> = ({ currency, dateRange }) => {
    const [expenses, setExpenses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchExpenses = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase.from('expenses').select('*').order('date', { ascending: false });
            
            if (error) {
                // If error, try localStorage fallback
                try {
                    const local = localStorage.getItem('app_expenses_v1');
                    setExpenses(local ? JSON.parse(local) : []);
                } catch {
                    setExpenses([]);
                }
            } else {
                setExpenses(data || []);
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
            // If no date filter, show current month
            const currentMonth = new Date().getMonth();
            const currentYear = new Date().getFullYear();
            return expenses.filter(expense => {
                const expenseDate = new Date(expense.date);
                return expenseDate.getMonth() === currentMonth && expenseDate.getFullYear() === currentYear;
            });
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
    const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);

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

    const prevTotalExpenses = previousPeriodExpenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);
    
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
                  <p className={`${getFontSizeClass(formatCurrency(totalExpenses, currency))} font-bold text-pink-600 dark:text-pink-400`}>{formatCurrency(totalExpenses, currency)}</p>
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
    totalSales: number; 
    totalCost: number; 
}> = ({ currency, dateRange, totalSales, totalCost }) => {
    const [expenses, setExpenses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchExpenses = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase.from('expenses').select('*').order('date', { ascending: false });
            
            if (error) {
                // If error, try localStorage fallback
                try {
                    const local = localStorage.getItem('app_expenses_v1');
                    setExpenses(local ? JSON.parse(local) : []);
                } catch {
                    setExpenses([]);
                }
            } else {
                setExpenses(data || []);
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
        if (!dateRange.start && !dateRange.end) {
            // If no date filter, show current month
            const currentMonth = new Date().getMonth();
            const currentYear = new Date().getFullYear();
            return expenses.filter(expense => {
                const expenseDate = new Date(expense.date);
                return expenseDate.getMonth() === currentMonth && expenseDate.getFullYear() === currentYear;
            });
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
    const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);
    
    // Calculate gross profit (Sales - Cost)
    const grossProfit = totalSales - totalCost;
    
    // Calculate net profit (Gross Profit - Expenses)
    const netProfit = grossProfit - totalExpenses;
    
    // Calculate net profit margin
    const netProfitMargin = totalSales > 0 ? (netProfit / totalSales * 100) : 0;
    
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
                  <p className={`${getFontSizeClass(formatCurrency(netProfit, currency))} font-bold ${amountColor}`}>
                      {formatCurrency(netProfit, currency)}
                  </p>
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
      suppliers = []
    } = useData() || {};

    // Early return for unauthorized access
    if (!currentUser) {
        return <div className="p-8 text-center">Please log in to access the dashboard.</div>;
    }

    // Role-based dashboard rendering
    const isAdmin = currentUser.role === UserRole.Admin;
    const isManager = currentUser.role === UserRole.Manager;
    const isSalesRep = currentUser.role === UserRole.Sales;
    const isDriver = currentUser.role === UserRole.Driver;

    // Driver Dashboard - Simple delivery-focused view
    if (isDriver) {
        return <DriverDashboard currentUser={currentUser} orders={orders} products={products} customers={customers} />;
    }

    // Sales Rep Dashboard - Customer and sales-focused view
    if (isSalesRep) {
        return <SalesRepDashboard currentUser={currentUser} orders={orders} products={products} customers={customers} suppliers={suppliers} />;
    }

    // Admin/Manager Dashboard - Full detailed view (existing functionality)
    // Defensive fallback for products array
    const safeProducts = Array.isArray(products) ? products : [];
    // Compute top products by stock from products
    const topProducts = useMemo(() => {
      return safeProducts
        .slice()
        .sort((a, b) => b.stock - a.stock)
        .slice(0, 5)
        .map(p => ({ name: p.name, stock: p.stock }));
    }, [safeProducts]);

    const [selectedSupplier, setSelectedSupplier] = useState<string>('all');
    const [selectedCustomer, setSelectedCustomer] = useState<string>('all');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    
    // Percentage calculator states
    const [showPercentageCalculator, setShowPercentageCalculator] = useState<boolean>(false);
    const [percentageInput, setPercentageInput] = useState<string>('');

    const currency = currentUser?.settings.currency || 'LKR';

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
  }, [orders, safeProducts, selectedCustomer, selectedSupplier, selectedCategory, dateRange, accessibleSuppliers]);

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
        const monthlyData: { [key: string]: { sales: number; cost: number; orders: any[] } } = {};
        const monthYearSet = new Set<string>();

        filteredOrders.forEach(order => {
            if (order.status === OrderStatus.Delivered) {
                const date = new Date(order.date);
                const month = date.toLocaleString('en-US', { month: 'short' });
                const year = date.getFullYear();
                const key = `${month} ${year}`;
                
                monthYearSet.add(key);
                
                if (!monthlyData[key]) {
                    monthlyData[key] = { sales: 0, cost: 0, orders: [] };
                }
                
                monthlyData[key].sales += order.total;
                monthlyData[key].orders.push(order);
            }
        });
        
        const sortedMonths = Array.from(monthYearSet).sort((a, b) => {
             return new Date(a).getTime() - new Date(b).getTime();
        });

        return sortedMonths.map(key => {
            const data = monthlyData[key] || { sales: 0, cost: 0, orders: [] };
            
            // Calculate delivery cost for this month
            const deliveryCost = data.orders.reduce((sum, order) => {
                if (!order.orderItems) return sum;
                const orderCost = order.orderItems.reduce((itemSum, item) => {
                    const product = safeProducts.find(p => p.id === item.productId);
                    const costPrice = (typeof product?.costPrice === 'number' && product.costPrice > 0) ? product.costPrice : 0;
                    return itemSum + (costPrice * (item.quantity || 0));
                }, 0);
                return sum + orderCost;
            }, 0);
            
            // Calculate gross profit (sales - delivery cost)
            const grossProfit = data.sales - deliveryCost;
            
            // Get monthly expenses (simplified - you may need to fetch actual expenses data)
            const monthlyExpenses = 0; // You can add expense calculation here if needed
            
            // Calculate net profit
            const netProfit = grossProfit - monthlyExpenses;

            return {
                month: key,
                sales: data.sales,
                deliveryCost: deliveryCost,
                grossProfit: grossProfit,
                netProfit: netProfit
            };
        });

    }, [filteredOrders, safeProducts]);


    const handleResetFilters = () => {
        setSelectedSupplier('all');
        setSelectedCustomer('all');
        setSelectedCategory('all');
        setDateRange({ start: '', end: '' });
    };

    // Stats based on filtered data
    // Calculate total cost for delivered orders in current period
    const totalSales = filteredOrders.reduce((sum, order) => order.status === 'Delivered' ? sum + order.total : sum, 0);
    // Sum cost only for delivered orders in the current filtered period
    const totalCost = filteredOrders.reduce((sum, order) => {
      if (order.status !== OrderStatus.Delivered) return sum;
      if (!order.orderItems) return sum;
      const orderCost = order.orderItems.reduce((itemSum, item) => {
        const product = safeProducts.find(p => p.id === item.productId);
        const costPrice = (typeof product?.costPrice === 'number' && product.costPrice > 0) ? product.costPrice : 0;
        return itemSum + (costPrice * (item.quantity || 0));
      }, 0);
      return sum + orderCost;
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
    
    // Financial stats for current filtered period
    const currentChequeBalance = filteredOrders.reduce((sum, order) => sum + (order.chequeBalance || 0), 0);
    const currentCreditBalance = filteredOrders.reduce((sum, order) => sum + (order.creditBalance || 0), 0);
    const currentPaid = totalSales - currentCreditBalance;
    
    // Financial stats for previous period
    const prevChequeBalance = previousPeriodOrders.reduce((sum, order) => sum + (order.chequeBalance || 0), 0);
    const prevCreditBalance = previousPeriodOrders.reduce((sum, order) => sum + (order.creditBalance || 0), 0);
    const prevPaid = prevTotalSales - prevCreditBalance;
    
    // Calculate changes
    const chequeChange = calculateChange(currentChequeBalance, prevChequeBalance);
    const creditChange = calculateChange(currentCreditBalance, prevCreditBalance);
    const paidChange = calculateChange(currentPaid, prevPaid);    // Financial stats calculations (overall totals)
    const totalChequeBalance = orders.reduce((sum, order) => sum + (order.chequeBalance || 0), 0);
    const totalCreditBalance = orders.reduce((sum, order) => sum + (order.creditBalance || 0), 0);
    const overallTotalSales = orders.reduce((sum, order) => order.status === 'Delivered' ? sum + order.total : sum, 0);
    const totalPaid = overallTotalSales - totalCreditBalance;
    
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
      const cp = (prod && typeof prod.costPrice === 'number') ? prod.costPrice : 0;
      return s + (cp * (item.quantity || 0));
    }, 0);
    return sum + cost;
  }, 0);

    return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-6 sm:space-y-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100">
            {isAdmin || isManager ? 'Admin Dashboard' : 'Dashboard'}
        </h1>
        
        {/* Filter Section */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Refine the sales data shown on the dashboard.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 items-end">
             <div>
                <label htmlFor="supplier-filter" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Supplier</label>
                <select id="supplier-filter" value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="all">All Suppliers</option>
                    {availableSuppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
             </div>
             <div>
        <label htmlFor="customer-filter" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Customer</label>
        <select id="customer-filter" value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All Customers</option>
          {(customers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
             </div>
             <div>
                <label htmlFor="category-filter" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
                <select id="category-filter" value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {categories.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
             </div>
             <div className="xl:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                    <label htmlFor="start-date" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Start Date</label>
                    <input type="date" id="start-date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                </div>
                <div className="sm:col-span-1">
                    <label htmlFor="end-date" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">End Date</label>
                    <input type="date" id="end-date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                </div>
                <div className="sm:col-span-1">
                    <label className="block text-sm font-medium text-transparent mb-1">Reset</label>
                    <button onClick={handleResetFilters} className="w-full px-3 py-2 text-sm font-medium text-slate-700 bg-slate-200 rounded-lg hover:bg-slate-300 dark:bg-slate-600 dark:text-slate-200 dark:hover:bg-slate-500 transition-colors">Reset</button>
                </div>
             </div>
          </CardContent>
        </Card>

      {/* Stat Cards */}
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
                <p className={`${getFontSizeClass(formatCurrency(totalSales, currency))} font-bold text-blue-600 dark:text-blue-400`}>{formatCurrency(totalSales, currency)}</p>
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
                <button onClick={() => setInventoryModalOpen(true)} className={`${getFontSizeClass(formatCurrency(totalInventoryValue, currency))} font-bold text-purple-600 dark:text-purple-400 text-left`}>
                  {formatCurrency(totalInventoryValue, currency)}
                </button>
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
                            return s + (cp * (item.quantity || 0));
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
                            return s + (cp * (item.quantity || 0));
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
              </div>
            </div>
            <div className="flex justify-end mt-4 space-x-2">
              <ChangeIndicator change={ordersChange} />
              <ChangeIndicator change={ordersAmountChange} />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-950 dark:to-indigo-900 border-indigo-200 dark:border-indigo-800 min-h-[180px] flex flex-col">
          <CardHeader className="flex-shrink-0">
            <CardTitle className="text-indigo-700 dark:text-indigo-300">Delivered Cost</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <p className={`${getFontSizeClass(formatCurrency(totalCost, currency))} font-bold text-indigo-600 dark:text-indigo-400`}>{formatCurrency(totalCost, currency)}</p>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <ChangeIndicator change={calculateChange(totalCost, 0)} />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border-green-200 dark:border-green-800 min-h-[180px] flex flex-col">
          <CardHeader className="flex-shrink-0">
            <CardTitle className="text-green-700 dark:text-green-300">Total Paid</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <p className={`${getFontSizeClass(formatCurrency(currentPaid, currency))} font-bold text-green-600 dark:text-green-400`}>{formatCurrency(currentPaid, currency)}</p>
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
                <p className={`${getFontSizeClass(formatCurrency(totalChequeBalance, currency))} font-bold text-orange-600 dark:text-orange-400`}>{formatCurrency(totalChequeBalance, currency)}</p>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <ChangeIndicator change={totalChequeBalance > 0 ? 0 : 0} />
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
                <p className={`${getFontSizeClass(formatCurrency(totalCreditBalance, currency))} font-bold text-red-600 dark:text-red-400`}>{formatCurrency(totalCreditBalance, currency)}</p>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <ChangeIndicator change={totalCreditBalance > 0 ? 0 : 0} />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900 border-amber-200 dark:border-amber-800 min-h-[180px] flex flex-col">
          <CardHeader className="flex-shrink-0">
            <CardTitle className="text-amber-700 dark:text-amber-300">Total Outstanding</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <p className={`${getFontSizeClass(formatCurrency(totalChequeBalance + totalCreditBalance, currency))} font-bold text-amber-600 dark:text-amber-400`}>{formatCurrency(totalChequeBalance + totalCreditBalance, currency)}</p>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <ChangeIndicator change={(totalChequeBalance + totalCreditBalance) > 0 ? 0 : 0} />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-rose-50 to-rose-100 dark:from-rose-950 dark:to-rose-900 border-rose-200 dark:border-rose-800 min-h-[180px] flex flex-col">
          <CardHeader className="flex-shrink-0">
            <CardTitle className="text-rose-700 dark:text-rose-300">Low Stock</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <p className={`${getFontSizeClass(lowStockItems)} font-bold text-rose-600 dark:text-rose-400`}>{lowStockItems}</p>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <ChangeIndicator change={lowStockItems > 0 ? -5.2 : 0} />
            </div>
          </CardContent>
        </Card>
        {/* Total Profit Card - Admin Only */}
        {isAdmin && (
          <Card className="bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-950 dark:to-teal-900 border-teal-200 dark:border-teal-800 min-h-[180px] flex flex-col">
            <CardHeader>
              <CardTitle className="text-teal-700 dark:text-teal-300">�Total Profit (Admin)</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <div>
                  <p className={`${getFontSizeClass(formatCurrency(totalSales - totalCost, currency))} font-bold text-teal-600 dark:text-teal-400`}>{formatCurrency(totalSales - totalCost, currency)}</p>
                </div>
              </div>
              <div className="flex justify-end mt-4">
                <ChangeIndicator change={calculateChange(totalSales - totalCost, 0)} />
              </div>
            </CardContent>
          </Card>
        )}
        <ExpensesCard currency={currency} dateRange={dateRange} />
        {/* Net Profit Card - Admin Only */}
        {isAdmin && <NetProfitCard currency={currency} dateRange={dateRange} totalSales={totalSales} totalCost={totalCost} />}
      </div>



      {/* Charts */}
      <div className="grid gap-6 sm:gap-8 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Financial Overview</CardTitle>
            <CardDescription>Monthly performance of sales, costs, and profits</CardDescription>
          </CardHeader>
          <CardContent>
            {salesDataForChart.length > 0 ? (
                <SalesChart data={salesDataForChart} />
            ) : (
                <div className="h-[300px] flex items-center justify-center text-slate-500 dark:text-slate-400">
                    <p>No sales data for the selected filters.</p>
                </div>
            )}
          </CardContent>
        </Card>
         <Card>
          <CardHeader>
            <CardTitle>Top Products by Stock</CardTitle>
            <CardDescription>Current inventory levels</CardDescription>
          </CardHeader>
          <CardContent>
            <TopProductsChart data={topProducts} />
          </CardContent>
        </Card>
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
                            return sum + ((product?.costPrice || 0) * (item.quantity || 0));
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
}> = ({ currentUser, orders, products, customers, suppliers }) => {
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

    // This month's performance
    const thisMonth = new Date().getMonth();
    const thisYear = new Date().getFullYear();
    const monthlyOrders = myOrders.filter(order => {
        const orderDate = new Date(order.date);
        return orderDate.getMonth() === thisMonth && orderDate.getFullYear() === thisYear;
    });
    
    const monthlyRevenue = monthlyOrders
        .filter(order => order.status === OrderStatus.Delivered)
        .reduce((sum, order) => sum + order.total, 0);
    
    const pendingOrders = myOrders.filter(order => 
        order.status === OrderStatus.Pending || order.status === OrderStatus.Shipped
    );

    const myCustomers = customers.filter(customer => 
        myOrders.some(order => order.customerId === customer.id)
    );

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
            
            {/* Sales Rep Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Monthly Revenue</CardTitle>
                        <CardDescription>This month's sales performance</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-green-600">{formatCurrency(monthlyRevenue, currency)}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">From {monthlyOrders.length} orders</p>
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
                    {myOrders.length > 0 ? (
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
                                    {myOrders.slice(0, 8).map((order) => (
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
