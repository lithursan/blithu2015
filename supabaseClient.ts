import { createClient } from '@supabase/supabase-js';
import { Supplier } from './types';

const supabaseUrl = 'https://xsoptewtyrogfepnpsde.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzb3B0ZXd0eXJvZ2ZlcG5wc2RlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1NjE0NTcsImV4cCI6MjA3MzEzNzQ1N30.y42ifDCqqbmK5cnpOxLLA796XMNG1w6EbmuibHgX1PI';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Supabase update helper functions
export const updateProductStock = async (productId: string, newStock: number) => {
  await supabase.from('products').update({ stock: newStock }).eq('id', productId);
};

export const updateOrderStatus = async (orderId: string, newStatus: string) => {
  await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
};

export const updateSupplierDetails = async (supplierId: string, newDetails: Partial<Supplier>) => {
  await supabase.from('suppliers').update(newDetails).eq('id', supplierId);
};

// Fetch latest data after update
export const fetchProducts = async () => {
  const { data } = await supabase.from('products').select('*');
  if (!data) return [];
  
  // Map the raw data to proper Product objects (same as DataContext mapping)
  return data.map((row: any) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    price: row.price,
    costPrice: row.costprice == null || isNaN(Number(row.costprice)) ? 0 : Number(row.costprice),
    stock: row.stock,
    sku: row.sku,
    supplier: row.supplier,
    imageUrl: row.imageurl || row.imageUrl || '',
  }));
};

export const fetchOrders = async () => {
  const { data } = await supabase.from('orders').select('*');
  if (!data) return [];
  
  // Map the raw data to proper Order objects (same as DataContext mapping)
  return data.map((row: any) => ({
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
    freeItems: typeof row.freeitems === 'string' ? JSON.parse(row.freeitems) : (row.freeitems || []),
    chequeBalance: row.chequebalance == null || isNaN(Number(row.chequebalance)) ? 0 : Number(row.chequebalance),
    creditBalance: row.creditbalance == null || isNaN(Number(row.creditbalance)) ? 0 : Number(row.creditbalance),
    returnAmount: row.returnamount == null || isNaN(Number(row.returnamount)) ? 0 : Number(row.returnamount),
    amountPaid: row.amountpaid == null || isNaN(Number(row.amountpaid)) ? 0 : Number(row.amountpaid),
  }));
};

export const fetchSuppliers = async () => {
  const { data } = await supabase.from('suppliers').select('*');
  if (!data) return [];
  
  // Map the raw data to proper Supplier objects (same as DataContext mapping)
  return data.map((row: any) => ({
    id: row.id,
    name: row.name,
    contactPerson: row.contactperson,
    email: row.email,
    phone: row.phone,
    address: row.address,
    joinDate: row.joindate,
  }));
};
