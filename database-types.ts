// Database row types for Supabase tables
// These interfaces represent the actual database schema

export interface DatabaseOrder {
  id: string;
  customerid: string;
  customername: string;
  orderdate: string;
  created_at?: string; // Timestamp when order was created
  totalamount: number;
  status: string;
  paymentmethod?: string;
  notes?: string;
  assigneduserid?: string;
  orderitems: string | object; // JSON string or already parsed object
  backordereditems?: string | object;
  freeitems?: string | object; // JSON string or already parsed object for free items
  expecteddeliverydate?: string;
  chequebalance?: number;
  creditbalance?: number;
  deliveryaddress?: string;
}

export interface DatabaseProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  sku: string;
  supplier: string;
  imageurl?: string;
}

export interface DatabaseCustomer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  location: string;
  gpscoordinates?: string;
  route?: string;
  joindate: string;
  totalspent: number;
  outstandingbalance: number;
  avatarurl?: string;
  discounts?: object;
}

export interface DatabaseSupplier {
  id: string;
  name: string;
  contactperson: string;
  email: string;
  phone: string;
  address: string;
  joindate: string;
}

export interface DatabaseUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  status: string;
  avatarurl?: string;
  lastlogin?: string;
  password?: string;
  assignedsuppliernames?: string[];
  settings?: object;
  currentlocation?: {
    latitude: number;
    longitude: number;
    timestamp: string;
    accuracy?: number;
  };
  locationsharing?: boolean;
}

export interface DatabaseDriverAllocation {
  id: string;
  driverid?: string;
  driver_id?: string;
  drivername?: string;
  driver_name?: string;
  date: string;
  allocated_items?: string | object;
  allocateditems?: string | object;
  returned_items?: string | object;
  returneditems?: string | object;
  sales_total?: number;
  salestotal?: number;
  status?: string;
}

export interface DatabaseDriverSale {
  id: string;
  driver_id: string;
  allocation_id: string;
  date: string;
  sold_items: string | object;
  total: number;
  customer_name?: string;
  customer_id?: string;
  amount_paid: number;
  credit_amount: number;
  payment_method: string;
  payment_reference?: string;
  notes?: string;
}

// Helper type for JSON parsing safety
export type JsonParseResult<T> = {
  success: true;
  data: T;
} | {
  success: false;
  error: string;
  fallback: T;
};

// Safe JSON parser with error handling
export function safeJsonParse<T>(
  jsonString: string | object,
  fallback: T,
  fieldName?: string,
  rowId?: string
): JsonParseResult<T> {
  if (typeof jsonString !== 'string') {
    return { success: true, data: jsonString as T };
  }

  try {
    const parsed = JSON.parse(jsonString);
    return { success: true, data: parsed };
  } catch (error) {
    const errorMessage = `Error parsing JSON ${fieldName ? `for field ${fieldName}` : ''} ${rowId ? `in row ${rowId}` : ''}: ${error instanceof Error ? error.message : 'Unknown error'}`;
    console.error(errorMessage);
    console.error('Raw data that failed to parse:', jsonString);
    return { 
      success: false, 
      error: errorMessage, 
      fallback 
    };
  }
}