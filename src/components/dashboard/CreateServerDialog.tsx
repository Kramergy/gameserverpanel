import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GameSelector, GameOption } from "./GameSelector";
import { useServerInstances } from "@/hooks/useServerInstances";
import { useServerNodes } from "@/hooks/useServerNodes";
import { Loader2, Server, ArrowLeft, AlertCircle } from "lucide-react";

interface CreateServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CreateServerDialogContent({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const [step, setStep] = useState<"node" | "game" | "config">("node");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<GameOption | null>(null);
  const [serverName, setServerName] = useState("");
  const [port, setPort] = useState(25565);
  const [maxPlayers, setMaxPlayers] = useState(20);
  const [ram, setRam] = useState(2048);

  const { createServer } = useServerInstances();
  const { nodes, isLoading: nodesLoading } = useServerNodes();

  // Filter only online nodes
  const availableNodes = nodes.filter(n => n.status === "online");

  const handleNodeSelect = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setStep("game");
  };

  const handleGameSelect = (game: GameOption) => {
    setSelectedGame(game);
    setPort(game.defaultPort);
    setRam(game.defaultRam);
    setServerName(`Mein ${game.name} Server`);
    setStep("config");
  };

  const handleBack = () => {
    if (step === "config") {
      setStep("game");
    } else if (step === "game") {
      setStep("node");
    }
  };

  const handleCreate = async () => {
    if (!selectedGame || !selectedNodeId) return;

    await createServer.mutateAsync({
      name: serverName,
      game: selectedGame.id,
      game_icon: selectedGame.icon,
      port,
      max_players: maxPlayers,
      ram_allocated: ram,
      node_id: selectedNodeId,
    });

    // Reset and close
    setStep("node");
    setSelectedNodeId(null);
    setSelectedGame(null);
    setServerName("");
    onOpenChange(false);
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {step !== "node" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleBack}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <Server className="h-5 w-5" />
          {step === "node" ? "Server-Node auswählen" : step === "game" ? "Spiel auswählen" : "Server konfigurieren"}
        </DialogTitle>
        <DialogDescription>
          {step === "node"
            ? "Wähle den Server, auf dem das Spiel installiert werden soll"
            : step === "game"
            ? "Wähle das Spiel für deinen neuen Gameserver"
            : `Konfiguriere deinen ${selectedGame?.name} Server`}
        </DialogDescription>
      </DialogHeader>

      {step === "node" ? (
        <div className="space-y-4">
          {nodesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : availableNodes.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-border rounded-lg">
              <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <h3 className="font-medium">Keine Server-Nodes verfügbar</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {nodes.length === 0 
                  ? "Füge zuerst einen Server-Node in den Einstellungen hinzu."
                  : "Keiner deiner Server-Nodes ist online. Starte einen Agent."}
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {availableNodes.map((node) => (
                <button
                  key={node.id}
                  onClick={() => handleNodeSelect(node.id)}
                  className="flex items-center gap-4 p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-secondary/30 transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    {node.os_type === "windows" ? "🪟" : "🐧"}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{node.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {node.host} • {node.os_type === "windows" ? "Windows" : "Linux"}
                    </p>
                  </div>
                  <div className="px-2 py-1 rounded-full text-xs bg-success/10 text-success">
                    Online
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : step === "game" ? (
        <GameSelector
          selectedGame={selectedGame?.id ?? null}
          onSelect={handleGameSelect}
        />
      ) : (
        <div className="space-y-4">
          {/* Selected Node Info */}
          {selectedNode && (
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border">
              <span className="text-xl">{selectedNode.os_type === "windows" ? "🪟" : "🐧"}</span>
              <div className="flex-1">
                <p className="text-sm font-medium">{selectedNode.name}</p>
                <p className="text-xs text-muted-foreground">{selectedNode.host}</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg">
            <span className="text-2xl">{selectedGame?.icon}</span>
            <div>
              <p className="font-medium">{selectedGame?.name}</p>
              <p className="text-sm text-muted-foreground">
                {selectedGame?.description}
              </p>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="serverName">Server Name</Label>
              <Input
                id="serverName"
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
                placeholder="Mein Server"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="port">Port</Label>
                <Input
                  id="port"
                  type="number"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxPlayers">Max. Spieler</Label>
                <Input
                  id="maxPlayers"
                  type="number"
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(Number(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ram">RAM (MB)</Label>
                <Input
                  id="ram"
                  type="number"
                  value={ram}
                  onChange={(e) => setRam(Number(e.target.value))}
                  step={512}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!serverName || createServer.isPending}
            >
              {createServer.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Erstelle...
                </>
              ) : (
                "Server erstellen"
              )}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

export function CreateServerDialog({ open, onOpenChange }: CreateServerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {open && <CreateServerDialogContent onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}
