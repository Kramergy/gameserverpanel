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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useServerNodes, ServerNode } from "@/hooks/useServerNodes";
import { Loader2, Server, Key, Lock, Copy, Check, Download, Zap, Terminal, Home, Globe } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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
  const [connectionMethod, setConnectionMethod] = useState<"agent" | "ssh" | "manual">("agent");
  const [isLocalServer, setIsLocalServer] = useState(false);
  const [isGeneratingAgent, setIsGeneratingAgent] = useState(false);
  const [agentScript, setAgentScript] = useState<string | null>(null);

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
        setPort(connectionMethod === "ssh" ? 22 : 3389);
        setUsername("Administrator");
        setConnectionMethod("agent");
      } else {
        setGamePath("/home/gameserver");
        setPort(22);
        setUsername("root");
        setConnectionMethod("agent");
      }
    }
  }, [osType, editNode]);

  // Update port when connection method changes for Windows
  useEffect(() => {
    if (!editNode && osType === "windows") {
      if (connectionMethod === "ssh") {
        setPort(22);
      } else if (connectionMethod === "manual") {
        setPort(5985);
      } else {
        setPort(3389);
      }
    }
  }, [connectionMethod, osType, editNode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let nodeId: string | undefined;

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
      nodeId = editNode.id;
    } else {
      const result = await createNode.mutateAsync({
        name,
        host: isLocalServer && connectionMethod === "agent" ? "auto-detect" : host,
        port,
        username,
        auth_type: authType,
        os_type: osType,
        game_path: gamePath,
      });
      nodeId = result?.id;
    }
    
    // If using agent method, generate agent script
    if (connectionMethod === "agent" && nodeId && !editNode) {
      await generateAgentScript(nodeId);
    } else {
      handleClose();
    }
  };

  const generateAgentScript = async (nodeId: string) => {
    setIsGeneratingAgent(true);
    try {
      const { data, error } = await supabase.functions.invoke('node-agent', {
        body: { nodeId }
      });

      if (error) throw error;

      if (data?.installScript) {
        setAgentScript(data.installScript);
        toast.success("Agent-Script generiert!");
      }
    } catch (error) {
      console.error('Error generating agent:', error);
      toast.error("Fehler beim Generieren des Agent-Scripts");
      handleClose();
    } finally {
      setIsGeneratingAgent(false);
    }
  };

  const downloadAgentScript = () => {
    if (!agentScript) return;
    
    const blob = new Blob([agentScript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Use .ps1 for Windows, .sh for Linux
    const extension = osType === 'windows' ? 'ps1' : 'sh';
    a.download = `GameServerAgent-${name.replace(/\s+/g, '_')}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Script heruntergeladen!");
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
    setAgentScript(null);
    setConnectionMethod("agent");
    setIsLocalServer(false);
    onOpenChange(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("In Zwischenablage kopiert");
    setTimeout(() => setCopied(false), 2000);
  };

  const isPending = createNode.isPending || updateNode.isPending || isGeneratingAgent;

  // If agent script is ready, show download dialog
  if (agentScript) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-green-500" />
              Agent-Installation
            </DialogTitle>
            <DialogDescription>
              Server "{name}" wurde hinzugefügt. Installiere jetzt den Agent.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="text-2xl">✅</div>
                <div>
                  <p className="font-medium">Server erfolgreich hinzugefügt!</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Jetzt muss nur noch der Agent auf deinem {osType === 'windows' ? 'Windows' : 'Linux'} Server installiert werden.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">So geht's:</p>
              {osType === 'windows' ? (
                <ol className="text-sm space-y-2 text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="font-bold text-foreground">1.</span>
                    Lade das Installations-Script herunter
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-foreground">2.</span>
                    Kopiere es auf deinen Windows Server
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-foreground">3.</span>
                    Rechtsklick → "Mit PowerShell ausführen (als Admin)"
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-foreground">4.</span>
                    Fertig! Der Agent verbindet sich automatisch.
                  </li>
                </ol>
              ) : (
                <ol className="text-sm space-y-2 text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="font-bold text-foreground">1.</span>
                    Kopiere den Befehl unten oder lade das Script herunter
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-foreground">2.</span>
                    Verbinde dich per SSH mit deinem Linux Server
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-foreground">3.</span>
                    Führe das Script als root aus: <code className="bg-muted px-1 rounded">sudo bash install.sh</code>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-foreground">4.</span>
                    Fertig! Der Agent verbindet sich automatisch.
                  </li>
                </ol>
              )}
            </div>

            <div className="flex gap-2">
              <Button onClick={downloadAgentScript} className="flex-1">
                <Download className="h-4 w-4 mr-2" />
                Script herunterladen
              </Button>
              <Button 
                variant="outline" 
                onClick={() => copyToClipboard(agentScript)}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>

            <div className="pt-2">
              <Button variant="ghost" className="w-full" onClick={handleClose}>
                Fertig
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

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

          {/* Windows Connection Method */}
          {osType === "windows" && !editNode && (
            <div className="space-y-3">
              <Label>Verbindungsmethode</Label>
              <Tabs value={connectionMethod} onValueChange={(v) => setConnectionMethod(v as "agent" | "ssh" | "manual")}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="agent" className="flex items-center gap-1 text-xs">
                    <Zap className="h-3 w-3" />
                    Agent
                  </TabsTrigger>
                  <TabsTrigger value="ssh" className="flex items-center gap-1 text-xs">
                    <Terminal className="h-3 w-3" />
                    SSH
                  </TabsTrigger>
                  <TabsTrigger value="manual" className="flex items-center gap-1 text-xs">
                    <Server className="h-3 w-3" />
                    WinRM
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="agent" className="mt-3 space-y-3">
                  <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <div className="flex items-start gap-2">
                      <span className="text-lg">✨</span>
                      <div>
                        <p className="font-medium text-sm">Empfohlen</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Ein Script wird auf deinem Server installiert und verbindet sich automatisch. 
                          <strong> Keine Firewall-Konfiguration nötig!</strong>
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Local Server Option */}
                  <div className="flex items-start space-x-3 p-3 rounded-lg border border-border bg-muted/30">
                    <Checkbox 
                      id="local-server" 
                      checked={isLocalServer}
                      onCheckedChange={(checked) => setIsLocalServer(checked === true)}
                    />
                    <div className="flex-1 space-y-1">
                      <label 
                        htmlFor="local-server" 
                        className="text-sm font-medium leading-none cursor-pointer flex items-center gap-2"
                      >
                        <Home className="h-4 w-4" />
                        Lokaler Server (Heimnetzwerk)
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Für Server hinter NAT/Firewall. Die IP-Adresse wird automatisch erkannt.
                      </p>
                    </div>
                  </div>
                  
                  {isLocalServer && (
                    <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                      <div className="flex items-start gap-2">
                        <Globe className="h-4 w-4 text-blue-500 mt-0.5" />
                        <div className="text-xs space-y-1">
                          <p className="font-medium">Perfekt für Heim-PCs!</p>
                          <ul className="text-muted-foreground space-y-0.5">
                            <li>• Keine Port-Weiterleitung nötig</li>
                            <li>• IP-Adresse wird automatisch erkannt</li>
                            <li>• Funktioniert hinter jeder Firewall</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="ssh" className="mt-3">
                  <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg space-y-3">
                    <div className="flex items-start gap-2">
                      <span className="text-lg">🔐</span>
                      <div>
                        <p className="font-medium text-sm">OpenSSH (Windows 2019+)</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Nutzt den eingebauten OpenSSH Server von Windows. Gleiche Methode wie Linux.
                        </p>
                      </div>
                    </div>
                    <div className="p-3 bg-background/50 rounded border">
                      <p className="text-xs font-medium mb-2">OpenSSH auf Windows aktivieren:</p>
                      <pre className="text-xs text-muted-foreground bg-muted/50 p-2 rounded overflow-x-auto">
{`# PowerShell als Admin ausführen:
Add-WindowsCapability -Online -Name OpenSSH.Server
Start-Service sshd
Set-Service -Name sshd -StartupType 'Automatic'`}
                      </pre>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="manual" className="mt-3">
                  <div className="p-4 bg-muted/50 border border-border rounded-lg">
                    <div className="flex items-start gap-2">
                      <span className="text-lg">⚙️</span>
                      <div>
                        <p className="font-medium text-sm">WinRM (Manuell)</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Erfordert WinRM-Einrichtung und Firewall-Freigaben auf Port 5985.
                        </p>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
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
            
            {/* Show IP field only if not local server with agent */}
            {!(isLocalServer && osType === "windows" && connectionMethod === "agent") && (
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
            )}
            
            {/* Auto-detect info for local servers */}
            {isLocalServer && osType === "windows" && connectionMethod === "agent" && (
              <div className="p-3 bg-muted/50 rounded-lg border border-border">
                <div className="flex items-center gap-2 text-sm">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">IP-Adresse:</span>
                  <span className="font-medium">Wird automatisch erkannt</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 ml-6">
                  Der Agent übermittelt seine IP beim ersten Verbinden
                </p>
              </div>
            )}

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

            {/* Auth Type - Show for Linux or Windows with SSH */}
            {(osType === "linux" || (osType === "windows" && connectionMethod === "ssh")) && (
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
          {osType === "windows" && connectionMethod === "agent" && !editNode && (
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <p className="text-xs text-muted-foreground">
                <strong>Nächster Schritt:</strong> Nach dem Hinzufügen erhältst du ein Installations-Script, 
                das du einfach auf deinem Windows Server ausführst.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {isGeneratingAgent ? "Generiere Agent..." : "Speichern..."}
                </>
              ) : editNode ? (
                "Speichern"
              ) : osType === "windows" && connectionMethod === "agent" ? (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Weiter zur Agent-Installation
                </>
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
