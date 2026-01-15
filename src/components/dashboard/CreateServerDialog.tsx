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
import { GameSelector, GameOption } from "./GameSelector";
import { useServerInstances } from "@/hooks/useServerInstances";
import { api } from "@/lib/api";
import { Loader2, Server, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

interface CreateServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CreateServerDialogContent({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const [step, setStep] = useState<"game" | "config">("game");
  const [selectedGame, setSelectedGame] = useState<GameOption | null>(null);
  const [serverName, setServerName] = useState("");
  const [port, setPort] = useState(25565);
  const [maxPlayers, setMaxPlayers] = useState(20);
  const [ram, setRam] = useState(2048);
  const [isCreating, setIsCreating] = useState(false);

  const { createServer } = useServerInstances();

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
    }
  };

  const handleCreate = async () => {
    if (!selectedGame) return;

    setIsCreating(true);

    try {
      // Create server instance in database
      const server = await createServer.mutateAsync({
        name: serverName,
        game: selectedGame.id,
        game_icon: selectedGame.icon,
        port,
        max_players: maxPlayers,
        ram_allocated: ram,
      });

      // Trigger installation
      if (server?.id) {
        await api.installServer(server.id);
        toast.success("Installation gestartet!");
      }

      // Reset and close
      setStep("game");
      setSelectedGame(null);
      setServerName("");
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {step !== "game" && (
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
          {step === "game" ? "Spiel auswählen" : "Server konfigurieren"}
        </DialogTitle>
        <DialogDescription>
          {step === "game"
            ? "Wähle das Spiel für deinen neuen Gameserver"
            : `Konfiguriere deinen ${selectedGame?.name} Server`}
        </DialogDescription>
      </DialogHeader>

      {step === "game" ? (
        <GameSelector
          selectedGame={selectedGame?.id ?? null}
          onSelect={handleGameSelect}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg">
            <span className="text-2xl">{selectedGame?.icon}</span>
            <div>
              <p className="font-medium">{selectedGame?.name}</p>
              <p className="text-sm text-muted-foreground">
                {selectedGame?.description}
              </p>
            </div>
          </div>

          <div className="p-3 bg-muted/50 rounded-lg border border-border">
            <p className="text-sm text-muted-foreground">
              📂 Installationspfad: <span className="font-mono text-foreground">C:\GamePanel\Gameservers\</span>
            </p>
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
              disabled={!serverName || isCreating}
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Installation wird gestartet...
                </>
              ) : (
                "Server installieren"
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
