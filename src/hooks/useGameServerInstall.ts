import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { GameOption } from "@/components/dashboard/GameSelector";
import { useEffect, useState } from "react";

interface InstallProgress {
  serverId: string;
  stage: string;
  percent: number;
  message: string;
}

interface InstallServerInput {
  serverId: string;
  nodeId: string;
  game: GameOption;
  serverName: string;
  port: number;
  maxPlayers: number;
  ram: number;
}

export function useGameServerInstall() {
  const queryClient = useQueryClient();
  const [installProgress, setInstallProgress] = useState<Record<string, InstallProgress>>({});

  // Listen for installation progress via realtime
  useEffect(() => {
    const channel = supabase
      .channel("install-progress")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "server_instances",
        },
        (payload) => {
          // Check if this is a status update
          if (payload.new && payload.new.status) {
            queryClient.invalidateQueries({ queryKey: ["server-instances"] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const installServer = useMutation({
    mutationFn: async (input: InstallServerInput) => {
      const { serverId, nodeId, game, serverName, port, maxPlayers, ram } = input;

      // Send install command to agent via edge function
      const { data, error } = await supabase.functions.invoke("node-agent/send-command", {
        body: {
          nodeId,
          commandType: "install_gameserver",
          commandData: {
            serverId,
            gameId: game.id,
            serverName,
            installType: game.installType,
            steamAppId: game.steamAppId,
            downloadUrl: game.downloadUrl,
            executable: game.executable,
            startArgs: game.startArgs,
            port,
            maxPlayers,
            ram,
          },
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      toast.info(`Installation von ${variables.game.name} gestartet...`);
      setInstallProgress((prev) => ({
        ...prev,
        [variables.serverId]: {
          serverId: variables.serverId,
          stage: "init",
          percent: 5,
          message: "Installation wird vorbereitet...",
        },
      }));
    },
    onError: (error) => {
      toast.error("Installationsfehler: " + error.message);
    },
  });

  const startServer = useMutation({
    mutationFn: async ({ nodeId, serverId, installPath }: { nodeId: string; serverId: string; installPath: string }) => {
      const { data, error } = await supabase.functions.invoke("node-agent/send-command", {
        body: {
          nodeId,
          commandType: "start_gameserver",
          commandData: {
            serverId,
            installPath,
          },
        },
      });

      if (error) throw error;

      // Update server status
      await supabase
        .from("server_instances")
        .update({ status: "starting" })
        .eq("id", serverId);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["server-instances"] });
      toast.success("Server wird gestartet...");
    },
    onError: (error) => {
      toast.error("Startfehler: " + error.message);
    },
  });

  const stopServer = useMutation({
    mutationFn: async ({ nodeId, serverId, executable }: { nodeId: string; serverId: string; executable: string }) => {
      const { data, error } = await supabase.functions.invoke("node-agent/send-command", {
        body: {
          nodeId,
          commandType: "stop_gameserver",
          commandData: {
            serverId,
            executable,
          },
        },
      });

      if (error) throw error;

      // Update server status
      await supabase
        .from("server_instances")
        .update({ status: "offline" })
        .eq("id", serverId);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["server-instances"] });
      toast.success("Server gestoppt");
    },
    onError: (error) => {
      toast.error("Stoppfehler: " + error.message);
    },
  });

  return {
    installServer,
    startServer,
    stopServer,
    installProgress,
    setInstallProgress,
  };
}
