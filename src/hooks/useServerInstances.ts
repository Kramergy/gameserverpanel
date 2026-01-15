import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { useEffect, useRef } from "react";

export interface ServerInstance {
  id: string;
  user_id: string;
  name: string;
  game: string;
  game_icon: string;
  status: "online" | "offline" | "starting" | "stopping" | "installing" | "restarting" | "error";
  ip: string;
  port: number;
  max_players: number;
  current_players: number;
  ram_allocated: number;
  cpu_usage: number;
  ram_usage: number;
  install_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateServerInput {
  name: string;
  game: string;
  game_icon: string;
  port: number;
  max_players: number;
  ram_allocated: number;
}

export function useServerInstances() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);

  const { data: servers = [], isLoading, error } = useQuery({
    queryKey: ["server-instances", user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await api.getServers();
      if (error) throw new Error(error);
      return data as ServerInstance[];
    },
    enabled: !!user,
  });

  // Polling for updates
  useEffect(() => {
    if (!user) return;

    // Poll every 3 seconds for updates
    pollingInterval.current = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["server-instances"] });
    }, 3000);

    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
      }
    };
  }, [user?.id, queryClient]);

  const createServer = useMutation({
    mutationFn: async (input: CreateServerInput) => {
      if (!user) throw new Error("Nicht eingeloggt");

      const { data, error } = await api.createServer(input);
      if (error) throw new Error(error);
      return data as ServerInstance;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["server-instances"] });
      toast.success("Server wird installiert...");
    },
    onError: (error) => {
      toast.error("Fehler beim Erstellen: " + error.message);
    },
  });

  const deleteServer = useMutation({
    mutationFn: async (serverId: string) => {
      const { error } = await api.deleteServer(serverId);
      if (error) throw new Error(error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["server-instances"] });
      toast.success("Server gelöscht");
    },
    onError: (error) => {
      toast.error("Fehler beim Löschen: " + error.message);
    },
  });

  const startServer = async (serverId: string) => {
    toast.info("Server wird gestartet...");
    try {
      const { error } = await api.startServer(serverId);
      if (error) throw new Error(error);
      queryClient.invalidateQueries({ queryKey: ["server-instances"] });
      toast.success("Server gestartet!");
    } catch (error: any) {
      toast.error("Startfehler: " + error.message);
    }
  };

  const stopServer = async (serverId: string) => {
    toast.info("Server wird gestoppt...");
    try {
      const { error } = await api.stopServer(serverId);
      if (error) throw new Error(error);
      queryClient.invalidateQueries({ queryKey: ["server-instances"] });
      toast.success("Server gestoppt");
    } catch (error: any) {
      toast.error("Stoppfehler: " + error.message);
    }
  };

  const restartServer = async (serverId: string) => {
    toast.info("Server wird neugestartet...");
    try {
      const { error } = await api.restartServer(serverId);
      if (error) throw new Error(error);
      queryClient.invalidateQueries({ queryKey: ["server-instances"] });
      toast.success("Server neugestartet!");
    } catch (error: any) {
      toast.error("Neustartfehler: " + error.message);
    }
  };

  return {
    servers,
    isLoading,
    error,
    createServer,
    deleteServer,
    startServer,
    stopServer,
    restartServer,
  };
}
