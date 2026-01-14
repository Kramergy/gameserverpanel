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
import { Textarea } from "@/components/ui/textarea";
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
  Zap 
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
  { value: "run_script", label: "Script ausführen", icon: Terminal, description: "Führe PowerShell aus" },
];

export function NodeCommandDialog({ open, onOpenChange, node }: NodeCommandDialogProps) {
  const [commandType, setCommandType] = useState("ping");
  const [commandData, setCommandData] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<CommandResult | null>(null);

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
        .single();

      if (error) {
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
    onOpenChange(false);
  };

  const selectedCommand = COMMAND_TYPES.find(c => c.value === commandType);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Remote-Befehle
          </DialogTitle>
          <DialogDescription>
            Sende Befehle an {node?.name || "Server"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
                placeholder={node?.game_path || "C:\\GameServers"}
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
                placeholder={node?.game_path || "C:\\GameServers"}
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
                  placeholder="C:\\GameServers\\Minecraft\\start.bat"
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
              <div className="space-y-2">
                <Label htmlFor="workingDirectory">Arbeitsverzeichnis (optional)</Label>
                <Input
                  id="workingDirectory"
                  value={commandData.workingDirectory || ""}
                  onChange={(e) => setCommandData({ ...commandData, workingDirectory: e.target.value })}
                  placeholder="C:\\GameServers\\Minecraft"
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
              <Label htmlFor="script">PowerShell Script</Label>
              <Textarea
                id="script"
                value={commandData.script || ""}
                onChange={(e) => setCommandData({ ...commandData, script: e.target.value })}
                placeholder="Get-Process | Where-Object { $_.Name -like '*minecraft*' }"
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
                ⚠️ Agent ist derzeit offline. Befehl wird gesendet sobald verbunden.
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
