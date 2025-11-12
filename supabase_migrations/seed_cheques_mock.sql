-- Seed file: insert mock cheques for development/testing
-- Run this after creating the cheques table.

INSERT INTO public.cheques (payer_name, amount, bank, cheque_number, cheque_date, deposit_date, notes, status, created_by, created_at, collection_id, order_id, customer_id)
VALUES
  ('Acme Traders', 15000.00, 'Bank of Ceylon', 'BOL-1001', '2025-11-05', '2025-11-12', 'Payment for invoice INV-1001', 'Received', 'admin', now(), NULL, 'order_1001', 'cust_001'),
  ('Sunrise Co', 3200.50, 'Sampath Bank', 'SB-7789', '2025-11-02', '2025-11-13', 'Partial payment', 'Received', 'admin', now() - interval '1 day', NULL, 'order_1002', 'cust_002'),
  ('Ocean Supplies', 7800.00, 'Commercial Bank', 'CB-4455', '2025-10-30', NULL, 'Deposit date TBD', 'Received', 'clerk01', now() - interval '2 days', NULL, NULL, 'cust_003'),
  ('Lakshmi Stores', 5000.00, 'HSBC', 'HS-0099', '2025-11-01', '2025-11-20', 'Future deposit', 'Received', 'clerk02', now() - interval '3 days', NULL, 'order_1003', 'cust_004'),
  ('Green Foods', 12000.00, 'People''s Bank', 'PB-5544', '2025-10-28', '2025-11-11', 'For settlement', 'Cleared', 'admin', now() - interval '5 days', NULL, 'order_1004', 'cust_005'),
  ('Blue Logistics', 4500.00, 'Commercial Bank', 'CB-2200', '2025-10-25', NULL, 'Bounced earlier', 'Bounced', 'admin', now() - interval '7 days', NULL, NULL, 'cust_006');

-- Quick verify
SELECT id, payer_name, amount, bank, cheque_number, cheque_date, deposit_date, status, created_by, created_at
FROM public.cheques
ORDER BY created_at DESC
LIMIT 20;
