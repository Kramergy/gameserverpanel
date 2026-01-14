-- Enable REPLICA IDENTITY FULL for complete row data in realtime updates
ALTER TABLE public.server_instances REPLICA IDENTITY FULL;