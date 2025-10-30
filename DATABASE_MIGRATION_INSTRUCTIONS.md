# Database Migration Instructions

## ⚠️ URGENT: Order Primary Key Error Fix

If you're getting the error **"duplicate key value violates unique constraint 'orders_pkey'"**, run this fix immediately:

### Quick Fix (PowerShell):
```powershell
.\fix-order-keys.ps1
```

### Manual Fix (SQL Editor):
1. Go to Supabase Dashboard → SQL Editor
2. Copy and paste all content from `fix_order_primary_key.sql`
3. Click "Run" to execute

This will:
- ✅ Fix duplicate order IDs
- ✅ Create unique ID generation system
- ✅ Prevent future duplicate key errors

---

## Live Location Tracking Migration

### Problem:
The live location tracking is not working because the database is missing the required columns.

### Solution:
Run the following SQL commands in your Supabase SQL Editor:

### Step 1: Open Supabase Dashboard
1. Go to https://app.supabase.com/
2. Select your project
3. Go to "SQL Editor"

### Step 2: Run this SQL Migration:

```sql
-- Add location tracking columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS currentlocation JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locationsharing BOOLEAN DEFAULT false;

-- Add comment to describe the columns
COMMENT ON COLUMN users.currentlocation IS 'Current GPS location of the user in JSON format {latitude, longitude, timestamp, accuracy}';
COMMENT ON COLUMN users.locationsharing IS 'Whether the user has enabled location sharing';

-- Create index for better performance on location queries
CREATE INDEX IF NOT EXISTS idx_users_locationsharing ON users(locationsharing) WHERE locationsharing = true;
CREATE INDEX IF NOT EXISTS idx_users_currentlocation ON users USING GIN(currentlocation) WHERE currentlocation IS NOT NULL;
```

### Step 3: Verify the Migration
After running the SQL, you can verify it worked by running:

```sql
-- Check if columns were added successfully
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('currentlocation', 'locationsharing');
```

### Step 4: Test the Live Location Tracking
1. Login as a Sales Rep or Driver
2. Go to "My Location" page
3. Click "Start Sharing" to enable location tracking
4. Login as Admin or Manager
5. Go to "Live Tracking" page
6. You should now see live locations updating

## Alternative: Using Supabase CLI (if you have it installed)
```bash
supabase migration new add_location_tracking_to_users
# Copy the SQL content to the generated migration file
supabase db push
```

## What these columns do:
- `currentlocation`: Stores GPS coordinates as JSON: `{latitude: 9.123, longitude: 80.456, timestamp: "2025-10-29T...", accuracy: 10}`
- `locationsharing`: Boolean flag to indicate if user has enabled location sharing (default: false)

## Security Note:
The location data is only visible to Admins and Managers. Sales Reps and Drivers can control their own location sharing but cannot see others' locations.