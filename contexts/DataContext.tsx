declare global {
    interface Window {
        refreshProducts?: () => Promise<void>;
    }
}
import React, { createContext, useState, ReactNode, useContext, Dispatch, SetStateAction } from 'react';
import { User, Product, Order, Customer, DriverAllocation, DriverSale, Supplier } from '../types';
import { supabase } from '../supabaseClient';
import { 
    DatabaseOrder, 
    DatabaseDriverAllocation, 
    safeJsonParse 
} from '../database-types';
import { emailService } from '../utils/emailService';

interface DataContextType {
  users: User[];
  setUsers: Dispatch<SetStateAction<User[]>>;
  products: Product[];
  setProducts: Dispatch<SetStateAction<Product[]>>;
  orders: Order[];
  setOrders: Dispatch<SetStateAction<Order[]>>;
  customers: Customer[];
  setCustomers: Dispatch<SetStateAction<Customer[]>>;
  driverAllocations: DriverAllocation[];
  setDriverAllocations: Dispatch<SetStateAction<DriverAllocation[]>>;
  driverSales: DriverSale[];
  setDriverSales: Dispatch<SetStateAction<DriverSale[]>>;
  suppliers: Supplier[];
  setSuppliers: Dispatch<SetStateAction<Supplier[]>>;
  refetchData: () => Promise<void>;
  calculateCustomerOutstanding?: (customerId: string) => number;
}

export const DataContext = createContext<DataContextType | undefined>(undefined);

export const useData = () => {
    const context = useContext(DataContext);
    if (!context) {
        throw new Error("useData must be used within a DataProvider");
    }
    return context;
};

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [driverAllocations, setDriverAllocations] = useState<DriverAllocation[]>([]);
    const [driverSales, setDriverSales] = useState<DriverSale[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);

    React.useEffect(() => {
        // Fetch all data from Supabase tables
        const fetchData = async () => {
            // Force refresh products after allocation/reconciliation
            window.refreshProducts = async () => {
                try {
                    const { data: productsData, error: productsError } = await supabase.from('products').select('*');
                    if (productsError) {
                        console.error('Products fetch error:', productsError);
                        return;
                    }
                    if (productsData) {
                        const mappedProducts = productsData.map((row: any) => ({
                            id: row.id,
                            name: row.name,
                            category: row.category,
                            price: row.price,
                            costPrice: row.costprice !== undefined ? Number(row.costprice) : undefined,
                            stock: row.stock,
                            sku: row.sku,
                            supplier: row.supplier,
                            imageUrl: row.imageurl || row.imageUrl || '',
                        }));
                        setProducts(mappedProducts);
                    }
                } catch (error) {
                    console.error('Products fetch exception:', error);
                }
            };
            // Orders table fetch mapping
            const { data: ordersData, error: ordersError } = await supabase.from('orders').select('*');
            if (ordersError) {
                console.error('Supabase orders fetch error:', ordersError);
            }
            if (!ordersError && ordersData) {
                const mappedOrders = ordersData.map((row: DatabaseOrder & { returnamount?: number }) => {
                    const orderItemsResult = safeJsonParse(row.orderitems, [], 'orderitems', row.id);
                    if (!orderItemsResult.success) {
                        // Log error but continue with fallback
                        console.warn(`Using empty array for order items in order ${row.id}`);
                    }

                    return {
                        id: row.id,
                        customerId: row.customerid,
                        customerName: row.customername,
                        date: row.orderdate,
                        total: row.totalamount,
                        status: row.status,
                        paymentMethod: row.paymentmethod,
                        notes: row.notes,
                        assignedUserId: row.assigneduserid,
                        orderItems: orderItemsResult.success ? orderItemsResult.data : [],
                        backorderedItems: [],
                        expectedDeliveryDate: row.expecteddeliverydate,
                        chequeBalance: row.chequebalance == null || isNaN(Number(row.chequebalance)) ? 0 : Number(row.chequebalance),
                        creditBalance: row.creditbalance == null || isNaN(Number(row.creditbalance)) ? 0 : Number(row.creditbalance),
                        returnAmount: row.returnamount == null || isNaN(Number(row.returnamount)) ? 0 : Number(row.returnamount),
                    } as Order;
                });
                setOrders(mappedOrders);
            }
            // Products table fetch mapping
            await window.refreshProducts();
            // Other tables
            const tables = [
                { name: 'customers', setter: setCustomers },
                { name: 'suppliers', setter: setSuppliers },
                { name: 'driver_allocations', setter: setDriverAllocations },
                { name: 'driver_sales', setter: setDriverSales },
                { name: 'users', setter: setUsers },
            ];
            for (const { name, setter } of tables) {
                console.log(`Fetching ${name} table...`);
                let { data, error } = await supabase.from(name).select('*');
                
                // If 409 error, try alternative approaches
                if (error?.code === '409' || error?.message?.includes('409')) {
                    console.warn(`409 error for ${name}, trying fallback approaches...`);
                    
                    // Try with explicit column list for customers
                    if (name === 'customers') {
                        const customerColumns = 'id,name,email,phone,location,joindate,totalspent,outstandingbalance,avatarurl,discounts';
                        const { data: retryData, error: retryError } = await supabase
                            .from('customers')
                            .select(customerColumns);
                        
                        if (!retryError) {
                            data = retryData;
                            error = null;
                            console.log(`✅ Customers fallback successful`);
                        } else {
                            console.error(`❌ Customers fallback failed:`, retryError);
                        }
                    }
                }
                
                if (error) {
                    console.error(`Supabase ${name} fetch error:`, error);
                    console.error(`Error details:`, JSON.stringify(error, null, 2));
                    
                    // Set empty array as fallback to prevent app crash
                    if (name === 'customers') {
                        console.warn('Setting empty customers array as fallback');
                        setter([]);
                    }
                    continue; // Skip this table and continue with others
                }
                if (data) {
                    console.log(`Successfully fetched ${name}:`, data.length, 'records');
                    if (name === 'customers') {
                        console.log('Raw customers data:', data[0]); // Debug first record
                        const mappedCustomers = data.map((row: any) => {
                            // Handle column name variations (database might have different case)
                            const id = row.id;
                            const name = row.name;
                            const email = row.email;
                            const phone = row.phone;
                            const location = row.location;
                            // Handle potential column name variations
                            const joinDate = row.joindate || row.joinDate || row.join_date;
                            const totalSpent = row.totalspent || row.totalSpent || row.total_spent || 0;
                            const outstandingBalance = row.outstandingbalance || row.outstandingBalance || row.outstanding_balance || 0;
                            const avatarUrl = row.avatarurl || row.avatarUrl || row.avatar_url || `https://i.pravatar.cc/100?u=${email}`;
                            const discounts = row.discounts || {};
                            
                            return {
                                id,
                                name,
                                email,
                                phone,
                                location,
                                joinDate,
                                totalSpent: typeof totalSpent === 'number' ? totalSpent : parseFloat(totalSpent) || 0,
                                outstandingBalance: typeof outstandingBalance === 'number' ? outstandingBalance : parseFloat(outstandingBalance) || 0,
                                avatarUrl,
                                discounts,
                            };
                        });
                        console.log('Mapped customers:', mappedCustomers.length, 'records');
                        setter(mappedCustomers);
                    } else if (name === 'suppliers') {
                        const mappedSuppliers = data.map((row: any) => ({
                            id: row.id,
                            name: row.name,
                            contactPerson: row.contactperson,
                            email: row.email,
                            phone: row.phone,
                            address: row.address,
                            joinDate: row.joindate,
                        }));
                        setter(mappedSuppliers);
                    } else if (name === 'driver_allocations') {
                        console.log('Debug - Raw driver_allocations data from DB:', data);
                        console.log('Debug - Driver_allocations error:', error);
                        const mappedAllocations = data.map((row: any) => ({
                            id: row.id,
                            driverId: row.driver_id ?? row.driverid,
                            driverName: row.driver_name ?? row.drivername,
                            date: row.date,
                            allocatedItems: (() => {
                                console.log(`Debug - Row ${row.id} allocated_items:`, row.allocated_items);
                                console.log(`Debug - Row ${row.id} allocateditems:`, row.allocateditems);
                                
                                const parseJsonSafely = (jsonString: string, fieldName: string, rowId: string) => {
                                    try {
                                        const parsed = JSON.parse(jsonString);
                                        console.log(`Debug - Successfully parsed ${fieldName} for ${rowId}:`, parsed);
                                        return Array.isArray(parsed) ? parsed : [];
                                    } catch (error) {
                                        console.error(`Error parsing ${fieldName} for row ${rowId}:`, error);
                                        console.error(`Raw data that failed to parse:`, jsonString);
                                        return [];
                                    }
                                };
                                
                                if (row.allocated_items) {
                                    if (typeof row.allocated_items === 'string') {
                                        return parseJsonSafely(row.allocated_items, 'allocated_items', row.id);
                                    }
                                    return Array.isArray(row.allocated_items) ? row.allocated_items : [];
                                }
                                if (row.allocateditems) {
                                    if (typeof row.allocateditems === 'string') {
                                        return parseJsonSafely(row.allocateditems, 'allocateditems', row.id);
                                    }
                                    return Array.isArray(row.allocateditems) ? row.allocateditems : [];
                                }
                                return [];
                            })(),
                            returnedItems: (() => {
                                const parseJsonSafely = (jsonString: string, fieldName: string, rowId: string) => {
                                    try {
                                        const parsed = JSON.parse(jsonString);
                                        console.log(`Debug - Successfully parsed ${fieldName} for ${rowId}:`, parsed);
                                        return parsed;
                                    } catch (error) {
                                        console.error(`Error parsing ${fieldName} for row ${rowId}:`, error);
                                        console.error(`Raw data that failed to parse:`, jsonString);
                                        return null;
                                    }
                                };
                                
                                if (row.returned_items) {
                                    if (typeof row.returned_items === 'string') {
                                        return parseJsonSafely(row.returned_items, 'returned_items', row.id);
                                    }
                                    return row.returned_items;
                                }
                                if (row.returneditems) {
                                    if (typeof row.returneditems === 'string') {
                                        return parseJsonSafely(row.returneditems, 'returneditems', row.id);
                                    }
                                    return row.returneditems;
                                }
                                return null;
                            })(),
                            salesTotal: row.sales_total ?? row.salestotal ?? 0,
                            status: row.status ?? 'Allocated',
                        }));
                        console.log('Debug - Mapped driver allocations:', mappedAllocations);
                        setter(mappedAllocations);
                    } else if (name === 'users') {
                        const mappedUsers = data.map((row: any) => ({
                            id: row.id,
                            name: row.name,
                            email: row.email,
                            phone: row.phone,
                            role: row.role,
                            status: row.status,
                            avatarUrl: row.avatarurl ?? '',
                            lastLogin: row.lastlogin,
                            password: row.password,
                            assignedSupplierNames: (() => {
                                if (!row.assignedsuppliernames) return [];
                                if (typeof row.assignedsuppliernames === 'string') {
                                    return safeJsonParse(row.assignedsuppliernames, 'assignedSupplierNames', row.id) || [];
                                }
                                return Array.isArray(row.assignedsuppliernames) ? row.assignedsuppliernames : [];
                            })(),
                            settings: row.settings ?? {},
                        }));
                        setter(mappedUsers);
                    } else if (name === 'driver_sales') {
                        const mappedSales = data.map((row: any) => ({
                            id: row.id,
                            driverId: row.driver_id,
                            allocationId: row.allocation_id,
                            date: row.date,
                            soldItems: typeof row.sold_items === 'string' ? JSON.parse(row.sold_items) : (row.sold_items || []),
                            total: row.total || 0,
                            customerName: row.customer_name,
                            customerId: row.customer_id,
                            amountPaid: row.amount_paid || 0,
                            creditAmount: row.credit_amount || 0,
                            paymentMethod: row.payment_method,
                            paymentReference: row.payment_reference,
                            notes: row.notes,
                        }));
                        setter(mappedSales);
                    } else if (name === 'users') {
                        const mappedUsers = data.map((row: any) => ({
                            id: row.id,
                            name: row.name,
                            email: row.email,
                            phone: row.phone,
                            role: row.role,
                            status: row.status,
                            avatarUrl: row.avatarurl ?? '',
                            lastLogin: row.lastlogin,
                            password: row.password,
                            assignedSupplierNames: row.assignedsuppliernames ?? [],
                            settings: row.settings ?? {},
                        }));
                        setter(mappedUsers);
                    } else {
                        setter(data);
                    }
                }
            }
        };
        
        fetchData().catch(error => {
            console.error('Overall fetchData error:', error);
        });
    }, []);

    // Function to calculate real-time customer outstanding balance
    const calculateCustomerOutstanding = React.useCallback((customerId: string) => {
        if (!orders || orders.length === 0) return 0;
        
        const customerOrders = orders.filter(order => order.customerId === customerId);
        const totalOutstanding = customerOrders.reduce((sum, order) => {
            const chequeBalance = typeof order.chequeBalance === 'number' ? order.chequeBalance : 0;
            const creditBalance = typeof order.creditBalance === 'number' ? order.creditBalance : 0;
            return sum + chequeBalance + creditBalance;
        }, 0);
        
        return totalOutstanding;
    }, [orders]);

    // Update customers with real-time outstanding balance calculation
    const customersWithRealTimeOutstanding = React.useMemo(() => {
        return customers.map(customer => ({
            ...customer,
            outstandingBalance: calculateCustomerOutstanding(customer.id)
        }));
    }, [customers, calculateCustomerOutstanding]);

    // Expose driverAllocations globally for driver order filtering whenever it changes
    React.useEffect(() => {
        (window as any).driverAllocations = driverAllocations;
        console.log('Debug - Window driverAllocations updated:', driverAllocations.length, 'allocations');
    }, [driverAllocations]);

    // Refetch function to refresh data after operations
    const refetchData = React.useCallback(async () => {
        try {
            // Fetch customers
            const { data: customersData, error: customersError } = await supabase.from('customers').select('*');
            if (!customersError && customersData) {
                const mappedCustomers = customersData.map((row: any) => ({
                    id: row.id,
                    name: row.name,
                    email: row.email,
                    phone: row.phone,
                    location: row.location,
                    joinDate: row.joindate,
                    totalSpent: row.totalspent,
                    outstandingBalance: row.outstandingbalance,
                    avatarUrl: row.avatarurl || '',
                }));
                setCustomers(mappedCustomers);
            }
            
            // Fetch products
            const { data: productsData, error: productsError } = await supabase.from('products').select('*');
            if (!productsError && productsData) {
                const mappedProducts = productsData.map((row: any) => ({
                    id: row.id,
                    name: row.name,
                    category: row.category,
                    price: row.price,
                    costPrice: row.costprice !== undefined ? Number(row.costprice) : undefined,
                    stock: row.stock,
                    sku: row.sku,
                    supplier: row.supplier,
                    imageUrl: row.imageurl || row.imageUrl || '',
                }));
                setProducts(mappedProducts);
            }
            
            // Fetch suppliers
            const { data: suppliersData, error: suppliersError } = await supabase.from('suppliers').select('*');
            if (!suppliersError && suppliersData) {
                const mappedSuppliers = suppliersData.map((row: any) => ({
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
            
            // Fetch users  
            const { data: usersData, error: usersError } = await supabase.from('users').select('*');
            if (!usersError && usersData) {
                const mappedUsers = usersData.map((row: any) => ({
                    id: row.id,
                    name: row.name,
                    email: row.email,
                    phone: row.phone,
                    role: row.role,
                    status: row.status,
                    avatarUrl: row.avatarurl ?? '',
                    lastLogin: row.lastlogin,
                    password: row.password,
                    assignedSupplierNames: (() => {
                        if (!row.assignedsuppliernames) return [];
                        if (typeof row.assignedsuppliernames === 'string') {
                            return safeJsonParse(row.assignedsuppliernames, 'assignedSupplierNames', row.id) || [];
                        }
                        return Array.isArray(row.assignedsuppliernames) ? row.assignedsuppliernames : [];
                    })(),
                    settings: row.settings ?? {},
                }));
                setUsers(mappedUsers);
            }
            // Fetch driver_allocations
            try {
                const { data: allocationsData, error: allocationsError } = await supabase.from('driver_allocations').select('*');
                if (!allocationsError && allocationsData) {
                    const mappedAllocations = allocationsData.map((row: any) => ({
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
                    }));
                    setDriverAllocations(mappedAllocations);
                }
            } catch (err) {
                console.error('Error fetching driver_allocations in refetchData:', err);
            }

            // Fetch driver_sales
            try {
                const { data: salesData, error: salesError } = await supabase.from('driver_sales').select('*');
                if (!salesError && salesData) {
                    const mappedSales = salesData.map((row: any) => ({
                        id: row.id,
                        driverId: row.driver_id,
                        allocationId: row.allocation_id,
                        date: row.date,
                        soldItems: typeof row.sold_items === 'string' ? JSON.parse(row.sold_items) : (row.sold_items || []),
                        total: row.total || 0,
                        customerName: row.customer_name,
                        customerId: row.customer_id,
                        amountPaid: row.amount_paid || 0,
                        creditAmount: row.credit_amount || 0,
                        paymentMethod: row.payment_method,
                        paymentReference: row.payment_reference,
                        notes: row.notes,
                    }));
                    setDriverSales(mappedSales);
                }
            } catch (err) {
                console.error('Error fetching driver_sales in refetchData:', err);
            }
        } catch (error) {
            console.error('Refetch data error:', error);
        }
    }, []);

    const value = {
        users, setUsers,
        products, setProducts,
        orders, setOrders,
        customers: customersWithRealTimeOutstanding, setCustomers,
        driverAllocations, setDriverAllocations,
        driverSales, setDriverSales,
        suppliers, setSuppliers,
        refetchData,
        calculateCustomerOutstanding,
    };

    return (
        <DataContext.Provider value={value}>
            {children}
        </DataContext.Provider>
    );
};