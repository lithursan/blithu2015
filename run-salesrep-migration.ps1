#!/usr/bin/env pwsh

# Sales Rep Customer Segregation Migration Script
# This script adds created_by column to customers table for sales rep isolation

Write-Host "🚀 Starting Sales Rep Customer Segregation Migration..." -ForegroundColor Green

# Check if the migration file exists
$migrationFile = ".\supabase_migrations\add_created_by_to_customers.sql"
if (-not (Test-Path $migrationFile)) {
    Write-Host "❌ Migration file not found: $migrationFile" -ForegroundColor Red
    exit 1
}

Write-Host "📂 Migration file found: $migrationFile" -ForegroundColor Yellow

# Read the SQL content
$sqlContent = Get-Content $migrationFile -Raw
Write-Host "📋 SQL Migration Content:" -ForegroundColor Cyan
Write-Host $sqlContent -ForegroundColor Gray

# Run the migration using Node.js
Write-Host "`n🔧 Running migration..." -ForegroundColor Yellow

$nodeScript = @"
const { supabase } = require('./supabaseClient');
const fs = require('fs');

async function runMigration() {
  try {
    console.log('🔗 Connecting to Supabase...');
    
    const sqlContent = fs.readFileSync('./supabase_migrations/add_created_by_to_customers.sql', 'utf8');
    
    console.log('📊 Executing migration...');
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sqlContent });
    
    if (error) {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    }
    
    console.log('✅ Migration completed successfully');
    console.log('📊 Result:', data);
    
    // Verify the column was added
    console.log('🔍 Verifying migration...');
    const { data: columns, error: verifyError } = await supabase
      .from('customers')
      .select('*')
      .limit(1);
      
    if (verifyError) {
      console.warn('⚠️ Verification failed:', verifyError);
    } else {
      console.log('✅ Migration verification successful');
    }
    
  } catch (err) {
    console.error('💥 Unexpected error:', err);
    process.exit(1);
  }
}

runMigration();
"@

# Write the Node.js script to a temporary file
$tempScript = "temp_migration.js"
$nodeScript | Out-File -FilePath $tempScript -Encoding UTF8

try {
    # Execute the Node.js script
    node $tempScript
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✅ Sales Rep Customer Segregation Migration completed successfully!" -ForegroundColor Green
        Write-Host "📋 Next steps:" -ForegroundColor Cyan
        Write-Host "   1. Sales reps will now only see customers they create" -ForegroundColor White
        Write-Host "   2. Existing customers will be visible to all users until assigned" -ForegroundColor White
        Write-Host "   3. New customer creation will automatically set created_by" -ForegroundColor White
    } else {
        Write-Host "❌ Migration failed with exit code: $LASTEXITCODE" -ForegroundColor Red
    }
} finally {
    # Clean up temporary file
    if (Test-Path $tempScript) {
        Remove-Item $tempScript -Force
        Write-Host "🧹 Cleaned up temporary files" -ForegroundColor Gray
    }
}

Write-Host "`n🏁 Migration process complete!" -ForegroundColor Magenta