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
import { Loader2, Server, Key, Lock, Copy, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";

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
  const [copied, setCopied] = useState(false);

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

  // Update default values when OS changes
  useEffect(() => {
    if (!editNode) {
      if (osType === "windows") {
        setGamePath("C:\\GameServers");
        setPort(3389); // RDP port - simpler for users to understand
        setUsername("Administrator");
      } else {
        setGamePath("/home/gameserver");
        setPort(22);
        setUsername("");
      }
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
    setCopied(false);
    onOpenChange(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("In Zwischenablage kopiert");
    setTimeout(() => setCopied(false), 2000);
  };

  const isPending = createNode.isPending || updateNode.isPending;

  // PowerShell command to enable WinRM (simplified)
  const winrmSetupCommand = `# Als Administrator ausführen:
Enable-PSRemoting -Force
Set-Item wsman:\\localhost\\client\\trustedhosts -Value "*" -Force
New-NetFirewallRule -Name "GamePanel" -DisplayName "GamePanel Remote" -Direction Inbound -LocalPort 5985 -Protocol TCP -Action Allow`;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            {editNode ? "Server-Node bearbeiten" : "Neuen Server-Node hinzufügen"}
          </DialogTitle>
          <DialogDescription>
            Verbinde einen externen Server für die Gameserver-Verwaltung
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* OS Selection */}
          <div className="space-y-2">
            <Label>Betriebssystem</Label>
            <RadioGroup 
              value={osType} 
              onValueChange={(v) => setOsType(v as "linux" | "windows")}
              className="grid grid-cols-2 gap-3"
            >
              <label 
                htmlFor="linux" 
                className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  osType === "linux" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}
              >
                <RadioGroupItem value="linux" id="linux" className="sr-only" />
                <div className="text-3xl">🐧</div>
                <div>
                  <p className="font-medium">Linux</p>
                  <p className="text-xs text-muted-foreground">Ubuntu, Debian, etc.</p>
                </div>
              </label>
              <label 
                htmlFor="windows" 
                className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  osType === "windows" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}
              >
                <RadioGroupItem value="windows" id="windows" className="sr-only" />
                <div className="text-3xl">🪟</div>
                <div>
                  <p className="font-medium">Windows</p>
                  <p className="text-xs text-muted-foreground">Windows Server</p>
                </div>
              </label>
            </RadioGroup>
          </div>

          {/* Windows Setup Instructions */}
          {osType === "windows" && !editNode && (
            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg space-y-3">
              <div className="flex items-start gap-2">
                <span className="text-lg">💡</span>
                <div>
                  <p className="font-medium text-sm">Einfache Windows-Einrichtung</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Führe diesen Befehl einmalig auf deinem Windows Server aus (PowerShell als Administrator):
                  </p>
                </div>
              </div>
              <div className="relative">
                <pre className="bg-black/80 text-green-400 p-3 rounded text-xs overflow-x-auto">
                  {winrmSetupCommand}
                </pre>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(winrmSetupCommand)}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Nach Ausführung ist dein Server bereit für die Verbindung.
              </p>
            </div>
          )}

          {/* Server Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Server Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Mein Gaming Server"
              required
            />
            <p className="text-xs text-muted-foreground">
              Ein Name zur einfachen Identifizierung
            </p>
          </div>

          {/* Connection Details */}
          <div className="space-y-4 p-4 bg-secondary/30 rounded-lg">
            <p className="text-sm font-medium">Verbindungsdaten</p>
            
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="host">IP-Adresse oder Hostname</Label>
                <Input
                  id="host"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="192.168.1.100"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="port">Port</Label>
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
                placeholder={osType === "windows" ? "Administrator" : "root oder gameserver"}
                required
              />
              {osType === "windows" && (
                <p className="text-xs text-muted-foreground">
                  Normalerweise "Administrator" für Windows Server
                </p>
              )}
            </div>

            {/* Auth Type - Only show for Linux */}
            {osType === "linux" && (
              <div className="space-y-2">
                <Label>Authentifizierung</Label>
                <RadioGroup 
                  value={authType} 
                  onValueChange={(v) => setAuthType(v as "password" | "key")}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="password" id="auth-password" />
                    <Label htmlFor="auth-password" className="flex items-center gap-2 cursor-pointer">
                      <Lock className="h-4 w-4" />
                      Passwort
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="key" id="auth-key" />
                    <Label htmlFor="auth-key" className="flex items-center gap-2 cursor-pointer">
                      <Key className="h-4 w-4" />
                      SSH-Key
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}
          </div>

          {/* Game Path */}
          <div className="space-y-2">
            <Label htmlFor="gamePath">Installationspfad für Gameserver</Label>
            <Input
              id="gamePath"
              value={gamePath}
              onChange={(e) => setGamePath(e.target.value)}
              placeholder={osType === "windows" ? "C:\\GameServers" : "/home/gameserver"}
              required
            />
            <p className="text-xs text-muted-foreground">
              {osType === "windows" 
                ? "Ordner auf dem Windows Server (z.B. C:\\GameServers)"
                : "Ordner auf dem Linux Server (z.B. /home/gameserver)"
              }
            </p>
          </div>

          {/* Quick Info */}
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground">
              <strong>Tipp:</strong> Nach dem Hinzufügen kannst du die Verbindung mit dem Test-Button (🔄) überprüfen.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
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
                "Server hinzufügen"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
