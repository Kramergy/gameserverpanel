import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { useEffect, useRef } from "react";

export interface ServerInstance {
  id: string;
  user_id: string;
  node_id: string | null;
  name: string;
  game: string;
  game_icon: string;
  status: "online" | "offline" | "starting" | "installing" | "installed" | "error";
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
  // Joined node data
  node?: {
    id: string;
    name: string;
    host: string;
    status: string;
  } | null;
}

export interface CreateServerInput {
  name: string;
  game: string;
  game_icon: string;
  port: number;
  max_players: number;
  ram_allocated: number;
  node_id: string;
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

  // Polling for updates (since we don't have WebSockets in self-hosted version)
  useEffect(() => {
    if (!user) return;

    // Poll every 5 seconds for updates
    pollingInterval.current = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["server-instances"] });
    }, 5000);

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
      const server = servers.find(s => s.id === serverId);
      
      // If server has a node and install path, send delete command to agent
      if (server?.node_id && server?.install_path) {
        try {
          await api.sendCommand(server.node_id, "delete_gameserver", {
            serverId,
            installPath: server.install_path,
          });
        } catch (err) {
          console.error("Error sending delete command to agent:", err);
        }
      }

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

  const updateServerStatus = useMutation({
    mutationFn: async ({ serverId, status }: { serverId: string; status: ServerInstance["status"] }) => {
      const { error } = await api.updateServer(serverId, { status });
      if (error) throw new Error(error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["server-instances"] });
    },
    onError: (error) => {
      toast.error("Fehler: " + error.message);
    },
  });

  const startServer = async (serverId: string) => {
    const server = servers.find(s => s.id === serverId);
    if (!server || !server.node_id) {
      toast.error("Kein Server-Node zugewiesen");
      return;
    }

    toast.info("Server wird gestartet...");
    await updateServerStatus.mutateAsync({ serverId, status: "starting" });

    try {
      const { error } = await api.sendCommand(server.node_id, "start_gameserver", {
        serverId,
        installPath: server.install_path || `C:\\GameServers\\${server.game}-${serverId}`,
      });

      if (error) throw new Error(error);
      
      // Wait a bit then update status
      setTimeout(async () => {
        await updateServerStatus.mutateAsync({ serverId, status: "online" });
        toast.success("Server gestartet!");
      }, 3000);
    } catch (error: any) {
      toast.error("Startfehler: " + error.message);
      await updateServerStatus.mutateAsync({ serverId, status: "offline" });
    }
  };

  const stopServer = async (serverId: string) => {
    const server = servers.find(s => s.id === serverId);
    if (!server || !server.node_id) {
      toast.error("Kein Server-Node zugewiesen");
      return;
    }

    toast.info("Server wird gestoppt...");

    try {
      const { error } = await api.sendCommand(server.node_id, "stop_gameserver", {
        serverId,
        executable: getExecutableForGame(server.game),
      });

      if (error) throw new Error(error);
      
      await updateServerStatus.mutateAsync({ serverId, status: "offline" });
      toast.success("Server gestoppt");
    } catch (error: any) {
      toast.error("Stoppfehler: " + error.message);
    }
  };

  const restartServer = async (serverId: string) => {
    await stopServer(serverId);
    setTimeout(() => startServer(serverId), 2000);
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

// Helper function to get executable name for a game
function getExecutableForGame(gameId: string): string {
  const executables: Record<string, string> = {
    "minecraft-java": "java.exe",
    "minecraft-bedrock": "bedrock_server.exe",
    "ark": "ShooterGameServer.exe",
    "rust": "RustDedicated.exe",
    "valheim": "valheim_server.exe",
    "terraria": "TerrariaServer.exe",
    "cs2": "cs2.exe",
    "palworld": "PalServer.exe",
  };
  return executables[gameId] || "server.exe";
}
