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
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ServerNode } from "@/hooks/useServerNodes";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Loader2, 
  Terminal, 
  Play, 
  Square, 
  FolderOpen, 
  Info, 
  Zap,
  Download,
  Copy,
  CheckCircle2
} from "lucide-react";

interface NodeCommandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: ServerNode | null;
}

interface CommandResult {
  success: boolean;
  output?: any;
  error?: string;
}

const COMMAND_TYPES = [
  { value: "ping", label: "Ping", icon: Zap, description: "Teste die Verbindung" },
  { value: "get_system_info", label: "System-Info", icon: Info, description: "CPU, RAM, Hostname" },
  { value: "check_path", label: "Pfad prüfen", icon: FolderOpen, description: "Prüfe ob Pfad existiert" },
  { value: "list_directory", label: "Verzeichnis auflisten", icon: FolderOpen, description: "Zeige Dateien und Ordner" },
  { value: "get_processes", label: "Prozesse auflisten", icon: Terminal, description: "Zeige laufende Prozesse" },
  { value: "start_process", label: "Prozess starten", icon: Play, description: "Starte eine Anwendung" },
  { value: "stop_process", label: "Prozess stoppen", icon: Square, description: "Beende eine Anwendung" },
  { value: "run_script", label: "Script ausführen", icon: Terminal, description: "Shell-Script ausführen" },
];

export function NodeCommandDialog({ open, onOpenChange, node }: NodeCommandDialogProps) {
  const [commandType, setCommandType] = useState("ping");
  const [commandData, setCommandData] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<CommandResult | null>(null);
  const [activeTab, setActiveTab] = useState("install");
  const [installScript, setInstallScript] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Generate install script when dialog opens
  useEffect(() => {
    if (open && node) {
      generateInstallScript();
    }
  }, [open, node?.id]);

  const generateInstallScript = async () => {
    if (!node) return;
    
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('node-agent', {
        body: { nodeId: node.id }
      });

      if (error) throw error;

      if (node.os_type === 'windows') {
        setInstallScript(data.windowsScript || data.installScript);
      } else {
        setInstallScript(data.linuxScript || data.installScript);
      }
    } catch (error) {
      console.error('Error generating install script:', error);
      toast.error("Fehler beim Generieren des Scripts");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(installScript);
      setCopied(true);
      toast.success("Script in Zwischenablage kopiert!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Kopieren fehlgeschlagen");
    }
  };

  const handleDownloadScript = () => {
    const filename = node?.os_type === 'windows' ? 'install-agent.ps1' : 'install-agent.sh';
    const blob = new Blob([installScript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`${filename} heruntergeladen!`);
  };

  const handleSendCommand = async () => {
    if (!node) return;

    setIsLoading(true);
    setLastResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('node-agent/send-command', {
        body: {
          nodeId: node.id,
          commandType,
          commandData
        }
      });

      if (error) throw error;

      if (data.sent) {
        toast.success("Befehl gesendet!");
      } else {
        toast.info("Befehl erstellt - wird gesendet sobald Agent verbunden");
      }

      // Poll for result
      if (data.command?.id) {
        pollForResult(data.command.id);
      }
    } catch (error) {
      console.error('Error sending command:', error);
      toast.error("Fehler beim Senden des Befehls");
      setIsLoading(false);
    }
  };

  const pollForResult = async (commandId: string) => {
    let attempts = 0;
    const maxAttempts = 30;

    const poll = async () => {
      attempts++;
      
      const { data, error } = await supabase
        .from('node_commands')
        .select('*')
        .eq('id', commandId)
        .maybeSingle();

      if (error || !data) {
        setIsLoading(false);
        return;
      }

      if (data.status === 'completed' || data.status === 'failed') {
        setLastResult(data.result as unknown as CommandResult);
        setIsLoading(false);
        
        if (data.status === 'completed') {
          toast.success("Befehl erfolgreich ausgeführt");
        } else {
          toast.error("Befehl fehlgeschlagen");
        }
        return;
      }

      if (attempts < maxAttempts) {
        setTimeout(poll, 1000);
      } else {
        setIsLoading(false);
        toast.info("Befehl wird noch ausgeführt...");
      }
    };

    poll();
  };

  const handleClose = () => {
    setCommandType("ping");
    setCommandData({});
    setLastResult(null);
    setActiveTab("install");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            {node?.name || "Server"}
          </DialogTitle>
          <DialogDescription>
            Agent installieren oder Befehle senden
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="install">
              <Download className="h-4 w-4 mr-2" />
              Agent installieren
            </TabsTrigger>
            <TabsTrigger value="commands">
              <Terminal className="h-4 w-4 mr-2" />
              Befehle senden
            </TabsTrigger>
          </TabsList>

          <TabsContent value="install" className="flex-1 overflow-hidden flex flex-col space-y-4 mt-4">
            <div className="bg-muted/50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">Installation auf {node?.os_type === 'windows' ? 'Windows' : 'Linux'}</h4>
              <p className="text-sm text-muted-foreground mb-3">
                {node?.os_type === 'windows' 
                  ? 'Führe dieses PowerShell-Script als Administrator aus:'
                  : 'Führe dieses Script als root auf deinem Server aus:'
                }
              </p>
              
              <div className="flex gap-2 mb-3">
                <Button onClick={handleCopyScript} variant="outline" size="sm" disabled={isGenerating}>
                  {copied ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
                      Kopiert!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Script kopieren
                    </>
                  )}
                </Button>
                <Button onClick={handleDownloadScript} variant="outline" size="sm" disabled={isGenerating}>
                  <Download className="h-4 w-4 mr-2" />
                  Herunterladen
                </Button>
                <Button onClick={generateInstallScript} variant="ghost" size="sm" disabled={isGenerating}>
                  {isGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Neu generieren"
                  )}
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              {isGenerating ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <Textarea
                  value={installScript}
                  readOnly
                  className="font-mono text-xs h-full min-h-[300px] resize-none"
                />
              )}
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/20 p-3 rounded-lg">
              <p className="text-sm text-yellow-700 dark:text-yellow-400">
                {node?.os_type === 'windows' 
                  ? '⚠️ PowerShell als Administrator öffnen und Script einfügen'
                  : '⚠️ Als root ausführen: sudo bash install-agent.sh'
                }
              </p>
            </div>
          </TabsContent>

          <TabsContent value="commands" className="flex-1 overflow-auto space-y-4 mt-4">
            {/* Command Type Selection */}
            <div className="space-y-2">
              <Label>Befehl</Label>
              <Select value={commandType} onValueChange={setCommandType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMAND_TYPES.map((cmd) => (
                    <SelectItem key={cmd.value} value={cmd.value}>
                      <div className="flex items-center gap-2">
                        <cmd.icon className="h-4 w-4" />
                        <span>{cmd.label}</span>
                        <span className="text-xs text-muted-foreground">
                          - {cmd.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dynamic Command Parameters */}
            {commandType === "check_path" && (
              <div className="space-y-2">
                <Label htmlFor="path">Pfad (leer = Standardpfad)</Label>
                <Input
                  id="path"
                  value={commandData.path || ""}
                  onChange={(e) => setCommandData({ ...commandData, path: e.target.value })}
                  placeholder={node?.game_path || "/home/gameserver"}
                />
              </div>
            )}

            {commandType === "list_directory" && (
              <div className="space-y-2">
                <Label htmlFor="dir_path">Verzeichnis (leer = Standardpfad)</Label>
                <Input
                  id="dir_path"
                  value={commandData.path || ""}
                  onChange={(e) => setCommandData({ ...commandData, path: e.target.value })}
                  placeholder={node?.game_path || "/home/gameserver"}
                />
              </div>
            )}

            {commandType === "get_processes" && (
              <div className="space-y-2">
                <Label htmlFor="filter">Filter (optional)</Label>
                <Input
                  id="filter"
                  value={commandData.filter || ""}
                  onChange={(e) => setCommandData({ ...commandData, filter: e.target.value })}
                  placeholder="z.B. minecraft, srcds"
                />
              </div>
            )}

            {commandType === "start_process" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="executable">Programm</Label>
                  <Input
                    id="executable"
                    value={commandData.executable || ""}
                    onChange={(e) => setCommandData({ ...commandData, executable: e.target.value })}
                    placeholder="/home/gameserver/minecraft/start.sh"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="arguments">Argumente (optional)</Label>
                  <Input
                    id="arguments"
                    value={commandData.arguments || ""}
                    onChange={(e) => setCommandData({ ...commandData, arguments: e.target.value })}
                    placeholder="-Xmx4G -jar server.jar"
                  />
                </div>
              </div>
            )}

            {commandType === "stop_process" && (
              <div className="space-y-2">
                <Label htmlFor="processName">Prozess-Name</Label>
                <Input
                  id="processName"
                  value={commandData.processName || ""}
                  onChange={(e) => setCommandData({ ...commandData, processName: e.target.value })}
                  placeholder="z.B. java, srcds"
                  required
                />
              </div>
            )}

            {commandType === "run_script" && (
              <div className="space-y-2">
                <Label htmlFor="script">
                  {node?.os_type === 'windows' ? 'PowerShell Script' : 'Bash Script'}
                </Label>
                <Textarea
                  id="script"
                  value={commandData.script || ""}
                  onChange={(e) => setCommandData({ ...commandData, script: e.target.value })}
                  placeholder={node?.os_type === 'windows' 
                    ? "Get-Process | Where-Object { $_.Name -like '*minecraft*' }"
                    : "ps aux | grep minecraft"
                  }
                  rows={4}
                  className="font-mono text-sm"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  ⚠️ Achtung: Scripts werden mit Administratorrechten ausgeführt!
                </p>
              </div>
            )}

            {/* Result Display */}
            {lastResult && (
              <div className={`p-3 rounded-lg border ${lastResult.success ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                <p className="text-sm font-medium mb-2">
                  {lastResult.success ? '✅ Erfolgreich' : '❌ Fehlgeschlagen'}
                </p>
                <pre className="text-xs bg-black/50 p-2 rounded overflow-x-auto max-h-40 overflow-y-auto">
                  {JSON.stringify(lastResult.output || lastResult.error, null, 2)}
                </pre>
              </div>
            )}

            {/* Status Indicator */}
            {node?.status !== 'online' && (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <p className="text-sm text-yellow-600 dark:text-yellow-400">
                  ⚠️ Agent ist derzeit offline. Installiere zuerst den Agent über den Tab "Agent installieren".
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleClose}>
                Schließen
              </Button>
              <Button onClick={handleSendCommand} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Ausführen...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Ausführen
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
