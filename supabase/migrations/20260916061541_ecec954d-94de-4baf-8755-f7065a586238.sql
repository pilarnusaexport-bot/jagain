CREATE TABLE public.health_device_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  device_name TEXT NOT NULL DEFAULT 'Health Connect',
  pair_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status TEXT NOT NULL DEFAULT 'pending',
  last_sync_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.health_device_links TO authenticated;
GRANT ALL ON public.health_device_links TO service_role;

ALTER TABLE public.health_device_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own device links" ON public.health_device_links
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_health_device_links_updated_at BEFORE UPDATE ON public.health_device_links
  FOR EACH ROW EXECUTE FUNCTION private.update_updated_at_column();

CREATE UNIQUE INDEX health_records_unique_metric_day
  ON public.health_records (user_id, metric_type, recorded_at);