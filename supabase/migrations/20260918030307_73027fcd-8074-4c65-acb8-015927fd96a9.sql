ALTER TABLE public.health_records
  ADD COLUMN IF NOT EXISTS sleep_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS sleep_end_at timestamptz;