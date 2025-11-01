# Fix Orders Primary Key Error - Step by Step Instructions

## Error Description
You're seeing: "Error adding order - Database migration required: duplicate key value violates unique constraint 'orders_pkey'"

## Root Cause
This error occurs when:
1. The database sequence for order IDs is out of sync with existing data
2. There might be duplicate ID values in the orders table
3. The primary key constraint has naming conflicts

## Solution Steps

### Step 1: Access Supabase SQL Editor
1. Go to https://app.supabase.com/
2. Select your project
3. Click on "SQL Editor" in the left sidebar
4. Click "New Query"

### Step 2: Run the Diagnostic Script
Copy and paste this SQL to understand the issue:

```sql
-- Check for duplicate IDs
SELECT id, COUNT(*) as count
FROM orders 
GROUP BY id 
HAVING COUNT(*) > 1;

-- Check current sequence value vs max ID
SELECT 
  MAX(id) as max_existing_id,
  (SELECT last_value FROM orders_id_seq) as sequence_value,
  CASE 
    WHEN (SELECT last_value FROM orders_id_seq) <= MAX(id) 
    THEN 'SEQUENCE OUT OF SYNC - This is the problem!' 
    ELSE 'Sequence is OK' 
  END as status
FROM orders;
```

### Step 3: Run the Fix Script
Copy and paste the complete fix script from `fix-orders-pkey-error.sql`:

```sql
-- ORDERS PRIMARY KEY FIX - Run this in Supabase SQL Editor
[Content of fix-orders-pkey-error.sql file]
```

### Step 4: Verify the Fix
After running the fix script, test by trying to create a new order in your application. The error should be resolved.

### Step 5: Prevention
To prevent this issue in the future:
- Don't manually insert orders with specific ID values
- Always let the database auto-generate IDs
- If you need to import data, use proper sequence management

## Alternative Quick Fix (If above doesn't work)

If the comprehensive fix doesn't resolve it, try this simple sequence reset:

```sql
-- Reset sequence to be higher than existing IDs
SELECT setval('orders_id_seq', (SELECT MAX(id) FROM orders) + 1);
```

## Testing
After running any fix:
1. Try to create a new order in your application
2. The error should be gone
3. New orders should be created successfully

## Need Help?
If you still see the error after these steps:
1. Check the Supabase logs for more detailed error messages
2. Verify all migration scripts have been run successfully
3. Ensure your application is not trying to insert orders with manual ID values

## Files Created for This Fix:
- `fix-orders-primary-key.sql` - Diagnostic script
- `fix-orders-pkey-error.sql` - Complete fix script
- `DATABASE_PRIMARY_KEY_FIX.md` - This instruction file