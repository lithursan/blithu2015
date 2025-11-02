#!/usr/bin/env pwsh
# Fix Order Primary Key Issues
# This script runs the database migration to resolve duplicate order ID issues

Write-Host "🔧 Starting Order Primary Key Fix Migration..." -ForegroundColor Yellow

# Check if supabase CLI is available
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Supabase CLI not found. Please install it first:" -ForegroundColor Red
    Write-Host "npm install -g supabase" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Alternative: Run the SQL directly in your Supabase dashboard:" -ForegroundColor Yellow
    Write-Host "1. Go to https://app.supabase.com" -ForegroundColor Cyan
    Write-Host "2. Open your project" -ForegroundColor Cyan
    Write-Host "3. Go to SQL Editor" -ForegroundColor Cyan
    Write-Host "4. Copy and paste the contents of fix_order_primary_key.sql" -ForegroundColor Cyan
    exit 1
}

# Check if supabase is logged in
$loginCheck = supabase status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Please login to Supabase first:" -ForegroundColor Red
    Write-Host "supabase login" -ForegroundColor Cyan
    Write-Host "Error details: $loginCheck" -ForegroundColor Gray
    exit 1
}

Write-Host "📁 Checking for migration file..." -ForegroundColor Blue
if (-not (Test-Path "fix_order_primary_key.sql")) {
    Write-Host "❌ Migration file fix_order_primary_key.sql not found!" -ForegroundColor Red
    exit 1
}

Write-Host "🚀 Running migration to fix order primary key issues..." -ForegroundColor Green

try {
    # Run the migration
    $result = supabase db push --file fix_order_primary_key.sql 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Migration completed successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "📊 What was fixed:" -ForegroundColor Yellow
        Write-Host "• Resolved any duplicate order IDs" -ForegroundColor White
        Write-Host "• Created orders_id_seq sequence for unique ID generation" -ForegroundColor White
        Write-Host "• Added generate_next_order_id() function" -ForegroundColor White
        Write-Host "• Updated order creation to prevent future duplicates" -ForegroundColor White
        Write-Host ""
        Write-Host "🎉 You can now create orders without duplicate key errors!" -ForegroundColor Green
    } else {
        Write-Host "❌ Migration failed. Error output:" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
        Write-Host ""
        Write-Host "📝 Manual steps:" -ForegroundColor Yellow
        Write-Host "1. Copy the SQL from fix_order_primary_key.sql" -ForegroundColor Cyan
        Write-Host "2. Paste it into Supabase SQL Editor" -ForegroundColor Cyan
        Write-Host "3. Run the queries one by one" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Error running migration: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "📝 Please run the SQL manually:" -ForegroundColor Yellow
    Write-Host "1. Open fix_order_primary_key.sql" -ForegroundColor Cyan
    Write-Host "2. Copy all content" -ForegroundColor Cyan
    Write-Host "3. Paste in Supabase SQL Editor" -ForegroundColor Cyan
    Write-Host "4. Execute the SQL" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "📖 For more help, check DATABASE_MIGRATION_INSTRUCTIONS.md" -ForegroundColor Blue