@echo off
color 0A
echo.
echo ===============================================
echo    🚨 LOCATION TRACKING - QUICK FIX GUIDE
echo ===============================================
echo.
echo PROBLEM: Location sharing shows "1" but no locations visible
echo CAUSE: Database missing required columns
echo.
echo ===============================================
echo    📋 SOLUTION - 3 Simple Steps:
echo ===============================================
echo.
echo STEP 1️⃣: Open Supabase Dashboard
echo    • Go to: https://app.supabase.com/
echo    • Select your project
echo    • Click "SQL Editor"
echo.
echo STEP 2️⃣: Copy and paste this SQL:
echo.
echo    ALTER TABLE users ADD COLUMN IF NOT EXISTS currentlocation JSONB;
echo    ALTER TABLE users ADD COLUMN IF NOT EXISTS locationsharing BOOLEAN DEFAULT false;
echo.
echo STEP 3️⃣: Click "Run" button in Supabase
echo.
echo ===============================================
echo    🎯 AFTER MIGRATION - Test Location:
echo ===============================================
echo.
echo Option A - Auto Demo Data:
echo    1. Go to Live Tracking page
echo    2. Click "🎯 Add Demo Data" button
echo    3. Refresh page to see locations on map
echo.
echo Option B - Real Location Sharing:
echo    1. Login as Sales Rep or Driver
echo    2. Go to "My Location" page  
echo    3. Click "Start Sharing"
echo    4. Login as Admin to see live locations
echo.
echo ===============================================
echo    🔧 Browser Debug Commands:
echo ===============================================
echo.
echo Open browser console (F12) and run:
echo    window.addDemoLocationData()     - Add test locations
echo    window.clearLocationData()       - Clear all locations  
echo    window.debugLocationTracking()   - Check database status
echo.
echo ===============================================
echo    📞 Need Help?
echo ===============================================
echo.
echo If locations still don't show after migration:
echo    1. Check browser console for errors
echo    2. Verify GPS permissions are enabled
echo    3. Ensure you're using HTTPS (required for GPS)
echo    4. Try the debug commands above
echo.
echo ===============================================
echo.
pause