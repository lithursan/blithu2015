-- Add location tracking columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS currentlocation JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locationsharing BOOLEAN DEFAULT false;

-- Add comment to describe the columns
COMMENT ON COLUMN users.currentlocation IS 'Current GPS location of the user in JSON format {latitude, longitude, timestamp, accuracy}';
COMMENT ON COLUMN users.locationsharing IS 'Whether the user has enabled location sharing';

-- Create index for better performance on location queries
CREATE INDEX IF NOT EXISTS idx_users_locationsharing ON users(locationsharing) WHERE locationsharing = true;
CREATE INDEX IF NOT EXISTS idx_users_currentlocation ON users USING GIN(currentlocation) WHERE currentlocation IS NOT NULL;