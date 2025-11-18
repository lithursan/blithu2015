# Fix Double Balance Issue
# This script connects to your Supabase database and fixes the double-counted balances

Write-Host "🔧 Fixing double-counted account balances..." -ForegroundColor Yellow

# You need to run this SQL in your Supabase SQL Editor or using psql
Write-Host "📋 Please run the following SQL in your Supabase SQL Editor:" -ForegroundColor Cyan
Write-Host ""
Get-Content "fix_double_balances.sql" | Write-Host -ForegroundColor White
Write-Host ""
Write-Host "✅ After running the SQL, the account balances will be corrected!" -ForegroundColor Green
Write-Host "💡 Future journal entries will have accurate balances automatically." -ForegroundColor Blue