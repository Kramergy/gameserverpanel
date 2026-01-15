import { Play, Square, RotateCcw, Settings, Users, Cpu, HardDrive, Wifi, Trash2, Loader2, Server, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { ServerLogsDialog } from "./ServerLogsDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ServerInstance {
  id: string;
  name: string;
  game: string;
  game_icon: string;
  status: "online" | "offline" | "starting" | "stopping" | "restarting" | "installing" | "error";
  current_players: number;
  max_players: number;
  cpu_usage: number;
  ram_usage: number;
  ip: string;
  port: number;
  ram_allocated: number;
  created_at: string;
  updated_at: string;
  user_id: string;
  install_path: string | null;
}

interface ServerCardProps {
  server: ServerInstance;
  onSelect: (server: ServerInstance) => void;
  onStart: (serverId: string) => void;
  onStop: (serverId: string) => void;
  onRestart: (serverId: string) => void;
  onDelete: (serverId: string) => void;
}

export function ServerCard({ server, onSelect, onStart, onStop, onRestart, onDelete }: ServerCardProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);
  
  const statusClasses: Record<string, string> = {
    online: "status-online",
    offline: "status-offline",
    starting: "status-starting",
    stopping: "status-starting",
    restarting: "status-starting",
    installing: "status-starting",
    error: "bg-destructive/10 text-destructive",
  };

  const statusLabels: Record<string, string> = {
    online: "Online",
    offline: "Offline",
    starting: "Startet...",
    stopping: "Stoppt...",
    restarting: "Neustart...",
    installing: "Installiert...",
    error: "Fehler",
  };

  const isLoading = server.status === "starting" || server.status === "installing" || server.status === "stopping" || server.status === "restarting";
  const canStart = server.status === "offline";

  const handleAction = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
  };

  return (
    <>
      <div 
        className="glass-card p-5 hover:border-primary/50 transition-all duration-300 cursor-pointer group animate-fade-in"
        onClick={() => onSelect(server)}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center text-2xl">
              {server.game_icon}
            </div>
            <div>
              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                {server.name}
              </h3>
              <p className="text-sm text-muted-foreground">{server.game}</p>
            </div>
          </div>
          <div className={cn(
            "px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5",
            statusClasses[server.status]
          )}>
            {isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
            {statusLabels[server.status]}
          </div>
        </div>

        {/* Connection Info */}
        <div className="mb-4 p-3 bg-secondary/30 rounded-lg">
          <div className="font-mono text-sm">
            <span className="text-muted-foreground">Connect: </span>
            <span className="text-foreground">{server.ip}:{server.port}</span>
          </div>
          {server.install_path && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
              <Server className="w-3 h-3" />
              <span className="font-mono truncate">{server.install_path}</span>
            </div>
          )}
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="metric-card text-center">
            <Users className="w-4 h-4 mx-auto mb-1 text-primary" />
            <p className="text-xs text-muted-foreground">Spieler</p>
            <p className="text-sm font-semibold">{server.current_players}/{server.max_players}</p>
          </div>
          <div className="metric-card text-center">
            <Cpu className="w-4 h-4 mx-auto mb-1 text-primary" />
            <p className="text-xs text-muted-foreground">CPU</p>
            <p className="text-sm font-semibold">{server.cpu_usage}%</p>
          </div>
          <div className="metric-card text-center">
            <HardDrive className="w-4 h-4 mx-auto mb-1 text-primary" />
            <p className="text-xs text-muted-foreground">RAM</p>
            <p className="text-sm font-semibold">{server.ram_usage}%</p>
          </div>
          <div className="metric-card text-center">
            <Wifi className="w-4 h-4 mx-auto mb-1 text-primary" />
            <p className="text-xs text-muted-foreground">RAM</p>
            <p className="text-sm font-semibold">{server.ram_allocated} MB</p>
          </div>
        </div>

        {/* Progress Bars */}
        <div className="space-y-2 mb-4">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">CPU Auslastung</span>
              <span className={cn(
                server.cpu_usage > 80 ? "text-destructive" : server.cpu_usage > 60 ? "text-warning" : "text-success"
              )}>{server.cpu_usage}%</span>
            </div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <div 
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  server.cpu_usage > 80 ? "bg-destructive" : server.cpu_usage > 60 ? "bg-warning" : "bg-success"
                )}
                style={{ width: `${server.cpu_usage}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">RAM Auslastung</span>
              <span className={cn(
                server.ram_usage > 80 ? "text-destructive" : server.ram_usage > 60 ? "text-warning" : "text-success"
              )}>{server.ram_usage}%</span>
            </div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <div 
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  server.ram_usage > 80 ? "bg-destructive" : server.ram_usage > 60 ? "bg-warning" : "bg-success"
                )}
                style={{ width: `${server.ram_usage}%` }}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-border/50">
          <span className="text-xs text-muted-foreground">
            Erstellt: {new Date(server.created_at).toLocaleDateString("de-DE")}
          </span>
          <div className="flex gap-2">
            {server.status === "online" ? (
              <button 
                onClick={(e) => handleAction(e, () => onStop(server.id))}
                className="p-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                title="Stoppen"
              >
                <Square className="w-4 h-4" />
              </button>
            ) : (
              <button 
                onClick={(e) => handleAction(e, () => onStart(server.id))}
                disabled={isLoading || server.status === "error"}
                className="p-2 rounded-lg bg-success/10 text-success hover:bg-success/20 transition-colors disabled:opacity-50"
                title="Starten"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              </button>
            )}
            <button 
              onClick={(e) => handleAction(e, () => onRestart(server.id))}
              disabled={server.status === "offline" || isLoading}
              className="p-2 rounded-lg bg-warning/10 text-warning hover:bg-warning/20 transition-colors disabled:opacity-50"
              title="Neustarten"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button 
              onClick={(e) => handleAction(e, () => setDeleteDialogOpen(true))}
              className="p-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
              title="Löschen"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button 
              onClick={(e) => handleAction(e, () => setLogsDialogOpen(true))}
              className="p-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Timeline / Logs"
            >
              <FileText className="w-4 h-4" />
            </button>
            <button 
              className="p-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Einstellungen"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Server löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchtest du den Server "{server.name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onDelete(server.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ServerLogsDialog
        open={logsDialogOpen}
        onOpenChange={setLogsDialogOpen}
        serverId={server.id}
        serverName={server.name}
      />
    </>
  );
}
