import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { useEffect } from "react";

export interface ServerInstance {
  id: string;
  user_id: string;
  node_id: string | null;
  name: string;
  game: string;
  game_icon: string;
  status: "online" | "offline" | "starting" | "installing";
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

  const { data: servers = [], isLoading, error } = useQuery({
    queryKey: ["server-instances", user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from("server_instances")
        .select(`
          *,
          node:server_nodes (
            id,
            name,
            host,
            status
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as ServerInstance[];
    },
    enabled: !!user,
  });

  // Realtime subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("server-instances-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "server_instances",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["server-instances"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  const createServer = useMutation({
    mutationFn: async (input: CreateServerInput) => {
      if (!user) throw new Error("Nicht eingeloggt");

      const { data, error } = await supabase
        .from("server_instances")
        .insert({
          user_id: user.id,
          node_id: input.node_id,
          name: input.name,
          game: input.game,
          game_icon: input.game_icon,
          port: input.port,
          max_players: input.max_players,
          ram_allocated: input.ram_allocated,
          status: "installing",
        })
        .select()
        .single();

      if (error) throw error;
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
      const { error } = await supabase
        .from("server_instances")
        .delete()
        .eq("id", serverId);

      if (error) throw error;
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
    mutationFn: async ({ serverId, status }: { serverId: string; status: "online" | "offline" | "starting" | "installing" }) => {
      const { error } = await supabase
        .from("server_instances")
        .update({ status })
        .eq("id", serverId);

      if (error) throw error;
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
      // Send start command to agent
      const { error } = await supabase.functions.invoke("node-agent/send-command", {
        body: {
          nodeId: server.node_id,
          commandType: "start_gameserver",
          commandData: {
            serverId,
            installPath: server.install_path || `C:\\GameServers\\${server.game}-${serverId}`,
          },
        },
      });

      if (error) throw error;
      
      // Wait a bit then update status (in real app, agent would report back)
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
      // Get game info for executable
      const { error } = await supabase.functions.invoke("node-agent/send-command", {
        body: {
          nodeId: server.node_id,
          commandType: "stop_gameserver",
          commandData: {
            serverId,
            executable: getExecutableForGame(server.game),
          },
        },
      });

      if (error) throw error;
      
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
