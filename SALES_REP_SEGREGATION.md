# Sales Rep Customer Segregation System

## Overview
This system ensures that sales representatives can only view and manage customers they have personally created. This provides complete isolation between different sales reps while allowing administrators to maintain oversight.

## 🔐 Access Control Rules

### Sales Representatives (UserRole.Sales)
- ✅ Can **ONLY** see customers where `created_by = currentUser.id`
- ✅ Can create new customers (automatically assigned to them)
- ✅ Can edit customers they created
- ✅ Can delete customers they created (if permissions allow)
- ❌ **CANNOT** see other sales reps' customers
- ❌ **CANNOT** access customers created by other users

### Drivers (UserRole.Driver) 
- ✅ Can see customers they created (if any)
- ✅ Can create customers (automatically assigned to them)
- ❌ **CANNOT** see other users' customers

### Administrators & Managers
- ✅ Can see **ALL** customers regardless of creator
- ✅ Can manage all customers 
- ✅ Can see ownership badges showing who created each customer
- ✅ Full administrative access across all sales reps

## 🎯 Key Features

### 1. **Automatic Customer Assignment**
- When any user creates a customer, `created_by` is automatically set to their user ID
- No manual assignment needed - completely transparent to the user

### 2. **Visual Ownership Indicators**
- **"👤 My Customer"** badge for customers created by current user (green badge)
- **"👥 CreatorID"** badge for administrators to see who created each customer
- Color-coded badges for easy identification

### 3. **Route-Based + User-Based Filtering**
- Customers are filtered by BOTH route AND creator
- Sales Rep 1 in Route A cannot see Sales Rep 2's customers in Route A
- Perfect segregation while maintaining route organization

### 4. **Contextual Information Cards**
- Sales reps see blue info card explaining their restricted access
- Admins see green info card explaining their full access
- Clear communication of access levels

## 🚀 Implementation Details

### Database Schema
```sql
-- Added to customers table
ALTER TABLE customers 
  ADD COLUMN IF NOT EXISTS created_by varchar;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_customers_created_by ON customers(created_by);
```

### Filtering Logic
```typescript
const filteredCustomers = customers.filter(customer => {
  // Route filtering (existing)
  const matchesRoute = selectedRoute === 'All Routes' || route === selectedRoute;
  
  // Search filtering (existing)
  const matchesSearch = /* search logic */;
  
  // NEW: Sales Rep Segregation
  const matchesSalesRepAccess = (() => {
    if (currentUser?.role === UserRole.Sales) {
      return customer.created_by === currentUser.id; // Only own customers
    } else if (currentUser?.role === UserRole.Admin || currentUser?.role === UserRole.Manager) {
      return true; // All customers
    }
    return customer.created_by === currentUser.id; // Default: own customers only
  })();
  
  return matchesRoute && matchesSearch && matchesSalesRepAccess;
});
```

### Customer Creation
```typescript
const newCustomer = {
  // ... other fields
  created_by: currentUser?.id || 'system', // Automatic assignment
};
```

## 💼 Business Benefits

### For Sales Teams
- **Complete Privacy**: Sales reps cannot interfere with each other's customers
- **Individual Accountability**: Clear ownership and responsibility
- **Route Flexibility**: Multiple sales reps can work in same route without conflicts

### For Management
- **Full Oversight**: Administrators can monitor all sales reps
- **Performance Tracking**: Easy to identify top-performing sales reps
- **Data Security**: Sensitive customer data is protected between sales teams

### For Business Growth
- **Scalability**: Easy to add new sales reps without data conflicts
- **Territorial Management**: Clear customer territories and ownership
- **Reduced Errors**: No accidental modifications of other reps' customers

## 🔧 Migration & Setup

### 1. Database Migration
```bash
# Run the migration script
.\run-salesrep-migration.ps1
```

### 2. Existing Customers
- Existing customers will have `created_by = NULL` initially
- They will be visible to ALL users until manually assigned
- Admins can update `created_by` field to assign ownership

### 3. Testing Scenarios
1. **Sales Rep Login**: Should only see their own customers
2. **Admin Login**: Should see all customers with ownership badges
3. **Customer Creation**: Should automatically set `created_by`
4. **Route Switching**: Should maintain user filtering across routes

## 🛠️ Troubleshooting

### Sales Rep Cannot See Expected Customers
- Check if `created_by` field matches their user ID
- Verify user role is correctly set to `UserRole.Sales`
- Check if customers were created before migration (will be NULL)

### Admin Cannot See All Customers
- Verify user role is `UserRole.Admin` or `UserRole.Manager`
- Check database connection and data fetching

### Migration Issues
- Ensure Supabase connection is working
- Check if `created_by` column was successfully added
- Verify database permissions for schema modifications

## 📊 Example Usage

### Sales Rep View
```
Route 1 Customer List (Showing 3 customers you created)
┌─────────────────────────────────┐
│ John Doe        👤 My Customer │
│ 📞 077-123-4567                 │
│ GPS: Colombo                    │
└─────────────────────────────────┘
```

### Admin View  
```
Route 1 Customer List (Showing 8 customers total)
┌─────────────────────────────────┐
│ John Doe        👤 My Customer │  ← Created by current admin
│ 📞 077-123-4567                 │
│ GPS: Colombo                    │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ Jane Smith      👥 SALES001... │  ← Created by Sales Rep 1
│ 📞 071-987-6543                 │
│ GPS: Kandy                      │
└─────────────────────────────────┘
```

This system provides complete customer segregation while maintaining administrative oversight and clear visual indicators for ownership tracking.