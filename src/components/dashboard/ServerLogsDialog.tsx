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
  Loader2, 
  Terminal,
  Info,
  AlertTriangle,
  XCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

interface ServerLog {
  id: string;
  log_type: string;
  message: string;
  created_at: string;
}

interface ServerLogsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverId: string;
  serverName: string;
}

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
      
      const { data, error } = await api.getServerLogs(serverId);

      if (error) {
        console.error("Error fetching logs:", error);
      } else {
        setLogs(data || []);
      }
      setIsLoading(false);
    };

    fetchLogs();

    // Poll for updates every 3 seconds
    const pollInterval = setInterval(fetchLogs, 3000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [open, serverId]);

  const getLogIcon = (logType: string) => {
    switch (logType) {
      case "error":
        return <XCircle className="w-4 h-4 text-destructive" />;
      case "warning":
        return <AlertTriangle className="w-4 h-4 text-warning" />;
      default:
        return <Info className="w-4 h-4 text-primary" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="w-5 h-5" />
            Server-Logs: {serverName}
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
              <p>Keine Logs gefunden</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div 
                  key={log.id} 
                  className={cn(
                    "p-3 rounded-lg border font-mono text-sm",
                    log.log_type === "error" 
                      ? "border-destructive/30 bg-destructive/5" 
                      : log.log_type === "warning"
                      ? "border-warning/30 bg-warning/5"
                      : "border-border bg-card"
                  )}
                >
                  <div className="flex items-start gap-2">
                    {getLogIcon(log.log_type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground whitespace-pre-wrap break-all">
                        {log.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(log.created_at), { 
                          addSuffix: true, 
                          locale: de 
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
