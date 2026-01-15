import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
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
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);

  // Fetch logs
  const fetchLogs = useCallback(async () => {
    if (!serverId) return;

    setIsLoading(true);
    try {
      const { data, error } = await api.getServerLogs(serverId, 200);
      
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
  }, [serverId]);

  // Set up polling for new logs
  useEffect(() => {
    if (!serverId) {
      setLogs([]);
      return;
    }

    fetchLogs();

    // Poll every 2 seconds for new logs
    pollingInterval.current = setInterval(() => {
      fetchLogs();
    }, 2000);

    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
      }
    };
  }, [serverId, fetchLogs]);

  // Clear logs
  const clearLogs = useCallback(() => {
    setLogs([]);
    if (serverId) {
      api.clearServerLogs(serverId);
    }
  }, [serverId]);

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
