import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { useEffect } from "react";

export interface ServerInstance {
  id: string;
  user_id: string;
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

  const { data: servers = [], isLoading, error } = useQuery({
    queryKey: ["server-instances", user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from("server_instances")
        .select("*")
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

  return {
    servers,
    isLoading,
    error,
    createServer,
    deleteServer,
  };
}
