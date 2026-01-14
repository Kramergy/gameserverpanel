import { Play, Square, RotateCcw, Settings, Users, Cpu, HardDrive, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ServerInstance {
  id: string;
  name: string;
  game: string;
  gameIcon: string;
  status: "online" | "offline" | "starting";
  players: {
    current: number;
    max: number;
  };
  cpu: number;
  ram: number;
  network: {
    up: number;
    down: number;
  };
  uptime: string;
  ip: string;
  port: number;
}

interface ServerCardProps {
  server: ServerInstance;
  onSelect: (server: ServerInstance) => void;
}

export function ServerCard({ server, onSelect }: ServerCardProps) {
  const statusClasses = {
    online: "status-online",
    offline: "status-offline",
    starting: "status-starting",
  };

  const statusLabels = {
    online: "Online",
    offline: "Offline",
    starting: "Startet...",
  };

  return (
    <div 
      className="glass-card p-5 hover:border-primary/50 transition-all duration-300 cursor-pointer group animate-fade-in"
      onClick={() => onSelect(server)}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center text-2xl">
            {server.gameIcon}
          </div>
          <div>
            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
              {server.name}
            </h3>
            <p className="text-sm text-muted-foreground">{server.game}</p>
          </div>
        </div>
        <div className={cn(
          "px-3 py-1 rounded-full text-xs font-medium",
          statusClasses[server.status]
        )}>
          {statusLabels[server.status]}
        </div>
      </div>

      {/* Connection Info */}
      <div className="mb-4 p-3 bg-secondary/30 rounded-lg font-mono text-sm">
        <span className="text-muted-foreground">Connect: </span>
        <span className="text-foreground">{server.ip}:{server.port}</span>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="metric-card text-center">
          <Users className="w-4 h-4 mx-auto mb-1 text-primary" />
          <p className="text-xs text-muted-foreground">Spieler</p>
          <p className="text-sm font-semibold">{server.players.current}/{server.players.max}</p>
        </div>
        <div className="metric-card text-center">
          <Cpu className="w-4 h-4 mx-auto mb-1 text-primary" />
          <p className="text-xs text-muted-foreground">CPU</p>
          <p className="text-sm font-semibold">{server.cpu}%</p>
        </div>
        <div className="metric-card text-center">
          <HardDrive className="w-4 h-4 mx-auto mb-1 text-primary" />
          <p className="text-xs text-muted-foreground">RAM</p>
          <p className="text-sm font-semibold">{server.ram}%</p>
        </div>
        <div className="metric-card text-center">
          <Wifi className="w-4 h-4 mx-auto mb-1 text-primary" />
          <p className="text-xs text-muted-foreground">Netzwerk</p>
          <p className="text-sm font-semibold">{server.network.up}↑</p>
        </div>
      </div>

      {/* Progress Bars */}
      <div className="space-y-2 mb-4">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">CPU Auslastung</span>
            <span className={cn(
              server.cpu > 80 ? "text-destructive" : server.cpu > 60 ? "text-warning" : "text-success"
            )}>{server.cpu}%</span>
          </div>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full rounded-full transition-all duration-500",
                server.cpu > 80 ? "bg-destructive" : server.cpu > 60 ? "bg-warning" : "bg-success"
              )}
              style={{ width: `${server.cpu}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">RAM Auslastung</span>
            <span className={cn(
              server.ram > 80 ? "text-destructive" : server.ram > 60 ? "text-warning" : "text-success"
            )}>{server.ram}%</span>
          </div>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full rounded-full transition-all duration-500",
                server.ram > 80 ? "bg-destructive" : server.ram > 60 ? "bg-warning" : "bg-success"
              )}
              style={{ width: `${server.ram}%` }}
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-3 border-t border-border/50">
        <span className="text-xs text-muted-foreground">Uptime: {server.uptime}</span>
        <div className="flex gap-2">
          {server.status === "online" ? (
            <button className="p-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors">
              <Square className="w-4 h-4" />
            </button>
          ) : (
            <button className="p-2 rounded-lg bg-success/10 text-success hover:bg-success/20 transition-colors">
              <Play className="w-4 h-4" />
            </button>
          )}
          <button className="p-2 rounded-lg bg-warning/10 text-warning hover:bg-warning/20 transition-colors">
            <RotateCcw className="w-4 h-4" />
          </button>
          <button className="p-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
