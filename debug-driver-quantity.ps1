# Driver Quantity Multiplication Debug & Fix Script
Write-Host "🔧 Driver Quantity 4x Multiplication - Debug & Fix" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green

Write-Host ""
Write-Host "🐛 Problem: Driver shows 4x quantity (5 becomes 20)" -ForegroundColor Red

Write-Host ""
Write-Host "🔍 What I've Added for Debugging:" -ForegroundColor Cyan
Write-Host "1. ✅ Duplicate allocation detection" -ForegroundColor White
Write-Host "2. ✅ Duplicate product detection in same allocation" -ForegroundColor White 
Write-Host "3. ✅ Delivery aggregation duplicate checking" -ForegroundColor White
Write-Host "4. ✅ Detailed console logging throughout" -ForegroundColor White
Write-Host "5. ✅ Allocation save/load debugging" -ForegroundColor White

Write-Host ""
Write-Host "🧪 Testing Steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "Step 1: Open your application" -ForegroundColor White
Write-Host "Step 2: Open browser console (F12)" -ForegroundColor White
Write-Host "Step 3: Go to Drivers page" -ForegroundColor White
Write-Host "Step 4: Click 'View Daily Log' for a driver with allocations" -ForegroundColor White
Write-Host "Step 5: Look for these console messages:" -ForegroundColor White

Write-Host ""
Write-Host "🔍 Key Console Messages to Check:" -ForegroundColor Cyan
Write-Host "• '⚠️ DUPLICATE ALLOCATIONS DETECTED' - Multiple allocations for same date" -ForegroundColor Yellow
Write-Host "• '⚠️ PRODUCT [id] appears X times in same allocation!' - Product duplicated" -ForegroundColor Yellow  
Write-Host "• '⚠️ Duplicate product in delivery list' - Delivery aggregation issue" -ForegroundColor Yellow
Write-Host "• '📦 Product [name]: allocated=X' - Check if X matches expected quantity" -ForegroundColor Green

Write-Host ""
Write-Host "🎯 Expected Behavior:" -ForegroundColor Green
Write-Host "• Delivery: 5 units → Allocation: 5 units → Driver sees: 5 units" -ForegroundColor White
Write-Host "• No duplication warnings in console" -ForegroundColor White
Write-Host "• Only 1 active allocation per driver per date" -ForegroundColor White

Write-Host ""
Write-Host "🔧 Possible Root Causes:" -ForegroundColor Red
Write-Host "1. Multiple allocations for same date/driver" -ForegroundColor White
Write-Host "2. Same product allocated multiple times in single allocation" -ForegroundColor White
Write-Host "3. Delivery aggregation creating duplicates" -ForegroundColor White
Write-Host "4. Database storing duplicate records" -ForegroundColor White

Write-Host ""
Write-Host "📊 Manual Database Check:" -ForegroundColor Cyan
Write-Host "Go to Supabase → SQL Editor → Run:" -ForegroundColor White
Write-Host "SELECT driver_id, date, COUNT(*) as count" -ForegroundColor Yellow
Write-Host "FROM driver_allocations" -ForegroundColor Yellow  
Write-Host "GROUP BY driver_id, date" -ForegroundColor Yellow
Write-Host "HAVING COUNT(*) > 1;" -ForegroundColor Yellow
Write-Host ""
Write-Host "(This will show duplicate allocations)" -ForegroundColor Gray

Write-Host ""
Write-Host "🚀 After Testing:" -ForegroundColor Green
Write-Host "Share the console log messages that show:" -ForegroundColor White
Write-Host "• Which warnings appear" -ForegroundColor White
Write-Host "• The actual quantities being shown vs expected" -ForegroundColor White
Write-Host "• Any duplicate detection messages" -ForegroundColor White

Write-Host ""
Read-Host "Press Enter to continue..."