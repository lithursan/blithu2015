-- Migration: add columns to support persistent cheque deposit alerts
-- Adds deposit_alert_stage (0 = none, 1 = 3-day alert sent, 2 = 2-day alert sent)
-- and deposit_alert_sent_at timestamp

ALTER TABLE IF EXISTS public.cheques
  ADD COLUMN IF NOT EXISTS deposit_alert_stage integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_alert_sent_at timestamptz;

-- Optional: index to quickly query by stage/deposit_date
CREATE INDEX IF NOT EXISTS idx_cheques_deposit_date_alert_stage ON public.cheques (deposit_date, deposit_alert_stage);
