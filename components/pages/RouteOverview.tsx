import React, { useState, useMemo, useEffect } from 'react';
import { Customer, UserRole } from '../../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { confirmSecureDelete } from '../../utils/passwordConfirmation';

const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount).replace('$', `${currency} `);
};

interface RouteOverviewProps {
  onRouteSelect: (routeName: string) => void;
}

export const RouteOverview: React.FC<RouteOverviewProps> = ({ onRouteSelect }) => {
  const { customers, orders, products, refetchData } = useData();
  const { currentUser } = useAuth();
  const currency = currentUser?.settings.currency || 'LKR';

  // Route management states (load from DB)
  const [routes, setRoutes] = useState<string[]>([]);
  const [routesLoaded, setRoutesLoaded] = useState(false);
  const [isAddingRoute, setIsAddingRoute] = useState(false);
  const [newRouteName, setNewRouteName] = useState('');
  const [editingRoute, setEditingRoute] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');

  const canEdit = useMemo(() => 
    currentUser?.role === UserRole.Admin,
    [currentUser]
  );

  // Calculate outstanding for each customer from orders table
  const customerOutstandingMap: Record<string, number> = {};
  orders.forEach(order => {
    if (!order.customerId) return;
    const cheque = order.chequeBalance == null || isNaN(Number(order.chequeBalance)) ? 0 : Number(order.chequeBalance);
    const credit = order.creditBalance == null || isNaN(Number(order.creditBalance)) ? 0 : Number(order.creditBalance);
    customerOutstandingMap[order.customerId] = (customerOutstandingMap[order.customerId] || 0) + cheque + credit;
  });

  // Calculate total spent for each customer from delivered orders
  const customerTotalSpentMap: Record<string, number> = {};
  orders.forEach(order => {
    if (!order.customerId || order.status !== 'Delivered') return;
    customerTotalSpentMap[order.customerId] = (customerTotalSpentMap[order.customerId] || 0) + (order.total || 0);
  });

  // Group customers by route and calculate metrics
  type RouteMetric = {
    customerCount: number;
    totalOutstanding: number;
    totalSpent: number;
    customers: Customer[];
    hasGPSCustomers: number;
  };

  const routeMetrics = useMemo(() => {
    const metrics: Record<string, RouteMetric> = {};

    // Initialize all routes
    routes.forEach(route => {
      metrics[route] = {
        customerCount: 0,
        totalOutstanding: 0,
        totalSpent: 0,
        customers: [],
        hasGPSCustomers: 0
      };
    });

    // Group customers by route
    customers.forEach(customer => {
      const route = customer.route || 'Unassigned';
      if (!metrics[route]) {
        metrics[route] = {
          customerCount: 0,
          totalOutstanding: 0,
          totalSpent: 0,
          customers: [],
          hasGPSCustomers: 0
        };
      }

      metrics[route].customers.push(customer);
      metrics[route].customerCount++;
      metrics[route].totalOutstanding += customerOutstandingMap[customer.id] || 0;
      metrics[route].totalSpent += customerTotalSpentMap[customer.id] || 0;
      
      // Check if customer has GPS coordinates
      if (customer.location && customer.location.includes('GPS:')) {
        metrics[route].hasGPSCustomers++;
      }
    });

    return metrics;
  }, [customers, routes, customerOutstandingMap, customerTotalSpentMap]);

  // Route management functions (DB-backed)
  const loadRoutesFromDatabase = async () => {
    try {
      const { fetchRoutes } = await import('../../supabaseClient');
      const routeNames = await fetchRoutes();
      setRoutes(routeNames.length ? routeNames : ['Unassigned']);
      setRoutesLoaded(true);
    } catch (error) {
      console.warn('Could not load routes from database:', error);
      setRoutes(['Route 1', 'Route 2', 'Route 3', 'Unassigned']);
      setRoutesLoaded(true);
    }
  };

  const handleAddRoute = async () => {
    const trimmed = newRouteName.trim();
    if (!trimmed) return alert('Route name cannot be empty!');
    if (routes.includes(trimmed)) return alert('Route name already exists!');

    try {
      const { addRoute } = await import('../../supabaseClient');
      const { data, error } = await addRoute(trimmed, currentUser?.id);
      if (error) {
        if (error.message?.includes('relation "routes" does not exist')) {
          setRoutes(prev => [...prev, trimmed]);
          setNewRouteName('');
          setIsAddingRoute(false);
          alert('Route added locally (DB missing). Run migration to persist.');
          return;
        }
        if (error.message?.toLowerCase().includes('row-level security') || error.code === '42501') {
          setRoutes(prev => [...prev, trimmed]);
          setNewRouteName('');
          setIsAddingRoute(false);
          alert('Route added locally, but DB rejected it due to Row-Level Security. Sign in using Supabase Auth or update RLS policies to allow this operation.');
          return;
        }
        throw error;
      }
      await loadRoutesFromDatabase();
      setNewRouteName('');
      setIsAddingRoute(false);
      alert('Route added successfully and saved to database!');
    } catch (err) {
      console.error('Error adding route:', err);
      setRoutes(prev => [...prev, trimmed]);
      setNewRouteName('');
      setIsAddingRoute(false);
      alert('Route added locally (DB error).');
    }
  };

  const handleDeleteRoute = async (routeName: string) => {
    if (routeName === 'Unassigned') {
      alert('Cannot delete the Unassigned route');
      return;
    }
    
    if (!currentUser?.email) return;
    
    // Require password confirmation for delete
    const confirmed = await confirmSecureDelete(
      routeName, 
      'Route', 
      currentUser.email
    );
    
    if (confirmed) {
      try {
        const { deleteRoute } = await import('../../supabaseClient');
        const { error } = await deleteRoute(routeName);
        if (error && !error.message?.includes('relation "routes" does not exist')) {
          alert(`Error deleting route: ${error.message}`);
          return;
        }
        await loadRoutesFromDatabase();
        await refetchData?.();
        alert('Route deleted successfully!');
      } catch (err) {
        console.error('Error deleting route:', err);
        setRoutes(prev => prev.filter(route => route !== routeName));
        alert('Route deleted locally (DB error)');
      }
    }
  };

  const startRename = (routeName: string) => {
    setEditingRoute(routeName);
    setEditingName(routeName);
  };

  const cancelRename = () => {
    setEditingRoute(null);
    setEditingName('');
  };

  const saveRename = async (oldName: string) => {
    const trimmed = editingName.trim();
    if (!trimmed) return alert('New route name cannot be empty');
    if (trimmed === oldName) return cancelRename();
    if (routes.includes(trimmed)) return alert('A route with that name already exists');

    try {
      const { renameRoute } = await import('../../supabaseClient');
      const { data, error } = await renameRoute(oldName, trimmed);
      if (error) {
        if (error.message?.includes('relation "routes" does not exist')) {
          setRoutes(prev => prev.map(r => r === oldName ? trimmed : r));
          cancelRename();
          alert('Route renamed locally (DB missing). Run migration to persist.');
          return;
        }
        throw error;
      }
      await loadRoutesFromDatabase();
      cancelRename();
      alert('Route renamed successfully');
    } catch (err) {
      console.error('Error renaming route:', err);
      setRoutes(prev => prev.map(r => r === oldName ? trimmed : r));
      cancelRename();
      alert('Route renamed locally (DB error)');
    }
  };

  // Calculate totals across all routes
  const totalCustomers = (Object.values(routeMetrics) as RouteMetric[]).reduce((sum, route) => sum + route.customerCount, 0);
  const totalOutstanding = (Object.values(routeMetrics) as RouteMetric[]).reduce((sum, route) => sum + route.totalOutstanding, 0);
  const totalSpent = (Object.values(routeMetrics) as RouteMetric[]).reduce((sum, route) => sum + route.totalSpent, 0);

  useEffect(() => {
    loadRoutesFromDatabase();
  }, []);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Route Management</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2">
            Select a route to view and manage customers in that delivery route
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm text-slate-500 dark:text-slate-400">Total Routes</div>
          <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{routes.length}</div>
        </div>
      </div>

      {/* Route Management Section */}
      {canEdit && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-3">Manage Routes</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">Add new routes or delete existing ones</p>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Add New Route */}
              {isAddingRoute ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Route name"
                    value={newRouteName}
                    onChange={(e) => setNewRouteName(e.target.value)}
                    className="px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    onKeyPress={(e) => e.key === 'Enter' && handleAddRoute()}
                  />
                  <button
                    onClick={handleAddRoute}
                    className="px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => {
                      setIsAddingRoute(false);
                      setNewRouteName('');
                    }}
                    className="px-3 py-2 bg-slate-400 text-white text-sm rounded hover:bg-slate-500"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsAddingRoute(true)}
                  className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                >
                  ➕ Add Route
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Summary Statistics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Total Customers</CardTitle>
            <CardDescription>Across all routes</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-900 dark:text-white">{totalCustomers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total Outstanding</CardTitle>
            <CardDescription>All pending amounts</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-red-500">{formatCurrency(totalOutstanding, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total Revenue</CardTitle>
            <CardDescription>All delivered orders</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{formatCurrency(totalSpent, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Active Routes</CardTitle>
            <CardDescription>With customers assigned</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">
              {(Object.values(routeMetrics) as RouteMetric[]).filter(route => route.customerCount > 0).length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Route Cards Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {routes.map((routeName) => {
          const metrics = routeMetrics[routeName] || {
            customerCount: 0,
            totalOutstanding: 0,
            totalSpent: 0,
            customers: [],
            hasGPSCustomers: 0
          };

          return (
            <Card 
              key={routeName} 
              className="cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-105 border-2 hover:border-blue-300 dark:hover:border-blue-600"
              onClick={() => onRouteSelect(routeName)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <span className="text-2xl">
                      {routeName === 'Unassigned' ? '📋' : '🚛'}
                    </span>
                    {routeName}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={metrics.customerCount > 0 ? "default" : "secondary"}
                      className={metrics.customerCount > 0 ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" : ""}
                    >
                      {metrics.customerCount} customers
                    </Badge>
                    {canEdit && routeName !== 'Unassigned' && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startRename(routeName);
                          }}
                          className="text-slate-700 hover:text-slate-900 text-sm p-1 rounded hover:bg-slate-50 dark:hover:bg-slate-900/10"
                          title="Rename route"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteRoute(routeName);
                          }}
                          className="text-red-500 hover:text-red-700 text-sm p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                          title="Delete route"
                        >
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <CardDescription>
                  Click to view customers and manage this route
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Route Statistics */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                    <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">Outstanding</div>
                    <div className={`text-lg font-bold ${metrics.totalOutstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(metrics.totalOutstanding, currency)}
                    </div>
                  </div>
                  <div className="text-center p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                    <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">Revenue</div>
                    <div className="text-lg font-bold text-green-600">
                      {formatCurrency(metrics.totalSpent, currency)}
                    </div>
                  </div>
                </div>

                {/* GPS Coverage */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">📍 GPS Coverage:</span>
                  <span className="font-medium">
                    {metrics.hasGPSCustomers}/{metrics.customerCount} customers
                    {metrics.customerCount > 0 && (
                      <span className="text-xs text-slate-500 ml-1">
                        ({Math.round((metrics.hasGPSCustomers / metrics.customerCount) * 100)}%)
                      </span>
                    )}
                  </span>
                </div>

                {/* Route Status */}
                <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-600 dark:text-slate-400">Route Status:</div>
                  <Badge 
                    variant={metrics.customerCount > 0 ? "default" : "secondary"}
                    className={
                      metrics.customerCount === 0 
                        ? "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400" 
                        : metrics.hasGPSCustomers === metrics.customerCount
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                    }
                  >
                    {metrics.customerCount === 0 
                      ? 'Empty' 
                      : metrics.hasGPSCustomers === metrics.customerCount
                      ? 'Ready'
                      : 'Needs GPS'
                    }
                  </Badge>
                </div>

                {/* Action Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRouteSelect(routeName);
                  }}
                  className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  View Customers →
                </button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-700 rounded-lg p-6 border border-blue-200 dark:border-slate-600">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-3">
          📋 Quick Actions
        </h3>
        <div className="grid md:grid-cols-3 gap-4">
          <button
            onClick={() => onRouteSelect('All Routes')}
            className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 hover:shadow-md transition-all text-left"
          >
            <div className="text-lg mb-2">📊</div>
            <div className="font-medium text-slate-800 dark:text-slate-100">View All Customers</div>
            <div className="text-sm text-slate-600 dark:text-slate-400">See customers from all routes</div>
          </button>
          
          <button
            onClick={() => {
              const routesWithCustomers = routes.filter(route => routeMetrics[route]?.customerCount > 0);
              if (routesWithCustomers.length > 0) {
                onRouteSelect(routesWithCustomers[0]);
              }
            }}
            className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 hover:shadow-md transition-all text-left"
          >
            <div className="text-lg mb-2">🎯</div>
            <div className="font-medium text-slate-800 dark:text-slate-100">Optimize Routes</div>
            <div className="text-sm text-slate-600 dark:text-slate-400">Plan delivery sequences</div>
          </button>
          
          <button
            onClick={() => {
              const needsGPSRoutes = routes.filter(route => {
                const metrics = routeMetrics[route];
                return metrics && metrics.customerCount > 0 && metrics.hasGPSCustomers < metrics.customerCount;
              });
              if (needsGPSRoutes.length > 0) {
                onRouteSelect(needsGPSRoutes[0]);
              } else {
                alert('All routes have complete GPS coverage!');
              }
            }}
            className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 hover:shadow-md transition-all text-left"
          >
            <div className="text-lg mb-2">📍</div>
            <div className="font-medium text-slate-800 dark:text-slate-100">Add GPS Locations</div>
            <div className="text-sm text-slate-600 dark:text-slate-400">Complete missing GPS data</div>
          </button>
        </div>
      </div>
      {/* Rename Modal */}
      <Modal isOpen={!!editingRoute} onClose={cancelRename} title={`Rename route: ${editingRoute || ''}`}>
        <div className="space-y-4">
          <input
            type="text"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            onKeyPress={(e) => e.key === 'Enter' && editingRoute && saveRename(editingRoute)}
          />
          <div className="flex justify-end gap-2">
            <button onClick={cancelRename} className="px-4 py-2 bg-slate-400 text-white rounded">Cancel</button>
            <button onClick={() => editingRoute && saveRename(editingRoute)} className="px-4 py-2 bg-green-600 text-white rounded">Save</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};