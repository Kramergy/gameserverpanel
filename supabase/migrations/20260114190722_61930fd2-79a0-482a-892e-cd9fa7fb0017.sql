-- Drop the old check constraint
ALTER TABLE public.server_instances DROP CONSTRAINT IF EXISTS server_instances_status_check;

-- Add new check constraint with all valid status values
ALTER TABLE public.server_instances ADD CONSTRAINT server_instances_status_check 
CHECK (status IN ('online', 'offline', 'starting', 'installing', 'installed', 'error'));