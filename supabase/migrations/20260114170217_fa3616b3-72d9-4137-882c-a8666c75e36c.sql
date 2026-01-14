-- Create server_nodes table for external server management
CREATE TABLE public.server_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER DEFAULT 22,
  username TEXT NOT NULL,
  auth_type TEXT DEFAULT 'password' CHECK (auth_type IN ('password', 'key')),
  game_path TEXT DEFAULT '/home/gameserver',
  status TEXT DEFAULT 'unknown' CHECK (status IN ('online', 'offline', 'unknown', 'error')),
  last_check TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.server_nodes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own nodes"
ON public.server_nodes FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all nodes"
ON public.server_nodes FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own nodes"
ON public.server_nodes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own nodes"
ON public.server_nodes FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can update all nodes"
ON public.server_nodes FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can delete their own nodes"
ON public.server_nodes FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can delete all nodes"
ON public.server_nodes FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_server_nodes_updated_at
BEFORE UPDATE ON public.server_nodes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add node_id reference to server_instances
ALTER TABLE public.server_instances 
ADD COLUMN node_id UUID REFERENCES public.server_nodes(id) ON DELETE SET NULL,
ADD COLUMN install_path TEXT;