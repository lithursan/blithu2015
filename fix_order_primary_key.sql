-- Fix Order Primary Key Constraint Issues
-- This migration resolves duplicate key violations on orders_pkey

-- Step 1: Check for any existing duplicate order IDs
DO $$
BEGIN
    -- Create a temporary view to identify duplicates
    DROP VIEW IF EXISTS duplicate_orders_view;
    CREATE TEMP VIEW duplicate_orders_view AS
    SELECT id, COUNT(*) as duplicate_count
    FROM orders
    GROUP BY id
    HAVING COUNT(*) > 1;

    -- Log any duplicates found
    IF (SELECT COUNT(*) FROM duplicate_orders_view) > 0 THEN
        RAISE NOTICE 'Found % duplicate order IDs that need to be resolved', (SELECT COUNT(*) FROM duplicate_orders_view);
        
        -- Show the duplicate IDs
        FOR rec IN SELECT id, duplicate_count FROM duplicate_orders_view LOOP
            RAISE NOTICE 'Duplicate Order ID: % (appears % times)', rec.id, rec.duplicate_count;
        END LOOP;
    ELSE
        RAISE NOTICE 'No duplicate order IDs found';
    END IF;
END $$;

-- Step 2: Fix any duplicate orders by renaming them with timestamp suffix
DO $$
DECLARE
    rec RECORD;
    counter INTEGER;
    new_id TEXT;
BEGIN
    -- For each set of duplicate orders, rename all but the first one
    FOR rec IN 
        SELECT id, COUNT(*) as cnt 
        FROM orders 
        GROUP BY id 
        HAVING COUNT(*) > 1
    LOOP
        counter := 1;
        
        -- Update duplicate rows (keep first one, rename others)
        FOR order_rec IN 
            SELECT ctid, created_at, orderdate 
            FROM orders 
            WHERE id = rec.id
            ORDER BY 
                CASE WHEN created_at IS NOT NULL THEN created_at 
                     ELSE (orderdate || ' 00:00:00')::TIMESTAMP 
                END
            OFFSET 1  -- Skip the first (oldest) record
        LOOP
            -- Generate new unique ID with timestamp
            new_id := rec.id || '_FIX' || counter::TEXT;
            
            -- Ensure the new ID doesn't already exist
            WHILE EXISTS (SELECT 1 FROM orders WHERE id = new_id) LOOP
                counter := counter + 1;
                new_id := rec.id || '_FIX' || counter::TEXT;
            END LOOP;
            
            -- Update the duplicate record
            UPDATE orders 
            SET id = new_id 
            WHERE ctid = order_rec.ctid;
            
            RAISE NOTICE 'Renamed duplicate order % to %', rec.id, new_id;
            counter := counter + 1;
        END LOOP;
    END LOOP;
END $$;

-- Step 3: Create a sequence for order ID generation (if not exists)
DO $$
BEGIN
    -- Create sequence if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'orders_id_seq') THEN
        -- Find the highest order number currently in use
        EXECUTE 'CREATE SEQUENCE orders_id_seq START WITH ' || 
                COALESCE((
                    SELECT MAX(CAST(SUBSTRING(id FROM 4) AS INTEGER)) + 1
                    FROM orders 
                    WHERE id ~ '^ORD[0-9]+$'
                ), 1);
        
        RAISE NOTICE 'Created orders_id_seq sequence';
    ELSE
        RAISE NOTICE 'orders_id_seq sequence already exists';
    END IF;
END $$;

-- Step 4: Create a function to generate unique order IDs
CREATE OR REPLACE FUNCTION generate_next_order_id()
RETURNS TEXT AS $$
DECLARE
    next_num INTEGER;
    new_id TEXT;
BEGIN
    -- Get next number from sequence
    next_num := nextval('orders_id_seq');
    new_id := 'ORD' || LPAD(next_num::TEXT, 3, '0');
    
    -- Ensure uniqueness (safety check)
    WHILE EXISTS (SELECT 1 FROM orders WHERE id = new_id) LOOP
        next_num := nextval('orders_id_seq');
        new_id := 'ORD' || LPAD(next_num::TEXT, 3, '0');
    END LOOP;
    
    RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Add comments and verify integrity
COMMENT ON FUNCTION generate_next_order_id() IS 'Generates unique order IDs in format ORD001, ORD002, etc.';
COMMENT ON SEQUENCE orders_id_seq IS 'Sequence for generating unique order ID numbers';

-- Step 6: Verify the fix
DO $$
BEGIN
    RAISE NOTICE 'Migration completed successfully';
    RAISE NOTICE 'Total orders: %', (SELECT COUNT(*) FROM orders);
    RAISE NOTICE 'Unique order IDs: %', (SELECT COUNT(DISTINCT id) FROM orders);
    RAISE NOTICE 'Next order ID will be: %', generate_next_order_id();
    
    -- Reset the sequence to not consume the test ID
    PERFORM setval('orders_id_seq', 
                   COALESCE((SELECT MAX(CAST(SUBSTRING(id FROM 4) AS INTEGER)) FROM orders WHERE id ~ '^ORD[0-9]+$'), 0));
END $$;