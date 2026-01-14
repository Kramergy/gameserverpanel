import { useState, useRef, useEffect } from "react";
import { Send, Trash2, Download, Server, RefreshCw } from "lucide-react";
import { useServerLogs, ServerLog } from "@/hooks/useServerLogs";
import { useServerInstances } from "@/hooks/useServerInstances";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ConsoleViewProps {
  initialServerId?: string;
}

export function ConsoleView({ initialServerId }: ConsoleViewProps) {
  const [selectedServerId, setSelectedServerId] = useState<string | null>(initialServerId || null);
  const [command, setCommand] = useState("");
  const consoleRef = useRef<HTMLDivElement>(null);
  
  const { servers, isLoading: serversLoading } = useServerInstances();
  const { logs, isLoading: logsLoading, clearLogs, addLocalLog, fetchLogs } = useServerLogs(selectedServerId);

  // Auto-select first server if none selected
  useEffect(() => {
    if (!selectedServerId && servers && servers.length > 0) {
      setSelectedServerId(servers[0].id);
    }
  }, [servers, selectedServerId]);

  // Use initialServerId if provided
  useEffect(() => {
    if (initialServerId) {
      setSelectedServerId(initialServerId);
    }
  }, [initialServerId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  const handleSend = () => {
    if (!command.trim()) return;
    
    // Add command to local logs
    addLocalLog(`> ${command}`, 'command');
    
    // TODO: Send command to server via edge function
    // For now, just show that the command was entered
    
    setCommand("");
  };

  const handleDownload = () => {
    if (logs.length === 0) return;
    
    const logContent = logs.map(log => 
      `[${new Date(log.created_at).toLocaleTimeString("de-DE")}] [${log.log_type.toUpperCase()}] ${log.message}`
    ).join('\n');
    
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `server-logs-${selectedServerId}-${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getMessageColor = (type: ServerLog["log_type"]) => {
    switch (type) {
      case "error": return "text-destructive";
      case "warn": return "text-warning";
      case "success": return "text-success";
      case "command": return "text-primary";
      default: return "text-muted-foreground";
    }
  };

  const getLogTypeLabel = (type: ServerLog["log_type"]) => {
    switch (type) {
      case "error": return "FEHLER";
      case "warn": return "WARNUNG";
      case "success": return "OK";
      case "command": return "CMD";
      default: return "INFO";
    }
  };

  const selectedServer = servers?.find(s => s.id === selectedServerId);

  return (
    <div className="glass-card p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">Server Konsole</h3>
          
          {/* Server selector */}
          <Select
            value={selectedServerId || undefined}
            onValueChange={setSelectedServerId}
            disabled={serversLoading}
          >
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue placeholder="Server auswählen...">
                {selectedServer ? (
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4" />
                    <span className="truncate">{selectedServer.name}</span>
                  </div>
                ) : (
                  "Server auswählen..."
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {servers?.map((server) => (
                <SelectItem key={server.id} value={server.id}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      server.status === 'online' ? 'bg-success' :
                      server.status === 'installing' ? 'bg-warning' :
                      'bg-muted-foreground'
                    }`} />
                    <span>{server.name}</span>
                    <span className="text-muted-foreground text-xs">({server.game})</span>
                  </div>
                </SelectItem>
              ))}
              {(!servers || servers.length === 0) && (
                <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                  Keine Server vorhanden
                </div>
              )}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex gap-2">
          <button 
            className="p-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            onClick={fetchLogs}
            title="Aktualisieren"
          >
            <RefreshCw className={`w-4 h-4 ${logsLoading ? 'animate-spin' : ''}`} />
          </button>
          <button 
            className="p-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            onClick={handleDownload}
            disabled={logs.length === 0}
            title="Logs herunterladen"
          >
            <Download className="w-4 h-4" />
          </button>
          <button 
            className="p-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            onClick={clearLogs}
            title="Konsole leeren"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div 
        ref={consoleRef}
        className="console-output mb-4 h-80"
      >
        {!selectedServerId ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Bitte wählen Sie einen Server aus
          </div>
        ) : logsLoading && logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            Lade Logs...
          </div>
        ) : logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Keine Konsolenausgabe vorhanden
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex gap-3 py-0.5 font-mono text-sm">
              <span className="text-muted-foreground/60 shrink-0">
                [{new Date(log.created_at).toLocaleTimeString("de-DE", { 
                  hour: "2-digit", 
                  minute: "2-digit", 
                  second: "2-digit" 
                })}]
              </span>
              <span className={`shrink-0 w-16 ${getMessageColor(log.log_type)}`}>
                [{getLogTypeLabel(log.log_type)}]
              </span>
              <span className={getMessageColor(log.log_type)}>{log.message}</span>
            </div>
          ))
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder={selectedServerId ? "Befehl eingeben..." : "Server auswählen..."}
          disabled={!selectedServerId}
          className="flex-1 bg-secondary/50 border border-border rounded-lg px-4 py-2.5 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
        />
        <button 
          onClick={handleSend}
          disabled={!selectedServerId || !command.trim()}
          className="px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
