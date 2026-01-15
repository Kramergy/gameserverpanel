import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Loader2, 
  Download, 
  Play, 
  Square,
  AlertTriangle,
  Terminal
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

interface ServerLog {
  id: string;
  command_type: string;
  status: string;
  created_at: string;
  executed_at: string | null;
  result: any;
  command_data: any;
}

interface ServerLogsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverId: string;
  serverName: string;
}

const commandLabels: Record<string, string> = {
  install_gameserver: "Server Installation",
  start_gameserver: "Server Start",
  stop_gameserver: "Server Stop",
  restart_gameserver: "Server Neustart",
  get_system_info: "System Info",
  ping: "Verbindungstest",
};

const commandIcons: Record<string, React.ReactNode> = {
  install_gameserver: <Download className="w-4 h-4" />,
  start_gameserver: <Play className="w-4 h-4" />,
  stop_gameserver: <Square className="w-4 h-4" />,
  restart_gameserver: <Play className="w-4 h-4" />,
  get_system_info: <Terminal className="w-4 h-4" />,
  ping: <Terminal className="w-4 h-4" />,
};

export function ServerLogsDialog({ 
  open, 
  onOpenChange, 
  serverId, 
  serverName 
}: ServerLogsDialogProps) {
  const [logs, setLogs] = useState<ServerLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!open || !serverId) return;

    const fetchLogs = async () => {
      setIsLoading(true);
      
      const { data, error } = await api.getServerCommands(serverId);

      if (error) {
        console.error("Error fetching logs:", error);
      } else {
        setLogs(data || []);
      }
      setIsLoading(false);
    };

    fetchLogs();

    // Poll for updates every 3 seconds (since we don't have WebSockets)
    const pollInterval = setInterval(fetchLogs, 3000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [open, serverId]);

  const getStatusIcon = (status: string, result: any) => {
    if (status === "pending") {
      return <Clock className="w-5 h-5 text-muted-foreground" />;
    }
    if (status === "sent") {
      return <Loader2 className="w-5 h-5 text-primary animate-spin" />;
    }
    if (status === "completed") {
      if (result?.success === false || result?.error) {
        return <XCircle className="w-5 h-5 text-destructive" />;
      }
      return <CheckCircle2 className="w-5 h-5 text-success" />;
    }
    if (status === "failed") {
      return <XCircle className="w-5 h-5 text-destructive" />;
    }
    return <AlertTriangle className="w-5 h-5 text-warning" />;
  };

  const getStatusLabel = (status: string, result: any) => {
    if (status === "pending") return "Ausstehend";
    if (status === "sent") return "Wird ausgeführt...";
    if (status === "completed") {
      if (result?.success === false || result?.error) return "Fehlgeschlagen";
      return "Erfolgreich";
    }
    if (status === "failed") return "Fehlgeschlagen";
    return status;
  };

  const extractErrorMessage = (result: any): string | null => {
    if (!result) return null;
    
    if (result.error) return result.error;
    if (result.output?.error) return result.output.error;
    if (result.message) return result.message;
    if (typeof result === "string") return result;
    
    // Check for common error patterns
    if (result.output && typeof result.output === "string" && result.output.includes("error")) {
      return result.output;
    }
    
    return null;
  };

  const extractSuccessInfo = (log: ServerLog): string | null => {
    if (log.command_type === "install_gameserver" && log.result?.output?.installPath) {
      return `Installiert in: ${log.result.output.installPath}`;
    }
    if (log.result?.output?.success) {
      return "Erfolgreich abgeschlossen";
    }
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="w-5 h-5" />
            Server-Timeline: {serverName}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[500px] pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Terminal className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Keine Aktivitäten gefunden</p>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[22px] top-2 bottom-2 w-0.5 bg-border" />
              
              <div className="space-y-4">
                {logs.map((log, index) => {
                  const errorMessage = extractErrorMessage(log.result);
                  const successInfo = extractSuccessInfo(log);
                  const isError = log.status === "failed" || errorMessage;
                  const isRunning = log.status === "sent";
                  const isPending = log.status === "pending";
                  
                  return (
                    <div key={log.id} className="relative pl-12">
                      {/* Status icon on timeline */}
                      <div className={cn(
                        "absolute left-0 w-11 h-11 rounded-full flex items-center justify-center",
                        isError ? "bg-destructive/10" : 
                        isRunning ? "bg-primary/10" :
                        isPending ? "bg-muted" :
                        "bg-success/10"
                      )}>
                        {getStatusIcon(log.status, log.result)}
                      </div>
                      
                      {/* Content card */}
                      <div className={cn(
                        "p-4 rounded-lg border",
                        isError ? "border-destructive/30 bg-destructive/5" :
                        isRunning ? "border-primary/30 bg-primary/5" :
                        "border-border bg-card"
                      )}>
                        {/* Header */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">
                              {commandIcons[log.command_type] || <Terminal className="w-4 h-4" />}
                            </span>
                            <span className="font-medium">
                              {commandLabels[log.command_type] || log.command_type}
                            </span>
                          </div>
                          <span className={cn(
                            "text-xs px-2 py-1 rounded-full",
                            isError ? "bg-destructive/10 text-destructive" :
                            isRunning ? "bg-primary/10 text-primary" :
                            isPending ? "bg-muted text-muted-foreground" :
                            "bg-success/10 text-success"
                          )}>
                            {getStatusLabel(log.status, log.result)}
                          </span>
                        </div>
                        
                        {/* Timestamp */}
                        <p className="text-xs text-muted-foreground mb-2">
                          {formatDistanceToNow(new Date(log.created_at), { 
                            addSuffix: true, 
                            locale: de 
                          })}
                          {log.executed_at && (
                            <span className="ml-2">
                              • Ausgeführt: {formatDistanceToNow(new Date(log.executed_at), { 
                                addSuffix: true, 
                                locale: de 
                              })}
                            </span>
                          )}
                        </p>
                        
                        {/* Error message */}
                        {errorMessage && (
                          <div className="mt-2 p-3 rounded bg-destructive/10 border border-destructive/20">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-sm font-medium text-destructive">Fehler</p>
                                <p className="text-sm text-destructive/80 mt-1 font-mono break-all">
                                  {errorMessage}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* Success info */}
                        {!errorMessage && successInfo && log.status === "completed" && (
                          <div className="mt-2 p-3 rounded bg-success/10 border border-success/20">
                            <p className="text-sm text-success">{successInfo}</p>
                          </div>
                        )}
                        
                        {/* Running indicator */}
                        {isRunning && (
                          <div className="mt-2 flex items-center gap-2 text-sm text-primary">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Befehl wird ausgeführt...</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}