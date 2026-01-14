-- Create table for server console logs
CREATE TABLE public.server_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  server_id UUID NOT NULL REFERENCES public.server_instances(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  log_type TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.server_logs ENABLE ROW LEVEL SECURITY;

-- Create index for faster queries
CREATE INDEX idx_server_logs_server_id ON public.server_logs(server_id);
CREATE INDEX idx_server_logs_created_at ON public.server_logs(created_at DESC);

-- RLS Policies
CREATE POLICY "Users can view logs of their own servers"
ON public.server_logs
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert logs for their own servers"
ON public.server_logs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all logs"
ON public.server_logs
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert all logs"
ON public.server_logs
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime for server_logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.server_logs;