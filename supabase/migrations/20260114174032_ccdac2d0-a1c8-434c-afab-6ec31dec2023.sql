-- Create table for node commands
CREATE TABLE public.node_commands (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  node_id UUID NOT NULL REFERENCES public.server_nodes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  command_type TEXT NOT NULL,
  command_data JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  result JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  executed_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT valid_status CHECK (status IN ('pending', 'sent', 'executing', 'completed', 'failed'))
);

-- Enable RLS
ALTER TABLE public.node_commands ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own commands"
ON public.node_commands FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all commands"
ON public.node_commands FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can create commands for their nodes"
ON public.node_commands FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (SELECT 1 FROM public.server_nodes WHERE id = node_id AND user_id = auth.uid())
);

CREATE POLICY "Admins can create any commands"
ON public.node_commands FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can update their own commands"
ON public.node_commands FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can update all commands"
ON public.node_commands FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Index for faster lookups
CREATE INDEX idx_node_commands_node_id ON public.node_commands(node_id);
CREATE INDEX idx_node_commands_status ON public.node_commands(status) WHERE status = 'pending';