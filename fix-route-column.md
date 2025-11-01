# Fix: Add Route Column to Customers Table

## Error
```
Error adding customer: Could not find the 'route' column of 'customers' in the schema cache
```

## Solution
The `route` column is missing from the `customers` table in the Supabase database. Follow these steps to fix it:

### Step 1: Run SQL Migration in Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor** 
3. Run the following SQL command:

```sql
-- Add route column to customers table
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS route VARCHAR(100) DEFAULT 'Unassigned';

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_customers_route ON customers (route);

-- Update existing customers to have default route
UPDATE customers 
SET route = 'Unassigned' 
WHERE route IS NULL;
```

### Step 2: Verify the Changes

After running the SQL, verify that:
- The `route` column exists in the `customers` table
- All existing customers have `route = 'Unassigned'`
- New customers can be added with route assignments

### Step 3: Test the Application

1. Try adding a new customer
2. Verify that route filtering works in the customer management interface
3. Check that customers can be assigned to different routes

## Files Updated
- ✅ `database-types.ts` - Added `route?: string` to DatabaseCustomer interface
- ✅ `types.ts` - Already had `route?: string` in Customer interface
- ✅ `supabase_migrations/add_route_to_customers.sql` - Migration script created

## Database Schema After Migration
```sql
customers (
  id: string,
  name: string,
  email: string, 
  phone: string,
  location: string,
  gpscoordinates: string,
  route: string DEFAULT 'Unassigned',  -- NEW COLUMN
  joindate: string,
  totalspent: number,
  outstandingbalance: number,
  avatarurl: string,
  discounts: object
)
```

The route column allows customers to be organized by delivery routes for better logistics planning.