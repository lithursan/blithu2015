# Driver Quantity Multiplication Debug Script

## 🔍 Step-by-Step Debugging Guide

### Issue: Driver shows 4x quantity (5 becomes 20)

### Debugging Steps:

1. **Open Browser Console (F12)**
   - Go to Console tab
   - Clear console logs

2. **Go to Drivers Page**
   - Navigate to /drivers
   - Select a driver with allocations

3. **Click "View Daily Log"**
   - Look for these console messages:
   
   ```
   🔍 All driver allocations from database: [...]
   🔍 Checking allocation [id]: driverId=[...], idMatch=[...] 
   ✅ Filtered active allocations for driver [name]: [...]
   ✅ Unique allocations after deduplication: [...]
   🔍 Active allocations for driver [name]: [...]
   📊 Total active allocations count: [number]
   📋 Using latest allocation date: [date]
   📦 Product [id]: allocated=[qty], sold=[sold], remaining=[remaining]
   ```

4. **Check for Issues:**

   **Issue A: Multiple Allocations**
   - If "Total active allocations count" > 1
   - This means multiple allocations for same driver
   - Should be deduplicated

   **Issue B: Duplicate Products in Same Allocation**
   - Look for: "PRODUCT [id] appears [X] times in same allocation!"
   - This means same product allocated multiple times

   **Issue C: Wrong Allocation Data**
   - Check if allocated quantity matches expected
   - Compare with delivery quantity

### Manual Verification:

1. **Check Database:**
   - Go to Supabase Dashboard
   - Run: `SELECT * FROM driver_allocations WHERE driver_id = '[driver_id]'`
   - Count how many rows for same date

2. **Check Product Display:**
   - In Daily Log → Add Sale modal
   - Look for: "🛍️ Product [name] in sale modal: allocated=[qty]"
   - In Reconciliation tab
   - Look for: "📋 Reconciliation table - Product [name]: allocated=[qty]"

### Expected Behavior:
- ✅ Only 1 active allocation per driver per date
- ✅ Each product appears once in allocation
- ✅ allocated = delivery quantity (e.g., 5)
- ✅ remaining = allocated - sold

### If Issue Persists:
Share these console logs:
1. All allocation-related console messages
2. Database query results 
3. Specific product quantities seen vs expected