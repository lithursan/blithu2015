# Supabase 409 Error Fix Guide

## Error Analysis
- Status 409: Conflict 
- URL shows specific columns being requested
- Error occurs when fetching customers table

## Possible Causes
1. **Column name mismatch** - Frontend expecting different column names than database
2. **Database schema change** - Columns renamed/removed in Supabase
3. **Query parameter encoding issue** - Special characters in column names
4. **Cache/Browser issue** - Old requests cached

## Database Column Mapping (Expected vs Actual)
Based on DataContext.tsx mapping, we expect these columns in customers table:

| Frontend Property | Database Column (expected) |
|------------------|---------------------------|
| id | id |
| name | name |
| email | email |
| phone | phone |
| location | location |
| joinDate | joindate |
| totalSpent | totalspent |
| outstandingBalance | outstandingbalance |
| avatarUrl | avatarurl |
| discounts | discounts |

## Solutions to Try

### 1. Check Database Schema
Login to Supabase dashboard and verify customers table has these exact columns:
- id, name, email, phone, location, joindate, totalspent, outstandingbalance, avatarurl, discounts

### 2. Clear Browser Cache
- Hard refresh (Ctrl+F5)
- Clear browser cache and local storage
- Try incognito mode

### 3. Check Network Tab
- Open Developer Tools
- Go to Network tab
- Try to reproduce error
- Check exact request URL and response

### 4. Test Direct Query
In Supabase SQL Editor, try:
```sql
SELECT * FROM customers LIMIT 1;
```

### 5. Fix Column Names
If database has different column names, update DataContext.tsx mapping accordingly.