import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface ServerNode {
  id: string;
  user_id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: "password" | "key";
  os_type: "linux" | "windows";
  game_path: string;
  status: "online" | "offline" | "unknown" | "error";
  last_check: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateNodeInput {
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: "password" | "key";
  os_type: "linux" | "windows";
  game_path: string;
}

export function useServerNodes() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: nodes = [], isLoading, error } = useQuery({
    queryKey: ["server-nodes", user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from("server_nodes")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as ServerNode[];
    },
    enabled: !!user,
  });

  const createNode = useMutation({
    mutationFn: async (input: CreateNodeInput) => {
      if (!user) throw new Error("Nicht eingeloggt");

      const { data, error } = await supabase
        .from("server_nodes")
        .insert({
          user_id: user.id,
          name: input.name,
          host: input.host,
          port: input.port,
          username: input.username,
          auth_type: input.auth_type,
          os_type: input.os_type,
          game_path: input.game_path,
          status: "unknown",
        })
        .select()
        .single();

      if (error) throw error;
      return data as ServerNode;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["server-nodes"] });
      toast.success("Server-Node hinzugefügt");
    },
    onError: (error) => {
      toast.error("Fehler: " + error.message);
    },
  });

  const updateNode = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ServerNode> & { id: string }) => {
      const { error } = await supabase
        .from("server_nodes")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["server-nodes"] });
      toast.success("Server-Node aktualisiert");
    },
    onError: (error) => {
      toast.error("Fehler: " + error.message);
    },
  });

  const deleteNode = useMutation({
    mutationFn: async (nodeId: string) => {
      const { error } = await supabase
        .from("server_nodes")
        .delete()
        .eq("id", nodeId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["server-nodes"] });
      toast.success("Server-Node gelöscht");
    },
    onError: (error) => {
      toast.error("Fehler: " + error.message);
    },
  });

  return {
    nodes,
    isLoading,
    error,
    createNode,
    updateNode,
    deleteNode,
  };
}
