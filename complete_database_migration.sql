-- COMPREHENSIVE DATABASE MIGRATION
-- This fixes all missing columns for the Distribution Management System

-- 1. Add location tracking columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS currentlocation JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locationsharing BOOLEAN DEFAULT false;

-- 2. Add delivery address column to orders table  
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deliveryaddress TEXT;

-- Add comments to describe the columns
COMMENT ON COLUMN users.currentlocation IS 'Current GPS location of the user in JSON format {latitude, longitude, timestamp, accuracy}';
COMMENT ON COLUMN users.locationsharing IS 'Whether the user has enabled location sharing';
COMMENT ON COLUMN orders.deliveryaddress IS 'Delivery address for the order';

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_locationsharing ON users(locationsharing) WHERE locationsharing = true;
CREATE INDEX IF NOT EXISTS idx_users_currentlocation ON users USING GIN(currentlocation) WHERE currentlocation IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_deliveryaddress ON orders(deliveryaddress) WHERE deliveryaddress IS NOT NULL;