import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { GameOption } from "@/components/dashboard/GameSelector";
import { useEffect, useState, useRef } from "react";

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
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);

  // Poll for installation progress
  useEffect(() => {
    // Poll every 3 seconds for server instance updates
    pollingInterval.current = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["server-instances"] });
    }, 3000);

    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
      }
    };
  }, [queryClient]);

  const installServer = useMutation({
    mutationFn: async (input: InstallServerInput) => {
      const { serverId, nodeId, game, serverName, port, maxPlayers, ram } = input;

      // Send install command to agent
      const { data, error } = await api.sendCommand(nodeId, "install_gameserver", {
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
      });

      if (error) throw new Error(error);
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
      const { data, error } = await api.sendCommand(nodeId, "start_gameserver", {
        serverId,
        installPath,
      });

      if (error) throw new Error(error);

      // Update server status
      await api.updateServer(serverId, { status: "starting" });

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
      const { data, error } = await api.sendCommand(nodeId, "stop_gameserver", {
        serverId,
        executable,
      });

      if (error) throw new Error(error);

      // Update server status
      await api.updateServer(serverId, { status: "offline" });

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
