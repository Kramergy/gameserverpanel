import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface ServerLog {
  id: string;
  server_id: string;
  user_id: string;
  log_type: "info" | "warn" | "error" | "success" | "command";
  message: string;
  created_at: string;
}

export function useServerLogs(serverId: string | null) {
  const [logs, setLogs] = useState<ServerLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { session } = useAuth();

  // Fetch initial logs
  const fetchLogs = useCallback(async () => {
    if (!serverId) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('server_logs')
        .select('*')
        .eq('server_id', serverId)
        .order('created_at', { ascending: true })
        .limit(200);

      if (error) {
        console.error('Error fetching logs:', error);
        return;
      }

      setLogs((data || []) as ServerLog[]);
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setIsLoading(false);
    }
  }, [serverId, session?.access_token]);

  // Set up realtime subscription
  useEffect(() => {
    if (!serverId) {
      setLogs([]);
      return;
    }

    fetchLogs();

    // Subscribe to new logs
    const channel = supabase
      .channel(`server-logs-${serverId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'server_logs',
          filter: `server_id=eq.${serverId}`
        },
        (payload) => {
          console.log('New log received:', payload);
          const newLog = payload.new as ServerLog;
          setLogs((prev) => [...prev, newLog]);
        }
      )
      .subscribe((status) => {
        console.log('Server logs subscription status:', status);
      });

    return () => {
      console.log('Removing server logs channel');
      supabase.removeChannel(channel);
    };
  }, [serverId, fetchLogs]);

  // Clear logs
  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  // Add a local log (for commands entered by user)
  const addLocalLog = useCallback((message: string, type: ServerLog['log_type'] = 'command') => {
    const localLog: ServerLog = {
      id: `local-${Date.now()}`,
      server_id: serverId || '',
      user_id: '',
      log_type: type,
      message,
      created_at: new Date().toISOString()
    };
    setLogs((prev) => [...prev, localLog]);
  }, [serverId]);

  return {
    logs,
    isLoading,
    fetchLogs,
    clearLogs,
    addLocalLog
  };
}
