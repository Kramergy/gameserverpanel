-- Add os_type column to server_nodes
ALTER TABLE public.server_nodes 
ADD COLUMN os_type TEXT DEFAULT 'linux' CHECK (os_type IN ('linux', 'windows'));