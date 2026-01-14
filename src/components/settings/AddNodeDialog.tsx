import { useState, useEffect } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useServerNodes, ServerNode } from "@/hooks/useServerNodes";
import { Loader2, Server, Key, Lock, Monitor } from "lucide-react";

interface AddNodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editNode?: ServerNode | null;
}

export function AddNodeDialog({ open, onOpenChange, editNode }: AddNodeDialogProps) {
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(22);
  const [username, setUsername] = useState("");
  const [authType, setAuthType] = useState<"password" | "key">("password");
  const [osType, setOsType] = useState<"linux" | "windows">("linux");
  const [gamePath, setGamePath] = useState("/home/gameserver");

  const { createNode, updateNode } = useServerNodes();

  // Update form when editNode changes
  useEffect(() => {
    if (editNode) {
      setName(editNode.name);
      setHost(editNode.host);
      setPort(editNode.port);
      setUsername(editNode.username);
      setAuthType(editNode.auth_type);
      setOsType(editNode.os_type || "linux");
      setGamePath(editNode.game_path);
    }
  }, [editNode]);

  // Update default path when OS changes
  useEffect(() => {
    if (!editNode) {
      setGamePath(osType === "windows" ? "C:\\GameServers" : "/home/gameserver");
      setPort(osType === "windows" ? 5985 : 22);
    }
  }, [osType, editNode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editNode) {
      await updateNode.mutateAsync({
        id: editNode.id,
        name,
        host,
        port,
        username,
        auth_type: authType,
        os_type: osType,
        game_path: gamePath,
      });
    } else {
      await createNode.mutateAsync({
        name,
        host,
        port,
        username,
        auth_type: authType,
        os_type: osType,
        game_path: gamePath,
      });
    }
    
    handleClose();
  };

  const handleClose = () => {
    setName("");
    setHost("");
    setPort(22);
    setUsername("");
    setAuthType("password");
    setOsType("linux");
    setGamePath("/home/gameserver");
    onOpenChange(false);
  };

  const isPending = createNode.isPending || updateNode.isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            {editNode ? "Server-Node bearbeiten" : "Neuen Server-Node hinzufügen"}
          </DialogTitle>
          <DialogDescription>
            Verbinde einen externen Server für die Gameserver-Verwaltung
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Betriebssystem</Label>
            <RadioGroup 
              value={osType} 
              onValueChange={(v) => setOsType(v as "linux" | "windows")}
              className="flex gap-4"
            >
              <div className="flex-1">
                <label 
                  htmlFor="linux" 
                  className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    osType === "linux" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  }`}
                >
                  <RadioGroupItem value="linux" id="linux" className="sr-only" />
                  <div className="text-2xl">🐧</div>
                  <div>
                    <p className="font-medium">Linux</p>
                    <p className="text-xs text-muted-foreground">SSH-Verbindung</p>
                  </div>
                </label>
              </div>
              <div className="flex-1">
                <label 
                  htmlFor="windows" 
                  className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    osType === "windows" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  }`}
                >
                  <RadioGroupItem value="windows" id="windows" className="sr-only" />
                  <div className="text-2xl">🪟</div>
                  <div>
                    <p className="font-medium">Windows</p>
                    <p className="text-xs text-muted-foreground">WinRM/PowerShell</p>
                  </div>
                </label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mein Gameserver Node"
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="host">Host / IP</Label>
              <Input
                id="host"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="192.168.1.100 oder server.example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="port">{osType === "windows" ? "WinRM Port" : "SSH Port"}</Label>
              <Input
                id="port"
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                min={1}
                max={65535}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">Benutzername</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={osType === "windows" ? "Administrator" : "gameserver"}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Authentifizierung</Label>
            <RadioGroup value={authType} onValueChange={(v) => setAuthType(v as "password" | "key")}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="password" id="password" />
                <Label htmlFor="password" className="flex items-center gap-2 cursor-pointer">
                  <Lock className="h-4 w-4" />
                  Passwort
                </Label>
              </div>
              {osType === "linux" && (
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="key" id="key" />
                  <Label htmlFor="key" className="flex items-center gap-2 cursor-pointer">
                    <Key className="h-4 w-4" />
                    SSH-Key
                  </Label>
                </div>
              )}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gamePath">Gameserver Installationspfad</Label>
            <Input
              id="gamePath"
              value={gamePath}
              onChange={(e) => setGamePath(e.target.value)}
              placeholder={osType === "windows" ? "C:\\GameServers" : "/home/gameserver"}
              required
            />
            <p className="text-xs text-muted-foreground">
              Der Pfad auf dem Server, wo Gameserver installiert werden
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Speichern...
                </>
              ) : editNode ? (
                "Speichern"
              ) : (
                "Hinzufügen"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
