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
import { GameSelector, GameOption, AVAILABLE_GAMES } from "./GameSelector";
import { useServerInstances } from "@/hooks/useServerInstances";
import { Loader2, Server, ArrowLeft } from "lucide-react";

interface CreateServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateServerDialog({ open, onOpenChange }: CreateServerDialogProps) {
  const [step, setStep] = useState<"game" | "config">("game");
  const [selectedGame, setSelectedGame] = useState<GameOption | null>(null);
  const [serverName, setServerName] = useState("");
  const [port, setPort] = useState(25565);
  const [maxPlayers, setMaxPlayers] = useState(20);
  const [ram, setRam] = useState(2048);

  const { createServer } = useServerInstances();

  const handleGameSelect = (game: GameOption) => {
    setSelectedGame(game);
    setPort(game.defaultPort);
    setRam(game.defaultRam);
    setServerName(`Mein ${game.name} Server`);
    setStep("config");
  };

  const handleBack = () => {
    setStep("game");
  };

  const handleCreate = async () => {
    if (!selectedGame) return;

    await createServer.mutateAsync({
      name: serverName,
      game: selectedGame.id,
      game_icon: selectedGame.icon,
      port,
      max_players: maxPlayers,
      ram_allocated: ram,
    });

    // Reset and close
    setStep("game");
    setSelectedGame(null);
    setServerName("");
    onOpenChange(false);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setStep("game");
      setSelectedGame(null);
      setServerName("");
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === "config" && (
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
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
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
      </DialogContent>
    </Dialog>
  );
}
