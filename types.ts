export enum OrderStatus {
  Pending = 'Pending',
  Shipped = 'Shipped',
  Delivered = 'Delivered',
  Cancelled = 'Cancelled',
}

export enum UserRole {
  Admin = 'Admin',
  Secretary = 'Secretary',
  Manager = 'Manager',
  Sales = 'Sales Rep',
  Driver = 'Driver',
}

export enum UserStatus {
  Active = 'Active',
  Inactive = 'Inactive',
}

export interface UserSettings {
  language: 'en' | 'es' | 'hi';
  currency: 'LKR' | 'USD' | 'INR';
  notifications: {
    newOrders: boolean;
    lowStockAlerts: boolean;
  };
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  avatarUrl: string;
  lastLogin: string;
  password?: string;
  settings: UserSettings;
  assignedSupplierNames?: string[];
  currentLocation?: {
    latitude: number;
    longitude: number;
    timestamp: string;
    accuracy?: number;
  };
  locationSharing?: boolean;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  costPrice?: number; // purchase price
  stock: number;
  sku: string;
  supplier: string;
  imageUrl: string;
}

export interface OrderItem {
  productId: string;
  quantity: number;
  price: number; // price at the time of order to prevent changes if product price updates
  free?: number; // free quantity given with this item
  isReturn?: boolean; // true if this item is a returned product
}

export interface Order {
  id:string;
  customerId: string;
  customerName: string;
  date: string;
  created_at?: string; // Timestamp when the order was created
  expectedDeliveryDate?: string;
  deliveryAddress?: string; // Specific delivery address for this order
  total: number;
  status: OrderStatus;
  orderItems: OrderItem[];
  backorderedItems?: OrderItem[];
  freeItems?: OrderItem[]; // Free items given with the order
  chequeBalance?: number;
  creditBalance?: number;
  assignedUserId?: string; // ID of the user (Sales Rep or Driver) who created/manages the order
  returnAmount?: number; // Amount returned for this order
  amountPaid?: number; // Amount paid for this order
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  gpsCoordinates?: string; // GPS coordinates in "lat, lng" format
  route?: string; // Route assignment for delivery planning
  joinDate: string;
  totalSpent: number;
  avatarUrl: string;
  discounts?: Record<string, number>; // ProductID: discount percentage
  outstandingBalance: number;

  created_by?: string; // ID of the sales rep/user who created this customer
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  joinDate: string;
}

export interface SalesData {
  month: string;
  sales: number;
}

export interface StockData {
    name: string;
    stock: number;
}

export interface DriverAllocation {
  id: string;
  driverId: string;
  driverName: string;
  date: string; // YYYY-MM-DD
  allocatedItems: { productId: string; quantity: number; sold?: number }[];
  returnedItems: { productId: string; quantity: number }[] | null;
  salesTotal: number;
  status: 'Allocated' | 'Reconciled';
}

export interface DriverSale {
  id: string;
  driverId: string;
  allocationId: string;
  date: string; // YYYY-MM-DD HH:mm:ss
  soldItems: { productId: string; quantity: number; price: number }[];
  total: number;
  customerName: string;
  customerId?: string;
  amountPaid: number;
  creditAmount: number;
  paymentMethod: 'Cash' | 'Bank' | 'Cheque' | 'Mixed' | 'Credit';
  paymentReference?: string; // For Cheque No or Transaction ID
  notes?: string;
}

export interface Route {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  isActive: boolean;
}