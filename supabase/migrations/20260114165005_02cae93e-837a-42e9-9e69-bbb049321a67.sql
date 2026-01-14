-- Create server_instances table
CREATE TABLE public.server_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  game TEXT NOT NULL,
  game_icon TEXT NOT NULL,
  status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'starting', 'installing')),
  ip TEXT DEFAULT '0.0.0.0',
  port INTEGER DEFAULT 25565,
  max_players INTEGER DEFAULT 20,
  current_players INTEGER DEFAULT 0,
  ram_allocated INTEGER DEFAULT 2048,
  cpu_usage INTEGER DEFAULT 0,
  ram_usage INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.server_instances ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own servers"
ON public.server_instances
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all servers"
ON public.server_instances
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own servers"
ON public.server_instances
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own servers"
ON public.server_instances
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can update all servers"
ON public.server_instances
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can delete their own servers"
ON public.server_instances
FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can delete all servers"
ON public.server_instances
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_server_instances_updated_at
BEFORE UPDATE ON public.server_instances
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.server_instances;