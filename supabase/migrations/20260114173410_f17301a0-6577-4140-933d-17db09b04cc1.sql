-- Add agent_token column to server_nodes for agent authentication
ALTER TABLE public.server_nodes 
ADD COLUMN IF NOT EXISTS agent_token TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS agent_connected_at TIMESTAMP WITH TIME ZONE;

-- Create index for faster agent token lookups
CREATE INDEX IF NOT EXISTS idx_server_nodes_agent_token ON public.server_nodes(agent_token);