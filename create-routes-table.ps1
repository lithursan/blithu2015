#!/usr/bin/env pwsh

# PowerShell script to create the routes table in Supabase
# This script runs the SQL migration to create the routes table

Write-Host "Creating routes table in Supabase..." -ForegroundColor Green

# Check if the SQL file exists
$sqlFile = "supabase_migrations/create_routes_table.sql"
if (-Not (Test-Path $sqlFile)) {
    Write-Host "Error: SQL migration file not found at $sqlFile" -ForegroundColor Red
    exit 1
}

# Read the SQL content
$sqlContent = Get-Content -Path $sqlFile -Raw

Write-Host "SQL Migration Content:" -ForegroundColor Yellow
Write-Host $sqlContent

Write-Host ""
Write-Host "To run this migration:" -ForegroundColor Cyan
Write-Host "1. Copy the SQL content above" -ForegroundColor White
Write-Host "2. Go to your Supabase dashboard > SQL Editor" -ForegroundColor White
Write-Host "3. Paste the SQL and run it" -ForegroundColor White
Write-Host ""
Write-Host "Or use the Supabase CLI:" -ForegroundColor Cyan
Write-Host "supabase db reset" -ForegroundColor White
Write-Host ""

# Try to run with supabase CLI if available
if (Get-Command "supabase" -ErrorAction SilentlyContinue) {
    Write-Host "Supabase CLI found. Attempting to apply migration..." -ForegroundColor Green
    
    # Check if supabase is initialized
    if (Test-Path ".supabase") {
        Write-Host "Running migration with Supabase CLI..." -ForegroundColor Yellow
        supabase db push
    } else {
        Write-Host "Supabase project not initialized locally." -ForegroundColor Yellow
        Write-Host "Please run 'supabase init' first or apply the migration manually." -ForegroundColor Yellow
    }
} else {
    Write-Host "Supabase CLI not found. Please apply the migration manually." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Migration setup complete!" -ForegroundColor Green
Write-Host "The route management functionality will work with local storage until the database table is created." -ForegroundColor White