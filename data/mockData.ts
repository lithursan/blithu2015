import { Product, Order, Customer, OrderStatus, SalesData, StockData, User, UserRole, UserStatus, DriverAllocation, DriverSale, Supplier } from '../types';

export const mockProducts: Product[] = [
  { id: 'PROD001', name: 'Premium Grade A Basmati Rice', category: 'Grains', price: 150.00, stock: 120, sku: 'SKU-BASM-001', supplier: 'Himalayan Grains Co.', imageUrl: 'https://picsum.photos/seed/rice/400/400' },
  { id: 'PROD002', name: 'Organic Toor Dal', category: 'Pulses', price: 120.50, stock: 80, sku: 'SKU-TOOR-002', supplier: 'Deccan Pulses Ltd.', imageUrl: 'https://picsum.photos/seed/dal/400/400' },
  { id: 'PROD003', name: 'Cold Pressed Sunflower Oil', category: 'Oils', price: 220.00, stock: 200, sku: 'SKU-SUNF-003', supplier: 'Healthy Oils Inc.', imageUrl: 'https://picsum.photos/seed/oil/400/400' },
  { id: 'PROD004', name: 'Whole Wheat Atta', category: 'Flour', price: 55.00, stock: 300, sku: 'SKU-ATTA-004', supplier: 'Golden Harvest', imageUrl: 'https://picsum.photos/seed/atta/400/400' },
  { id: 'PROD005', name: 'Refined Sugar', category: 'Sweeteners', price: 45.00, stock: 0, sku: 'SKU-SUGR-005', supplier: 'Sweet Life', imageUrl: 'https://picsum.photos/seed/sugar/400/400' },
  { id: 'PROD006', name: 'Himalayan Pink Salt', category: 'Spices', price: 90.00, stock: 150, sku: 'SKU-SALT-006', supplier: 'Himalayan Grains Co.', imageUrl: 'https://picsum.photos/seed/salt/400/400' },
  { id: 'PROD007', name: 'Turmeric Powder', category: 'Spices', price: 75.00, stock: 180, sku: 'SKU-TURM-007', supplier: 'Deccan Pulses Ltd.', imageUrl: 'https://picsum.photos/seed/turmeric/400/400' },
  { id: 'PROD008', name: 'Coriander Powder', category: 'Spices', price: 60.00, stock: 250, sku: 'SKU-CORI-008', supplier: 'Golden Harvest', imageUrl: 'https://picsum.photos/seed/coriander/400/400' },
];

export const mockOrders: Order[] = [
  {
    id: 'ORD001',
    customerId: 'CUST001',
    customerName: 'Rajesh Kumar',
    date: '2023-10-26',
    expectedDeliveryDate: '2023-10-30',
    total: 2450.00,
    status: OrderStatus.Delivered,
    chequeBalance: 0,
    creditBalance: 0,
    assignedUserId: 'USER003', // Rajesh Kumar's orders managed by Rahul Verma
    orderItems: [
        { productId: 'PROD001', quantity: 10, price: 150.00, discount: 10 }, // 1350
        { productId: 'PROD003', quantity: 5, price: 220.00 }, // 1100
    ],
    backorderedItems: [
        { productId: 'PROD005', quantity: 5, price: 45.00 },
    ]
  },
  {
    id: 'ORD002',
    customerId: 'CUST002',
    customerName: 'Priya Sharma',
    date: '2023-10-25',
    expectedDeliveryDate: '2023-10-28',
    total: 2215.50,
    status: OrderStatus.Shipped,
    chequeBalance: 0,
    creditBalance: 500.00,
    assignedUserId: 'USER006', // Priya Sharma's orders managed by Arjun Reddy (Driver)
    orderItems: [
        { productId: 'PROD002', quantity: 1, price: 120.50 }, // 120.50
        { productId: 'PROD003', quantity: 5, price: 220.00, discount: 5 }, // 1045
        { productId: 'PROD001', quantity: 7, price: 150.00 }, // 1050
    ],
    backorderedItems: [],
  },
  {
    id: 'ORD003',
    customerId: 'CUST003',
    customerName: 'Amit Singh',
    date: '2023-10-25',
    expectedDeliveryDate: '2023-11-02',
    total: 835.00,
    status: OrderStatus.Pending,
    chequeBalance: 835.00,
    creditBalance: 0,
    assignedUserId: 'USER007', // Amit Singh's orders managed by Kiran Rao (Driver)
    orderItems: [
        { productId: 'PROD008', quantity: 5, price: 60.00, discount: 5 }, // 285
        { productId: 'PROD004', quantity: 10, price: 55.00 }, // 550
    ],
    backorderedItems: [],
  },
  {
    id: 'ORD004',
    customerId: 'CUST004',
    customerName: 'Sunita Devi',
    date: '2023-10-24',
    total: 12100.00,
    status: OrderStatus.Delivered,
    chequeBalance: 0,
    creditBalance: 0,
    // No assignedUserId, visible to managers/admins
    orderItems: [
        { productId: 'PROD003', quantity: 55, price: 220.00 },
    ],
    backorderedItems: [],
  },
  {
    id: 'ORD005',
    customerId: 'CUST005',
    customerName: 'Vikram Patel',
    date: '2023-10-23',
    total: 75.00,
    status: OrderStatus.Cancelled,
    chequeBalance: 0,
    creditBalance: 0,
    // No assignedUserId, visible to managers/admins
    orderItems: [
        { productId: 'PROD007', quantity: 1, price: 75.00 },
    ],
    backorderedItems: [],
  },
  {
    id: 'ORD006',
    customerId: 'CUST001',
    customerName: 'Rajesh Kumar',
    date: '2023-10-22',
    expectedDeliveryDate: '2023-10-25',
    total: 3017.5,
    status: OrderStatus.Delivered,
    chequeBalance: 500,
    creditBalance: 300,
    assignedUserId: 'USER003', // Rahul Verma
    orderItems: [
        { productId: 'PROD002', quantity: 20, price: 120.50 }, // 2410
        { productId: 'PROD006', quantity: 9, price: 90.00, discount: 25 }, // 607.5
    ],
    backorderedItems: [],
  },
];


export const mockCustomers: Customer[] = [
  { 
    id: 'CUST001', 
    name: 'Rajesh Kumar', 
    email: 'rajesh.k@example.com', 
    phone: '9876543210', 
    location: 'Mumbai, Maharashtra',
    joinDate: '2022-01-15', 
    totalSpent: 75000, 
    avatarUrl: 'https://i.pravatar.cc/40?u=rajesh',
    discounts: { 'PROD001': 10, 'PROD006': 25 },
    outstandingBalance: 0,
  },
  { 
    id: 'CUST002', 
    name: 'Priya Sharma', 
    email: 'priya.s@example.com', 
    phone: '9876543211', 
    location: 'Delhi, Delhi',
    joinDate: '2022-03-20', 
    totalSpent: 52000, 
    avatarUrl: 'https://i.pravatar.cc/40?u=priya.sharma',
    discounts: { 'PROD003': 5 },
    outstandingBalance: 2500,
  },
  { 
    id: 'CUST003', 
    name: 'Amit Singh', 
    email: 'amit.s@example.com', 
    phone: '9876543212', 
    location: 'Bengaluru, Karnataka',
    joinDate: '2022-05-10', 
    totalSpent: 125000, 
    avatarUrl: 'https://i.pravatar.cc/40?u=amit',
    discounts: {'PROD008': 5},
    outstandingBalance: 5120.50,
  },
  { 
    id: 'CUST004', 
    name: 'Sunita Devi', 
    email: 'sunita.d@example.com', 
    phone: '9876543213', 
    location: 'Kolkata, West Bengal',
    joinDate: '2022-07-01', 
    totalSpent: 34000,
    avatarUrl: 'https://i.pravatar.cc/40?u=sunita',
    outstandingBalance: 0,
  },
  { 
    id: 'CUST005', 
    name: 'Vikram Patel', 
    email: 'vikram.p@example.com', 
    phone: '9876543214', 
    location: 'Ahmedabad, Gujarat',
    joinDate: '2023-02-11', 
    totalSpent: 98000,
    avatarUrl: 'https://i.pravatar.cc/40?u=vikram',
    outstandingBalance: 1500,
  },
];

export const mockSuppliers: Supplier[] = [
  { 
    id: 'SUPP001', 
    name: 'Himalayan Grains Co.', 
    contactPerson: 'Anand Mehta', 
    email: 'anand.m@himalayangrains.com', 
    phone: '9123456780', 
    address: 'Dehradun, Uttarakhand', 
    joinDate: '2021-08-10' 
  },
  { 
    id: 'SUPP002', 
    name: 'Deccan Pulses Ltd.', 
    contactPerson: 'Sunita Rao', 
    email: 's.rao@deccanpulses.co.in', 
    phone: '9123456781', 
    address: 'Hyderabad, Telangana', 
    joinDate: '2020-11-05' 
  },
  { 
    id: 'SUPP003', 
    name: 'Healthy Oils Inc.', 
    contactPerson: 'Vikram Singh', 
    email: 'vikram.s@healthyoils.com', 
    phone: '9123456782', 
    address: 'Pune, Maharashtra', 
    joinDate: '2022-02-20' 
  },
  { 
    id: 'SUPP004', 
    name: 'Golden Harvest', 
    contactPerson: 'Priya Kapoor', 
    email: 'priya.k@goldenharvest.com', 
    phone: '9123456783', 
    address: 'Ludhiana, Punjab', 
    joinDate: '2019-05-15' 
  },
  { 
    id: 'SUPP005', 
    name: 'Sweet Life', 
    contactPerson: 'Rohan Sharma', 
    email: 'rohan.sharma@sweetlife.com', 
    phone: '9123456784', 
    address: 'Mumbai, Maharashtra', 
    joinDate: '2023-01-01' 
  },
];

const defaultSettings = {
  language: 'en' as const,
  currency: 'LKR' as const,
  notifications: {
    newOrders: true,
    lowStockAlerts: false,
  },
};

export const mockUsers: User[] = [
  { id: 'USER001', name: 'Manoj Desai', email: 'manoj.d@shivamdist.com', phone: '9876543210', role: UserRole.Admin, status: UserStatus.Active, avatarUrl: 'https://i.pravatar.cc/40?u=md', lastLogin: '2023-10-27T10:00:00Z', password: 'adminpassword123', settings: defaultSettings },
  { id: 'USER002', name: 'Priya Singh', email: 'priya.s@shivamdist.com', phone: '9876543211', role: UserRole.Manager, status: UserStatus.Active, avatarUrl: 'https://i.pravatar.cc/40?u=priya', lastLogin: '2023-10-27T09:30:00Z', password: 'managerpass456', settings: { ...defaultSettings, language: 'hi' } },
  { id: 'USER003', name: 'Rahul Verma', email: 'rahul.v@shivamdist.com', phone: '9876543212', role: UserRole.Sales, status: UserStatus.Active, avatarUrl: 'https://i.pravatar.cc/40?u=rahul', lastLogin: '2023-10-26T15:45:00Z', password: 'salespassword789', settings: defaultSettings, assignedSupplierNames: ['Himalayan Grains Co.', 'Deccan Pulses Ltd.'] },
  { id: 'USER004', name: 'Anjali Sharma', email: 'anjali.s@shivamdist.com', phone: '9876543213', role: UserRole.Sales, status: UserStatus.Inactive, avatarUrl: 'https://i.pravatar.cc/40?u=anjali', lastLogin: '2023-09-15T11:20:00Z', password: 'salespassinactive', settings: defaultSettings, assignedSupplierNames: ['Golden Harvest'] },
  { id: 'USER005', name: 'Sanjay Gupta', email: 'sanjay.g@shivamdist.com', phone: '9876543214', role: UserRole.Manager, status: UserStatus.Active, avatarUrl: 'https://i.pravatar.cc/40?u=sanjay', lastLogin: '2023-10-27T08:00:00Z', password: 'managergupta1', settings: defaultSettings },
  { id: 'USER006', name: 'Arjun Reddy', email: 'arjun.r@shivamdist.com', phone: '9876543215', role: UserRole.Driver, status: UserStatus.Active, avatarUrl: 'https://i.pravatar.cc/40?u=arjun', lastLogin: '2023-10-27T11:00:00Z', password: 'driverreddy2', settings: defaultSettings },
  { id: 'USER007', name: 'Kiran Rao', email: 'kiran.r@shivamdist.com', phone: '9876543216', role: UserRole.Driver, status: UserStatus.Active, avatarUrl: 'https://i.pravatar.cc/40?u=kiran', lastLogin: '2023-10-27T11:05:00Z', password: 'driverrao3', settings: defaultSettings },
  { id: 'USER008', name: 'Sita Kumari', email: 'sita.k@shivamdist.com', phone: '9876543217', role: UserRole.Driver, status: UserStatus.Inactive, avatarUrl: 'https://i.pravatar.cc/40?u=sita', lastLogin: '2023-09-27T11:00:00Z', password: 'driverkumari4', settings: defaultSettings },
];

export const mockSalesData: SalesData[] = [
  { month: 'Jan', sales: 4000 },
  { month: 'Feb', sales: 3000 },
  { month: 'Mar', sales: 5000 },
  { month: 'Apr', sales: 4500 },
  { month: 'May', sales: 6000 },
  { month: 'Jun', sales: 5500 },
  { month: 'Jul', sales: 7000 },
];

export const mockTopProducts: StockData[] = mockProducts
    .sort((a,b) => b.stock - a.stock)
    .slice(0, 5)
    .map(p => ({name: p.name, stock: p.stock}));

const today = new Date().toISOString().split('T')[0];

export const mockDriverAllocations: DriverAllocation[] = [
    {
        id: 'ALLOC001',
        driverId: 'USER006',
        driverName: 'Arjun Reddy',
        date: today,
        allocatedItems: [
            { productId: 'PROD001', quantity: 10 },
            { productId: 'PROD004', quantity: 20 },
            { productId: 'PROD002', quantity: 15 },
        ],
        returnedItems: null,
        salesTotal: 0,
        status: 'Allocated',
    }
];

export const mockDriverSales: DriverSale[] = [
    {
        id: 'DSALE001',
        driverId: 'USER006',
        allocationId: 'ALLOC001',
        date: new Date().toISOString(),
        soldItems: [
            { productId: 'PROD001', quantity: 2, price: 160.00 },
            { productId: 'PROD004', quantity: 5, price: 60.00 }
        ],
        total: (2 * 160) + (5 * 60), // 620
        customerName: 'Local Shop A',
        amountPaid: 620,
        creditAmount: 0,
        paymentMethod: 'Cash',
    },
    {
        id: 'DSALE002',
        driverId: 'USER006',
        allocationId: 'ALLOC001',
        date: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // 5 minutes ago
        soldItems: [
            { productId: 'PROD002', quantity: 10, price: 125.00 }, // 1250
        ],
        total: 1250,
        customerId: 'CUST003',
        customerName: 'Amit Singh',
        amountPaid: 1000,
        creditAmount: 250,
        paymentMethod: 'Bank',
        paymentReference: 'UPI:amit@okbank',
        notes: 'Promised to pay balance by EOD'
    }
];